#!/usr/bin/env node
import {createPlan, describePlan, executePlan} from './builder.js';
import {parseArgs} from './args.js';
if (process.argv.includes('--help')) {
  console.log('android-build [sync|apk|bundle] [--project path] [--dry-run] [--offline|--online]\nUses package.json androidBuild settings. --dry-run validates and prints a plan without building, syncing or creating files.');
} else {
  try {
    const options = parseArgs(process.argv.slice(2)), plan = createPlan(options);
    if (options.dryRun) console.log(JSON.stringify(describePlan(plan), null, 2));
    else executePlan(plan);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Android build failed.'); process.exitCode = 1;
  }
}
