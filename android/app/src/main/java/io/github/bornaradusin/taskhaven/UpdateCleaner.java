package io.github.bornaradusin.taskhaven;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Just updated: the downloaded APK isn't needed any more. */
public class UpdateCleaner extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) UpdaterPlugin.clean(context);
    }
}
