import {resolve} from 'node:path';
import type {Action} from './builder.js';
export function parseArgs(args: string[]) {
  let root = process.cwd(), action: Action = 'apk', dryRun = false, offline: boolean | undefined;
  let actionSet = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--offline') offline = true;
    else if (arg === '--online') offline = false;
    else if (arg === '--project') {
      const path = args[++i]; if (!path || path.startsWith('--')) throw Error('--project needs a path.'); root = resolve(path);
    } else if (arg === 'sync' || arg === 'apk' || arg === 'bundle') {
      if (actionSet) throw Error('Choose a single action.'); action = arg; actionSet = true;
    } else throw Error(`Unknown argument: ${arg}. Use --help.`);
  }
  return {root, action, dryRun, offline};
}
