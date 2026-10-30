# iOS setup and exports

All names, team placeholders and paths in this guide are illustrative. No consuming application's identity or local layout is stored in this repository.

## Prerequisites

- macOS and full Xcode appropriate for the application's Capacitor version. For Capacitor 8, consult the current [iOS environment requirements](https://capacitorjs.com/docs/ios). Command Line Tools alone are insufficient.
- The application's own `@capacitor/ios` matching its Capacitor core/CLI version. Add the native iOS platform once with that application's package manager and `cap add ios`. The builder does not install packages, create native projects, accept Xcode licenses or sign into an Apple account automatically.
- Existing signing certificates, provisioning and team configuration in Xcode for device archives/IPA. A team ID alone is not a signing credential. Simulator builds do not use signing.

In the application package.json, add settings such as:

```json
{
  "iosBuild": {
    "artifactName": "ExampleApp",
    "scheme": "App",
    "appName": "App",
    "teamIdEnv": "IOS_TEAM_ID",
    "exportMethod": "debugging"
  }
}
```

`artifactName` may be omitted if `androidBuild.artifactName` is already configured. iOS-only applications do not need Android settings or an Android SDK.

The tool discovers `ios/App/App.xcworkspace` first (for a workspace/CocoaPods setup), then `ios/App/App.xcodeproj` (including Swift Package Manager setups). Set an explicit `workspace` or `project` path if yours differs. Only one may be specified.

The selected Xcode is read from caller `DEVELOPER_DIR`, then `iosBuild.developerDir`, then `xcode-select -p`. The tool never changes the system selection or downloads Xcode components.

## Output modes

| Action | Native command | Published local artifact | Signing |
| --- | --- | --- | --- |
| `sync --platform ios` | web build, `cap sync ios` | none | not used |
| `simulator` | Xcode build for generic iOS Simulator | `<name>-<version>-ios-simulator.app` directory | disabled for simulator only |
| `archive` | Xcode archive for generic iOS device | `<name>-<version>-ios.xcarchive` directory | existing native project settings |
| `ipa` / `build --platform ios` | archive, then local `-exportArchive` | `<name>-<version>-ios.ipa` | configured Apple team and automatic export signing |
| `build --platform all` | Android build and iOS archive/export | APK + IPA, or configured formats | per platform |

Artifact destination defaults to the application's `exports` directory. The version comes from its package.json; native version/build numbers remain the application's responsibility. The default simulator configuration is Debug; archive/IPA default to Release.

Simulator output uses `appName` (native product name, default `App`) to locate the `.app`. IPA publication discovers exactly one exported `.ipa`, so its Xcode product filename need not match the final generic artifact prefix. Ambiguous or missing artifacts are rejected before replacing exports.

## Configuration

| Field | Default / meaning |
| --- | --- |
| `artifactName` | required, or inherited from `androidBuild.artifactName` |
| `buildScript` | `build`, same as Android for a combined build |
| `outputDir` | `exports` |
| `workspace` / `project` | optional path to the native workspace/project, relative to application root |
| `scheme` | `App` |
| `appName` | `App`, simulator product name without `.app` |
| `configuration` | Debug for simulator, Release for archives/IPA |
| `developerDir` | optional Xcode.app/Contents/Developer location |
| `teamIdEnv` | `IOS_TEAM_ID`, environment variable containing the team identifier |
| `exportMethod` | `debugging`; also `release-testing`, `app-store-connect`, `enterprise` |
| `allowProvisioningUpdates` | false; explicitly opt in to Xcode profile/certificate updates |

Relative paths resolve against the application root. Keep account credentials and signing material out of configuration/source control. The tool inherits the process environment for native commands but never serializes it into plan output.

`archive` preserves native signing configuration and optionally overrides DEVELOPMENT_TEAM if the configured team environment variable is present. `ipa` requires that variable and uses automatic export signing. Manual IPA export rules and arbitrary external ExportOptions plists are not supported by this version.

Even with `app-store-connect` as the export method, destination is fixed to local export. No TestFlight/App Store upload command is run. Provisioning updates may contact Apple only when explicitly opted in.

## Combined builds and failure handling

Use `build --platform all` with optional `--android-format apk|bundle` and `--ios-mode simulator|archive|ipa`. Both platform preflights must pass before the shared web build starts. Both platforms must name the same build script. Windows/Linux can build Android; selecting iOS/all requires a Mac.

All selected build commands complete and artifact validation passes before publication starts. A failed native build does not replace an existing APK/IPA. Directory products are staged and renamed to replace old products without stale files. A filesystem failure during final multi-artifact copying can still leave already-published successful outputs; this is not an atomic transaction across platforms.

Temporary Xcode work lives under `.mobile-build/ios-<unique-id>` inside the application. Failed-build material is retained for diagnosis. Add `.mobile-build/`, `exports/`, signing profiles and certificate files to the application's `.gitignore`; only remove work directories after they are no longer needed. `--dry-run` creates neither work directories nor export plists and does not run sync, Gradle, Xcode build or export. It may read the selected developer directory.

## Validation limits

Automated tests use disposable generic projects and fixture outputs, including command ordering, simulator/archive/IPA plans, local export options, redaction, provisioning opt-in, preflight failures and preservation of existing artifacts. A real device build/installation still requires an application with native iOS setup and valid signing; this change does not claim a signed IPA or device playtest.

References: [Capacitor iOS](https://capacitorjs.com/docs/ios), [Capacitor build options](https://capacitorjs.com/docs/cli/commands/build), [Apple distribution workflow](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases).
