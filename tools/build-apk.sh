#!/bin/sh
# Builds the TaskHaven APK on a Linux machine
# (CT108): tests, the web app, then Android.
#   sh tools/build-apk.sh            build (Java 21, Node 22+ and the Android SDK needed)
#   sh tools/build-apk.sh --setup    first, fetch the Android command-line tools into $ANDROID_HOME
# The APK lands in /mnt/media/builder/releases/taskhaven (or $RELEASES). Signed with your key when
# TASKHAVEN_KEYSTORE and TASKHAVEN_KEYSTORE_PASSWORD are set; a debug build otherwise.
set -eu
cd "$(dirname "$0")/.."
ANDROID_HOME=${ANDROID_HOME:-/mnt/media/builder/android-sdk}
RELEASES=${RELEASES:-/mnt/media/builder/releases/taskhaven}
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Needs $1: $2" >&2; exit 1; }; }

if [ "${1:-}" = "--setup" ]; then
  need curl "apt install curl"
  need unzip "apt install unzip"
  need java "apt install openjdk-21-jdk-headless"
  # Google's command-line tools; if this one is gone, the newest is listed at
  # https://developer.android.com/studio#command-line-tools-only
  tools=commandlinetools-linux-13114758_latest.zip
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  curl -fL "https://dl.google.com/android/repository/$tools" -o "/tmp/$tools"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest" "$ANDROID_HOME/cmdline-tools/cmdline-tools"
  unzip -q "/tmp/$tools" -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null
  "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
  echo "Android SDK ready in $ANDROID_HOME."
  exit 0
fi

need java "apt install openjdk-21-jdk-headless"
need npm "install Node 22 or later"
[ -d "$ANDROID_HOME/cmdline-tools" ] || { echo "No Android SDK in $ANDROID_HOME: run sh tools/build-apk.sh --setup first." >&2; exit 1; }

npm ci
npm test
npm run build
npx cap sync android
version=$(node -p "require('./package.json').version")
mkdir -p "$RELEASES"
cd android
chmod +x gradlew
if [ -n "${TASKHAVEN_KEYSTORE:-}" ]; then
  ./gradlew --no-daemon assembleRelease
  apk="$RELEASES/TaskHaven-$version.apk"
  cp app/build/outputs/apk/release/app-release.apk "$apk"
else
  echo "No TASKHAVEN_KEYSTORE: a debug build (fine to try; set a key before sharing it)."
  ./gradlew --no-daemon assembleDebug
  apk="$RELEASES/TaskHaven-$version-debug.apk"
  cp app/build/outputs/apk/debug/app-debug.apk "$apk"
fi
cd "$RELEASES" && sha256sum "$(basename "$apk")" >> SHA256SUMS.txt
echo "Built $apk"
