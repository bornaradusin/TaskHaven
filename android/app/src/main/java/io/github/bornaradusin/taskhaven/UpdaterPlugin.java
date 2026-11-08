package io.github.bornaradusin.taskhaven;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Updates from GitHub, on Android: downloads a release's APK into the app's cache, checks it against
 * its SHA-256 and opens Android's installer. The APK is deleted once the update is in
 * ({@link UpdateCleaner}), and leftovers when the app starts. Which release to get is decided in
 * src/update.ts.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    static final String FOLDER = "updates";

    @Override
    public void load() {
        new Thread(() -> cleanLeftovers(getContext())).start();
    }

    /** Whether Android lets the app install apps (asked once, in the system's settings). */
    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject out = new JSObject();
        out.put("allowed", allowed);
        call.resolve(out);
    }

    /** Opens the system's switch that lets the app install its updates. */
    @PluginMethod
    public void allowInstalls(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /**
     * Downloads {url} as {name}, reporting "progress" ({fraction}). Checked against {sha256}, or the
     * line for {name} in the release's checksums file at {sumsUrl}. Resolves with the file's {path}.
     */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String name = call.getString("name");
        if (url == null || name == null || !name.matches("[\\w.()-]+\\.apk")) {
            call.reject("Nothing to download");
            return;
        }
        String sha256 = call.getString("sha256");
        String sumsUrl = call.getString("sumsUrl");
        new Thread(() -> {
            File dir = new File(getContext().getCacheDir(), FOLDER);
            File partial = new File(dir, name + ".part");
            try {
                String expected = sha256 != null ? sha256.toLowerCase(Locale.ROOT) : (sumsUrl != null ? checksumFor(sumsUrl, name) : null);
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
                    f.delete();
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                HttpURLConnection connection = open(url);
                try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(partial)) {
                    long total = connection.getContentLengthLong();
                    byte[] buffer = new byte[64 * 1024];
                    long done = 0;
                    long lastReport = 0;
                    int n;
                    while ((n = in.read(buffer)) >= 0) {
                        out.write(buffer, 0, n);
                        digest.update(buffer, 0, n);
                        done += n;
                        long now = System.currentTimeMillis();
                        if (total > 0 && now - lastReport > 150) {
                            lastReport = now;
                            JSObject progress = new JSObject();
                            progress.put("fraction", Math.min(1.0, done / (double) total));
                            notifyListeners("progress", progress);
                        }
                    }
                } finally {
                    connection.disconnect();
                }
                String actual = hex(digest.digest());
                if (expected != null && !expected.equals(actual)) {
                    //noinspection ResultOfMethodCallIgnored
                    partial.delete();
                    call.reject("The download doesn't match the release's checksum", "checksum");
                    return;
                }
                File apk = new File(dir, name);
                if (!partial.renameTo(apk)) throw new IOException("Couldn't keep the download");
                JSObject out = new JSObject();
                out.put("path", apk.getAbsolutePath());
                call.resolve(out);
            } catch (Exception e) {
                //noinspection ResultOfMethodCallIgnored
                partial.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : "The download didn't finish", "download", e);
            }
        }).start();
    }

    /** Opens Android's installer for a downloaded APK. */
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        File dir = new File(getContext().getCacheDir(), FOLDER);
        File apk = path == null ? null : new File(path);
        if (apk == null || !apk.exists() || !dir.getAbsolutePath().equals(apk.getParentFile() == null ? null : apk.getParentFile().getAbsolutePath())) {
            call.reject("The update isn't downloaded");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Android's installer didn't open", e);
        }
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        connection.setRequestProperty("User-Agent", "TaskHaven (+https://github.com/bornaradusin/TaskHaven)");
        connection.setInstanceFollowRedirects(true);
        int code = connection.getResponseCode();
        if (code < 200 || code >= 300) {
            connection.disconnect();
            throw new IOException("GitHub answered " + code);
        }
        return connection;
    }

    /** The SHA-256 listed for {name} in a sha256sum file, or null if it isn't there. */
    private static String checksumFor(String sumsUrl, String name) throws IOException {
        HttpURLConnection connection = open(sumsUrl);
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.trim().split("\\s+");
                if (parts.length >= 2 && parts[parts.length - 1].replaceFirst("^\\*", "").equals(name)) return parts[0].toLowerCase(Locale.ROOT);
            }
            return null;
        } finally {
            connection.disconnect();
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder();
        for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b));
        return out.toString();
    }

    /** Deletes every downloaded update (once one is installed). */
    static void clean(Context context) {
        File[] files = new File(context.getCacheDir(), FOLDER).listFiles();
        if (files != null) for (File f : files) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    /**
     * When the app starts: deletes APKs of this version or older (already installed) and any left from
     * an install given up a day ago. Not all of them: Android may start the app just so its installer
     * can read the one it's installing.
     */
    static void cleanLeftovers(Context context) {
        File[] files = new File(context.getCacheDir(), FOLDER).listFiles();
        if (files == null) return;
        long dayAgo = System.currentTimeMillis() - 24L * 3600 * 1000;
        for (File f : files) {
            Matcher m = Pattern.compile("(\\d+(\\.\\d+)+)").matcher(f.getName());
            boolean newer = m.find() && isNewer(m.group(1), installedVersion(context));
            if (!newer || f.lastModified() < dayAgo || f.getName().endsWith(".part")) //noinspection ResultOfMethodCallIgnored
                f.delete();
        }
    }

    /** This app's version, as Android has it (package.json's, see app/build.gradle). */
    static String installedVersion(Context context) {
        try {
            String name = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
            return name != null ? name : "0";
        } catch (Exception e) {
            return "0";
        }
    }

    static boolean isNewer(String a, String b) {
        String[] x = a.split("[.\\-+]");
        String[] y = b.split("[.\\-+]");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int d = number(i < x.length ? x[i] : "0") - number(i < y.length ? y[i] : "0");
            if (d != 0) return d > 0;
        }
        return false;
    }

    private static int number(String part) {
        Matcher m = Pattern.compile("^\\d+").matcher(part);
        return m.find() ? Integer.parseInt(m.group()) : 0;
    }
}
