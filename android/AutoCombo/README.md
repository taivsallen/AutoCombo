# AutoCombo Android floating screen helper

This Android APK is a background floating helper for the 6x6 orb solver.

## Runtime flow

1. Open the app once.
2. Grant **Display over other apps** permission.
3. Grant the Android screen-capture prompt.
4. Return to the target app. The AutoCombo floating icon stays above it.
5. Tap the icon to open Settings, Detect & calculate, or Top10.

The screen-capture session runs in a mediaProjection foreground service. The path is drawn in a separate full-screen, non-touchable overlay, so it does not consume touches intended for the app underneath.

## Included solver controls

- Start and end positions, with Auto as the default.
- Expected first-clear combo target.
- Shield condition and target count.
- Steps-first or Combo-first mode.
- Step limit, diagonal movement, Skyfall, and top buffer row.
- Top 10 result selection with final board, steps, combo count, and projected route.

## APK

`app/build/outputs/apk/debug/app-debug.apk`

Install with USB debugging:

```powershell
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Build

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat assembleDebug
```

The generated APK is a debug build for testing. A production release still needs a release keystore, privacy disclosures, store assets, and device testing on the target app/game.
# AutoCombo Android

## Recognition templates

The App.jsx-compatible recognizer accepts additional orb screenshots from
`app/src/main/assets/recognition_templates/` when building the APK. Put each
variant in its matching `water`, `fire`, `earth`, `light`, `dark`, or `heart`
folder.

For a running APK, the same folders are created under:

`Android/data/com.comboauto.android/files/recognition_templates/`

Supported formats are PNG, JPG/JPEG, and WEBP. SEARCH detects file changes and
rebuilds the cached feature/template table automatically.
