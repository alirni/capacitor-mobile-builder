import {resolve} from 'node:path';
import type {MobileAction, Target} from './mobile.js';
import type {IosAction} from './ios.js';
export function parseArgs(args: string[]) {
  let root = process.cwd(), action: MobileAction = 'build', dryRun = false, offline: boolean | undefined;
  let target: Target | undefined, androidFormat: 'apk' | 'bundle' = 'apk', iosMode: Exclude<IosAction, 'sync'> = 'ipa';
  let actionSet = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--offline') offline = true;
    else if (arg === '--online') offline = false;
    else if (arg === '--project') {
      const path = args[++i]; if (!path || path.startsWith('--')) throw Error('--project needs a path.'); root = resolve(path);
    } else if (arg === '--platform') {
      const value = args[++i]; if (value !== 'android' && value !== 'ios' && value !== 'all') throw Error('--platform must be android, ios or all.');
      if (target) throw Error('Choose a single --platform.'); target = value;
    } else if (arg === '--android-format') {
      const value = args[++i]; if (value !== 'apk' && value !== 'bundle') throw Error('--android-format must be apk or bundle.'); androidFormat = value;
    } else if (arg === '--ios-mode') {
      const value = args[++i]; if (value !== 'simulator' && value !== 'archive' && value !== 'ipa') throw Error('--ios-mode must be simulator, archive or ipa.'); iosMode = value;
    } else if (arg === 'sync' || arg === 'apk' || arg === 'bundle' || arg === 'build' || arg === 'simulator' || arg === 'archive' || arg === 'ipa') {
      if (actionSet) throw Error('Choose a single action.'); action = arg; actionSet = true;
    } else throw Error(`Unknown argument: ${arg}. Use --help.`);
  }
  return {root, action, target, androidFormat, iosMode, dryRun, offline};
}
