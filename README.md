# Android Builder

A shared TypeScript packaging tool for Capacitor projects. It runs a project's web build, Capacitor sync, Gradle wrapper and artifact export using project-specific configuration.

It does not contain application code, install SDKs, change application IDs or signing keys, bump versions, upload to app stores or deploy websites.

## Setup

Requires Node.js 22.12+, an existing Capacitor Android project, installed project dependencies, an Android SDK platform and a compatible JDK. SDK API 36 is the default; configure another API if your project requires it.

Clone the tool beside your application checkout, then install and compile it:

```sh
git clone https://github.com/alirni/android-builder.git
cd android-builder
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
    "android:plan": "node ../android-builder/dist/src/cli.js apk --dry-run",
    "android:sync": "node ../android-builder/dist/src/cli.js sync",
    "android:apk": "node ../android-builder/dist/src/cli.js apk",
    "android:bundle": "node ../android-builder/dist/src/cli.js bundle"
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
node /path/to/android-builder/dist/src/cli.js apk --project /path/to/application --dry-run
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
