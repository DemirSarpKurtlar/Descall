# Descall Android release

The Android app uses Capacitor and the package ID `com.descall.app`.

Google Play builds (signed AAB + universal APK) come from
`.github/workflows/android-build.yml`; owner steps, store listing drafts and the
App Links `assetlinks.json` template are in `docs/play-store/`.
`versionName` follows `frontend/package.json`; `versionCode` is passed by CI
(`-PdescallVersionCode`) and derived from the version for local builds.

## Local development

```bash
npm run android:sync
npm run android:apk:debug
```

The debug APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Secure direct-release APK

Create a durable signing key once and store its password in a password manager:

```bash
keytool -genkeypair -v \
  -keystore ../secrets/descall-release.jks \
  -alias descall-release \
  -keyalg RSA -keysize 4096 -validity 10000
```

Copy `keystore.properties.example` to `keystore.properties`, replace every
placeholder, then run:

```bash
npm run android:apk:release
```

Never commit the keystore, `keystore.properties`, or a Firebase
`google-services.json`. Losing the signing key prevents future updates to
the same Android application.

## Firebase stage

When the Descall Firebase project is created, add its Android app with
package ID `com.descall.app` and download `google-services.json` into
`android/app/` (CI: the `ANDROID_GOOGLE_SERVICES_JSON` secret). The
google-services Gradle plugin is applied only when that file exists. Without
it the app still runs and skips push registration (`DescallPushConfigPlugin`),
because `@capacitor/push-notifications` crashes when Firebase is missing.
