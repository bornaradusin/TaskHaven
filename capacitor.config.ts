import type { CapacitorConfig } from '@capacitor/cli'

// The Android app: TaskHaven's web pages (dist/) in a web view, with notifications.
const config: CapacitorConfig = {
  appId: 'io.github.bornaradusin.taskhaven',
  appName: 'TaskHaven',
  webDir: 'dist',
  android: {
    // the app's pages load from its own files; the server is reached through Android (data/http.ts)
    allowMixedContent: false,
  },
  plugins: {
    // The page runs under the status bar (edge to edge) and keeps clear of it itself
    // (env(safe-area-inset-*) in styles.css); older web views get room made for them instead.
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_taskhaven',
      iconColor: '#F2683A',
    },
  },
}

export default config
