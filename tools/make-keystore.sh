#!/bin/sh
# Makes TaskHaven's signing key, once. Keep the .jks file and its password safe (and backed up):
# every update has to be signed with the same key, or phones won't install it over the old one.
# Needs keytool (in any Java: apt install openjdk-21-jre-headless).
#   sh tools/make-keystore.sh [file]
set -eu
out=${1:-taskhaven-release.jks}
if [ -e "$out" ]; then echo "$out is there already: keep using it." >&2; exit 1; fi
printf 'A password for the key (at least 6 characters): '
stty -echo 2>/dev/null || true
read -r password
stty echo 2>/dev/null || true
echo
keytool -genkeypair -keystore "$out" -storetype PKCS12 -alias taskhaven -keyalg RSA -keysize 4096 -validity 36500 \
  -storepass "$password" -keypass "$password" -dname "CN=TaskHaven" >/dev/null
echo "Made $out."
echo
echo "For GitHub (repository → Settings → Secrets and variables → Actions → New repository secret):"
echo "  ANDROID_KEYSTORE_BASE64   the text in $out.base64.txt"
echo "  ANDROID_KEYSTORE_PASSWORD the password you just typed"
base64 -w0 "$out" > "$out.base64.txt" 2>/dev/null || base64 "$out" | tr -d '\n' > "$out.base64.txt"
