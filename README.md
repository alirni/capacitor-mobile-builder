# Android Builder

A shared TypeScript packaging tool for Capacitor game projects. Source: https://github.com/alirni/android-builder. It orchestrates each game's own web build, Capacitor sync, Gradle wrapper and export. It does not contain game code, install an Android SDK, change app IDs/signing keys, bump versions, upload to Play or deploy websites.

## Workspace setup

Keep this checkout beside the game repositories:

```
Games/
  android-builder/
  mobile-rally/
  tidebound/
```

Requires Node.js 22.12+, an Android project already created by Capacitor, the project's installed dependencies, SDK API 36 (configurable) and JDK 21 for these games.

Clone this repository beside your games, then install and compile the tool once:

```sh
git clone https://github.com/alirni/android-builder.git
cd android-builder
npm exec --yes --package=pnpm@11.28.9 -- pnpm install --frozen-lockfile
npm run build
npm test
```

Re-run `npm run build` after editing the tool source. The generated `dist/` is ignored and rebuilt on a new machine. No global installation or per-game dependency/lockfile change is needed. Each game's package script points at this one compiled CLI. Game-only web installs/builds do not require this sibling folder; Android commands do. The source repository is public. The package keeps `private: true` to prevent accidental npm publication; this does not affect GitHub visibility. It is not published to npm.

## Existing game commands

In Dustbend (`mobile-rally`):

```sh
pnpm android:plan                 # validate APK paths and print steps only
pnpm android:sync                 # web build + Capacitor sync
pnpm android:apk                  # debug testing APK
pnpm android:bundle               # release AAB; unsigned unless signing is configured
```

In Hidden Sails (`tidebound`):

```sh
npm run android:plan
npm run android:sync
npm run android:apk               # retains offline Gradle mode
npm run android:apk -- --online   # allow Gradle dependency downloads when necessary
```

Direct invocation from any working directory:

```sh
node /path/to/android-builder/dist/src/cli.js apk --project /path/to/game --dry-run
```

`--dry-run` validates project configuration, the Capacitor CLI, the wrapper and required SDK paths. It prints the planned commands and artifact path without executing builds/sync/Gradle or creating output/cache directories. On macOS it may read the installed JDK location with `java_home`. It never serializes the inherited environment or signing values. It does not prove that a real Gradle build or device installation will succeed.

## New project

Add only commands and settings to the game's `package.json`:

```json
{
  "scripts": {
    "build": "your existing web build command",
    "android:sync": "node ../android-builder/dist/src/cli.js sync",
    "android:apk": "node ../android-builder/dist/src/cli.js apk",
    "android:plan": "node ../android-builder/dist/src/cli.js apk --dry-run"
  },
  "androidBuild": {
    "artifactName": "MyGame",
    "sdkApi": 36
  }
}
```

The game's `build` script owns framework-specific preparation/type checks; the builder always runs it before packaging. Its own local `@capacitor/cli` and Gradle wrapper are used, preserving the game's installed versions. Node is invoked with argument arrays, so paths containing spaces are preserved.

### Configuration

| Field | Default / purpose |
| --- | --- |
| `artifactName` | Required safe filename prefix, e.g. `Dustbend` or `HiddenSails` |
| `buildScript` | `build`, a package script to run before sync |
| `androidDir` | `android`, existing native Android project |
| `outputDir` | `exports`, artifact destination |
| `sdkApi` | `36`, installed SDK platform required for APK/AAB |
| `sdkPath` | Optional project-relative or absolute SDK path |
| `gradleUserHome` | `.gradle-user`, optional shared cache path |
| `androidUserHome` | `.android-user`, per-project native settings/debug key location |
| `offline` | `false`; `--offline`/`--online` overrides it |
| `signingEnvPrefix` | Optional prefix for four existing Gradle signing env vars |

Caller `ANDROID_HOME`/`ANDROID_SDK_ROOT`, `JAVA_HOME`, `GRADLE_USER_HOME` and `ANDROID_USER_HOME` take priority. SDK fallback discovery checks the configured path, the game's `.android-sdk` and standard user SDK locations. Project-relative paths resolve against the game root, not the caller's working directory.

The current projects reuse the installed SDK/cache in `mobile-rally`; Hidden Sails names those paths in its settings. These can later point at a central SDK or be overridden with environment variables without changing the tool. SDK/cache files have not been moved. Each game retains its separate Android user directory and existing signing identity.

APK uses `assembleDebug` and exports `<artifactName>-<version>-debug.apk`. Bundle uses `bundleRelease` and exports a release `.aab`, with `-unsigned` when no configured signing variables are present. `version` is read from that game's `package.json`; native `versionName`/`versionCode` remain the game's responsibility.

For Dustbend, `signingEnvPrefix: "DUSTBEND"` refers to `DUSTBEND_KEYSTORE`, `DUSTBEND_STORE_PASSWORD`, `DUSTBEND_KEY_ALIAS` and `DUSTBEND_KEY_PASSWORD`. Either all four must be set or none. The tool passes the environment to the game's existing Gradle signing configuration; it does not create keys or configure Gradle signing for a new game. Do not put secret values in package.json or command-line arguments.

## Verification

Nine tests cover non-mutating dry runs, SDK/cache precedence, signing redaction/partial settings, offline mode, Windows command planning, paths with spaces, sync-only operation, stop-on-error behavior, absent artifacts and actual subprocess ordering/export using disposable fixture programs. Real dry-run commands were checked in both existing games. No real APK/AAB, Capacitor sync or website deployment was performed during verification. A real Android build remains a separate requested export.
