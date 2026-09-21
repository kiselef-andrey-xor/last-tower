#!/usr/bin/env bash
# =========================================================
#  Сборка APK без Gradle: aapt2 + javac + d8 + zipalign + apksigner
#  Требует: JDK 17, Android SDK (build-tools 34, platform 34)
#  Использование: ./build-apk.sh
#  Результат: build/last-tower.apk
# =========================================================
set -e
cd "$(dirname "$0")"

SDK="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
BT="$SDK/build-tools/34.0.0"
AJ="$SDK/platforms/android-34/android.jar"
OUT=build
PKG=com/kiselef/lasttower

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/obj" "$OUT/dex"

echo "[1/7] aapt2 compile: ресурсы"
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"

echo "[2/7] aapt2 link: манифест + ассеты + R.java"
"$BT/aapt2" link -o "$OUT/base.apk" \
  -I "$AJ" \
  --manifest AndroidManifest.xml \
  --java "$OUT/gen" \
  -A assets \
  "$OUT/res.zip"

echo "[3/7] javac: MainActivity + R.java"
javac --release 11 \
  -classpath "$AJ" \
  -d "$OUT/obj" \
  "src/$PKG/MainActivity.java" \
  "$OUT/gen/$PKG/R.java"

echo "[4/7] d8: классы в dex"
"$BT/d8" --release --min-api 21 --lib "$AJ" \
  --output "$OUT/dex" \
  $(find "$OUT/obj" -name '*.class')

echo "[5/7] упаковка classes.dex в apk + zipalign"
(cd "$OUT/dex" && zip -q ../base.apk classes.dex)
"$BT/zipalign" -f 4 "$OUT/base.apk" "$OUT/aligned.apk"

echo "[6/7] подпись"
if [ ! -f release.keystore ]; then
  keytool -genkeypair -keystore release.keystore -alias lasttower \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass lasttower -keypass lasttower \
    -dname "CN=Last Tower, OU=Games, O=Kiselef, C=RU"
  echo "    (keystore создан: release.keystore, пароль: lasttower — СОХРАНИТЕ ЕГО для обновлений)"
fi
"$BT/apksigner" sign \
  --ks release.keystore --ks-pass pass:lasttower --key-pass pass:lasttower \
  --out "$OUT/last-tower.apk" "$OUT/aligned.apk"

echo "[7/7] проверка"
"$BT/apksigner" verify --print-certs "$OUT/last-tower.apk" | head -4
"$BT/aapt2" dump badging "$OUT/last-tower.apk" | grep -E "package|sdkVersion|application-label|launchable" | head -5
du -h "$OUT/last-tower.apk"
echo "ГОТОВО: $OUT/last-tower.apk"
