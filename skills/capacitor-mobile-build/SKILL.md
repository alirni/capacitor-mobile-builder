---
name: capacitor-mobile-build
description: Export existing Capacitor applications as Android APK/AAB or iOS simulator apps, archives and IPAs using the shared capacitor-mobile-builder CLI. Use for mobile packaging requests; not for Unity, React Native or ordinary web deployment.
---

# Capacitor mobile builds

Use the shared TypeScript builder at https://github.com/alirni/capacitor-mobile-builder. Keep packaging implementation in that repository and consumer settings in the application's package.json. Do not copy its implementation or create a second per-project build script.

## Locate and prepare

- Inspect the application's instructions, package scripts, Capacitor config, installed Capacitor version and existing native platforms. Preserve app IDs, versions, signing identities and storage behavior unless changing them is part of the request.
- Reuse an existing builder checkout/CLI referenced by the project's scripts. Otherwise look for a sibling `capacitor-mobile-builder` checkout. If missing, clone the canonical repository beside the application, respecting workspace permissions. Do not reset or update a dirty checkout automatically.
- Read that checkout's README and package.json for the actual configuration and Node/package-manager requirements. Install its dependencies with the declared package manager and lockfile, then compile with `npm run build`. An existing `dist/` may be stale after source changes.
- The builder is source-distributed, not an npm registry package. Application web builds must stay independent of the sibling checkout.

## Choose only the requested platform

Infer the target from the request and existing configuration when unambiguous; ask when the output/platform matters and is unclear. An Android-only project/request should use Android commands and gain no iOS dependency or project. Explicit requests for another build tool take precedence.

From the application root, a conventional sibling layout uses:

```sh
node ../capacitor-mobile-builder/dist/src/cli.js apk --dry-run
node ../capacitor-mobile-builder/dist/src/cli.js bundle --dry-run
node ../capacitor-mobile-builder/dist/src/cli.js simulator --dry-run
node ../capacitor-mobile-builder/dist/src/cli.js ipa --dry-run
node ../capacitor-mobile-builder/dist/src/cli.js build --platform all --ios-mode simulator --dry-run
```

Use argument-based process execution for paths containing spaces. Select `build --platform all` only when both platforms are requested. For both formats, `--android-format bundle` selects AAB and `--ios-mode simulator|archive|ipa` selects the iOS product. `sync` builds web assets and syncs native files but does not export a binary.

Wire application npm scripts directly to the compiled CLI and put project choices under `androidBuild` / `iosBuild`. The existing application build script should continue to run its own preparation and type checks. Remove a redundant local build implementation only after transferring its relevant settings and preserving its behavior.

## Platform requirements

**Android:** Read the builder's Android configuration table. Set a safe artifact filename prefix and the SDK API required by the native project; preserve SDK/cache settings, environment override precedence and the application's Android user home/debug key location. Do not borrow another application's paths as defaults in a new project. APK is a debug testing build. AAB uses the existing release signing setup and is unsigned unless that setup and its complete signing variables are present. Never substitute a debug key for a release key or invent Gradle signing configuration implicitly.

**iOS:** Read the builder checkout's `docs/ios.md` only when iOS is requested. Full Xcode on macOS, a native iOS project and matching Capacitor iOS runtime are required. Simulator `.app` output is not installable on an iPhone. Device archives/IPAs require appropriate certificates and provisioning; a team ID alone is insufficient. A free Personal Team supports direct Xcode device testing and should not be presented as TestFlight/distribution eligibility. The IPA export mode uses automatic signing. Do not enable provisioning updates silently, handle account passwords in chat, or put signing material in source control.

## Execute and verify

1. Run the selected dry-run plan and inspect commands, target, artifact paths and signing mode. It must not execute web/native builds or mutate outputs. Correct missing prerequisites before building; do not bypass signing or certificate validation to make a plan pass.
2. When the user requested an actual export, run the same selected command without `--dry-run`; do not add a separate approval round for an already authorized build. Stop on failure and diagnose the concrete cause. Do not report an older export as a newly successful build.
3. Verify the build result and exported artifact. For Android, inspect package/version metadata and validate the APK signature; compare signing identity with the previous build when available. For iOS, inspect product metadata and distinguish simulator, archive and signed IPA. Report device installation/playtesting only when actually performed.
4. Link the resulting artifact and briefly report platform, testing/signing status and any blocker. Keep credentials and inherited environment values out of logs. A build request does not authorize a store upload, website deployment, repository push or publication of private consumer information.

Changes to the shared builder should stay generic TypeScript, pass its tests, and preserve existing consumers. Keep public examples free of real consuming-project names, app IDs, signing prefixes and private paths.
