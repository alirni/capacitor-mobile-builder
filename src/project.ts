import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import type {Command} from './builder.js';
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export interface ProjectPackage {version: string; scripts?: Record<string, string>; androidBuild?: unknown; iosBuild?: unknown;}
export function readProject(root: string): ProjectPackage {
  const value: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!isObject(value) || typeof value.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(value.version)) throw Error('package.json must contain a valid version.');
  return value as unknown as ProjectPackage;
}
export function capacitorBin(root: string) {
  const require = createRequire(join(root, 'package.json'));
  const path = require.resolve('@capacitor/cli/package.json');
  const pkg: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isObject(pkg)) throw Error('Invalid Capacitor CLI package.');
  const bin = typeof pkg.bin === 'string' ? pkg.bin : isObject(pkg.bin) ? pkg.bin.cap : undefined;
  if (typeof bin !== 'string') throw Error('Capacitor CLI executable not found.');
  return resolve(dirname(path), bin);
}
export function webBuildCommand(root: string, script: string, env: NodeJS.ProcessEnv, host: NodeJS.Platform, node: string): Command {
  if (!/^[\w:.-]+$/.test(script)) throw Error('Invalid build script name.');
  if (!readProject(root).scripts?.[script]) throw Error(`Missing package script: ${script}`);
  if (env.npm_execpath) return {label: 'Build web app', command: node, args: [env.npm_execpath, 'run', script], cwd: root};
  if (host === 'win32') return {label: 'Build web app', command: env.ComSpec ?? 'cmd.exe', args: ['/d', '/c', `npm run ${script}`], cwd: root};
  return {label: 'Build web app', command: 'npm', args: ['run', script], cwd: root};
}
