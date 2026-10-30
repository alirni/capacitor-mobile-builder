#!/usr/bin/env node
import {createMobilePlan, describeMobilePlan, executeMobilePlan} from './mobile.js';
import {parseArgs} from './args.js';
if (process.argv.includes('--help')) {
  console.log(`mobile-build [build|sync|apk|bundle|simulator|archive|ipa]
  [--platform android|ios|all] [--project path] [--dry-run]
  [--android-format apk|bundle] [--ios-mode simulator|archive|ipa]
  [--offline|--online]
Default: Android APK. iOS actions select iOS automatically.
Combined build: build --platform all (APK + IPA), or --ios-mode simulator.
Uses package.json androidBuild/iosBuild settings. iOS requires macOS, Xcode and a prepared native project.
Dry runs print validated plans without build/sync/Gradle/Xcode execution or output files.
IPA export is local; no App Store upload. android-build remains an alias.`);
} else {
  try {
    const options = parseArgs(process.argv.slice(2)), plan = createMobilePlan(options);
    if (options.dryRun) console.log(JSON.stringify(describeMobilePlan(plan), null, 2));
    else executeMobilePlan(plan);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Mobile build failed.'); process.exitCode = 1;
  }
}
