# Capacitor Mobile Builder — Android and iOS

A shared TypeScript packaging tool for Capacitor projects. Choose Android, iOS or both. It runs the web build once, syncs the requested native platforms, and exports artifacts using Gradle or Xcode. Existing Android commands remain compatible; the legacy `android-build` executable remains available.

It does not contain application code, install SDKs, change application IDs or signing keys, bump versions, upload to app stores or deploy websites.

## Setup

Requires Node.js 22.12+, installed application dependencies and a prepared Capacitor native project for each selected platform. Android needs its SDK and compatible JDK; SDK API 36 is the configurable default. iOS needs macOS and full Xcode, with signing configured for device/IPA outputs.

Clone the tool beside your application checkout, then install and compile it:

```sh
git clone https://github.com/alirni/capacitor-mobile-builder.git
cd capacitor-mobile-builder
npm exec --yes --package=pnpm@11.28.9 -- pnpm install --frozen-lockfile
npm run build
npm test
```

Re-run `npm run build` after editing the tool source. Generated `dist/` and dependencies are excluded from Git. The source repository is public; `private: true` in package.json prevents accidental npm publication. The package is not published to npm.

## Configure an application

With the tool and application in sibling directories, add commands and settings to the application's `package.json`:

```json
{
  "scripts": {
    "build": "your existing web build command",
    "android:plan": "node ../capacitor-mobile-builder/dist/src/cli.js apk --dry-run",
    "android:sync": "node ../capacitor-mobile-builder/dist/src/cli.js sync",
    "android:apk": "node ../capacitor-mobile-builder/dist/src/cli.js apk",
    "android:bundle": "node ../capacitor-mobile-builder/dist/src/cli.js bundle"
  },
  "androidBuild": {
    "artifactName": "ExampleApp",
    "sdkApi": 36
  }
}
```

These names are illustrative. Only Android commands require the sibling tool; ordinary web installs/builds remain independent.

## Use

From the application directory:

```sh
npm run android:plan                 # validate and print steps only
npm run android:sync                 # web build + Capacitor sync
npm run android:apk                  # debug testing APK
npm run android:bundle               # release AAB
npm run android:apk -- --offline     # prohibit Gradle dependency downloads
npm run android:apk -- --online      # override configured offline mode
```

Or invoke the compiled CLI directly:

```sh
node /path/to/capacitor-mobile-builder/dist/src/cli.js apk --project /path/to/application --dry-run
```

`--dry-run` validates configuration, the Capacitor CLI, the wrapper and required SDK paths. It prints planned commands and artifact paths without executing builds/sync/Gradle or creating output/cache directories. On macOS it may read the installed JDK location with `java_home`. It never serializes the inherited environment or signing values. It does not prove that a real Gradle build or device installation will succeed.

The existing application build script owns framework-specific preparation and type checks. The tool uses that application's installed Capacitor CLI and native Gradle wrapper. Subprocess arguments preserve paths containing spaces.

## Configuration

| Field | Default / purpose |
| --- | --- |
| `artifactName` | Required filename prefix, e.g. `ExampleApp` |
| `buildScript` | `build`, package script run before sync |
| `androidDir` | `android`, existing native Android project |
| `outputDir` | `exports`, artifact destination |
| `sdkApi` | `36`, required installed SDK platform |
| `sdkPath` | Optional project-relative or absolute SDK path |
| `gradleUserHome` | `.gradle-user`, optional cache location |
| `androidUserHome` | `.android-user`, per-application native settings/debug key location |
| `offline` | `false`; CLI `--offline`/`--online` overrides it |
| `signingEnvPrefix` | Optional prefix for four existing Gradle signing variables |

Caller `ANDROID_HOME`/`ANDROID_SDK_ROOT`, `JAVA_HOME`, `GRADLE_USER_HOME` and `ANDROID_USER_HOME` take priority. SDK discovery checks the configured path, the application's `.android-sdk` and standard user SDK locations. Relative paths resolve against the application root, not the caller's working directory. SDK/cache locations are configured by each consumer; no application-specific paths belong in the shared tool.

APK uses `assembleDebug`, producing `<artifactName>-<version>-debug.apk`. AAB uses `bundleRelease`, producing `<artifactName>-<version>-release.aab` or a filename ending in `-release-unsigned.aab`. The tool reads the version from package.json; native versionName/versionCode remain the application's responsibility.

For example, `signingEnvPrefix: "EXAMPLE"` uses `EXAMPLE_KEYSTORE`, `EXAMPLE_STORE_PASSWORD`, `EXAMPLE_KEY_ALIAS` and `EXAMPLE_KEY_PASSWORD`. Set all four or none. Values are passed to the application's existing Gradle signing configuration. The tool does not create keys or configure Gradle signing for a new application. Never put secret values in package.json or command-line arguments.

## Verification

Tests cover non-mutating planning, SDK/cache precedence, signing-value redaction, incomplete signing settings, offline mode, Windows command planning, spaced paths, sync-only operation, failure handling and artifact publication. An integration test uses disposable fixture programs to exercise subprocess execution and export; it does not build a real Android application.

All examples and fixtures are intentionally generic and do not identify consuming projects.

## iOS and combined builds (0.2.0)

The CLI also accepts `--platform android|ios|all`. `build` defaults to APK for Android and IPA for iOS. Use `--android-format bundle` for AAB, or `--ios-mode simulator|archive|ipa` to choose an iOS product. `mobile-build` is a second executable name; `android-build` and the existing compiled CLI path remain valid.

From an application directory with the sibling tool compiled:

```sh
node ../capacitor-mobile-builder/dist/src/cli.js build --platform android --dry-run
node ../capacitor-mobile-builder/dist/src/cli.js simulator --dry-run
node ../capacitor-mobile-builder/dist/src/cli.js ipa --dry-run
node ../capacitor-mobile-builder/dist/src/cli.js build --platform all --dry-run
node ../capacitor-mobile-builder/dist/src/cli.js build --platform all --ios-mode simulator --dry-run
```

These examples only validate plans. Removing `--dry-run` runs the actual build. iOS requires macOS, full Xcode, a prepared Capacitor iOS project and appropriate signing for device/IPA outputs. A simulator `.app` is unsigned and is not an installable iPhone IPA. See [iOS setup and output configuration](docs/ios.md).

Combined builds preflight both platforms before running anything, reuse one web build and publish no artifact if a build command or artifact validation fails. IPA export is local: the generated export settings fix `destination` to `export`, disable version management/symbol upload, and never issue an App Store upload. Provisioning updates are disabled unless explicitly enabled.

The original Android planner remains exported from the package root. New programmatic entry points are `@alirni/capacitor-mobile-builder/mobile` and `@alirni/capacitor-mobile-builder/ios`. iOS command plans and export handling are tested with disposable fixture products; no real signed iOS app has been built as part of this change.

## Codex skill

The reusable [capacitor-mobile-build skill](skills/capacitor-mobile-build/SKILL.md) guides Codex to reuse this CLI for Capacitor Android/iOS exports instead of copying a build script into each application. It keeps platform selection, project settings, signing and artifact verification scoped to the requested output.

To install the skill for your Codex projects, copy its directory from this checkout into your Codex skills directory (normally `~/.codex/skills/`):

```sh
mkdir -p ~/.codex/skills
cp -R skills/capacitor-mobile-build ~/.codex/skills/
```

Refresh or restart Codex if the new skill is not discovered in the current chat. Invoke it explicitly with `$capacitor-mobile-build` or let Codex select it for relevant Capacitor export requests. Re-copy the skill after updating it in this repository; its installation does not copy the builder implementation.
