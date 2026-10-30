import {spawnSync, execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, copyFileSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {readProject, isObject as object, capacitorBin, webBuildCommand} from './project.js';

export type Action = 'sync' | 'apk' | 'bundle';
export interface AndroidBuildConfig {
  artifactName: string;
  buildScript?: string;
  androidDir?: string;
  outputDir?: string;
  sdkPath?: string;
  sdkApi?: number;
  gradleUserHome?: string;
  androidUserHome?: string;
  offline?: boolean;
  signingEnvPrefix?: string;
}
export interface Command {label: string; command: string; args: string[]; cwd: string;}
export interface BuildPlan {
  root: string;
  action: Action;
  commands: Command[];
  env: NodeJS.ProcessEnv;
  source?: string;
  output?: string;
  signed: boolean;
  config: AndroidBuildConfig;
}
interface PackageInfo {version: string; scripts?: Record<string, string>; androidBuild: AndroidBuildConfig;}
export interface PlanOptions {
  root: string;
  action: Action;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
  offline?: boolean;
  nodePath?: string;
  javaHome?: () => string | undefined;
}
function readPackage(root: string): PackageInfo {
  const value = readProject(root);
  const config = value.androidBuild;
  if (!object(config) || typeof config.artifactName !== 'string' || !/^[\w.-]+$/.test(config.artifactName)) {
    throw Error('Set androidBuild.artifactName in the project package.json (letters, digits, _, . and -).');
  }
  const strings = ['buildScript', 'androidDir', 'outputDir', 'sdkPath', 'gradleUserHome', 'androidUserHome', 'signingEnvPrefix'] as const;
  for (const name of strings) if (config[name] !== undefined && (typeof config[name] !== 'string' || !config[name])) {
    throw Error(`androidBuild.${name} must be a nonempty string.`);
  }
  if (config.buildScript !== undefined && !/^[\w:.-]+$/.test(String(config.buildScript))) throw Error('Invalid build script name.');
  if (config.signingEnvPrefix !== undefined && !/^[A-Z][A-Z0-9_]*$/.test(String(config.signingEnvPrefix))) throw Error('Invalid signing environment prefix.');
  if (config.sdkApi !== undefined && (!Number.isInteger(config.sdkApi) || Number(config.sdkApi) < 24)) throw Error('sdkApi must be an integer >= 24.');
  if (config.offline !== undefined && typeof config.offline !== 'boolean') throw Error('offline must be a boolean.');
  return value as unknown as PackageInfo;
}
function sdkInstalled(path: string, api: number) {return existsSync(join(path, 'platforms', `android-${api}`));}
export function createPlan(options: PlanOptions): BuildPlan {
  if (!['sync', 'apk', 'bundle'].includes(options.action)) throw Error('Expected sync, apk or bundle.');
  const root = resolve(options.root), pkg = readPackage(root), config = pkg.androidBuild;
  const platform = options.platform ?? process.platform, node = options.nodePath ?? process.execPath;
  const env = {...(options.env ?? process.env)}, android = resolve(root, config.androidDir ?? 'android');
  const buildScript = config.buildScript ?? 'build';
  if (!pkg.scripts?.[buildScript]) throw Error(`Missing package script: ${buildScript}`);
  const gradlew = join(android, platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  if (!existsSync(gradlew)) throw Error(`Android Gradle wrapper not found: ${gradlew}`);
  const cap = capacitorBin(root);
  const commands: Command[] = [webBuildCommand(root, buildScript, env, platform, node)];
  commands.push({label: 'Sync Capacitor Android', command: node, args: [cap, 'sync', 'android'], cwd: root});
  const plan: BuildPlan = {root, action: options.action, commands, env, signed: false, config};
  if (options.action === 'sync') return plan;
  const api = config.sdkApi ?? 36;
  // Honor explicit caller settings before project-specific and standard SDK paths.
  const explicitSdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  const home = options.home ?? env.HOME ?? env.USERPROFILE;
  const sdkCandidates = [explicitSdk, config.sdkPath ? resolve(root, config.sdkPath) : undefined,
    join(root, '.android-sdk'), home ? join(home, 'Library/Android/sdk') : undefined,
    home ? join(home, 'Android/Sdk') : undefined, env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Android/Sdk') : undefined];
  const sdk = explicitSdk || sdkCandidates.find((p): p is string => Boolean(p && sdkInstalled(p, api)));
  if (!sdk || !sdkInstalled(sdk, api)) throw Error(`Android SDK API ${api} not found. Set ANDROID_HOME or androidBuild.sdkPath.`);
  env.ANDROID_HOME = sdk;
  if (!env.JAVA_HOME && platform === 'darwin') {
    env.JAVA_HOME = options.javaHome ? options.javaHome() : (() => {
      try {return execFileSync('/usr/libexec/java_home', ['-v', '21'], {encoding: 'utf8'}).trim();} catch {return undefined;}
    })();
  }
  env.GRADLE_USER_HOME ||= resolve(root, config.gradleUserHome ?? '.gradle-user');
  env.ANDROID_USER_HOME ||= resolve(root, config.androidUserHome ?? '.android-user');
  const prefix = config.signingEnvPrefix;
  const keys = prefix ? ['KEYSTORE', 'STORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'].map(s => `${prefix}_${s}`) : [];
  if (keys.some(k => env[k]) && !keys.every(k => env[k])) throw Error(`Set all four ${prefix} signing environment variables, or none.`);
  plan.signed = options.action === 'bundle' && keys.length > 0 && keys.every(k => Boolean(env[k]));
  const task = options.action === 'apk' ? 'assembleDebug' : 'bundleRelease';
  const args = [task, ...((options.offline ?? config.offline) ? ['--offline'] : []), '--no-daemon'];
  commands.push(platform === 'win32'
    ? {label: 'Build Android', command: env.ComSpec ?? 'cmd.exe', args: ['/d', '/c', 'gradlew.bat', ...args], cwd: android}
    : {label: 'Build Android', command: './gradlew', args, cwd: android});
  plan.source = join(android, 'app/build/outputs', options.action === 'apk' ? 'apk/debug/app-debug.apk' : 'bundle/release/app-release.aab');
  const name = options.action === 'apk' ? `${config.artifactName}-${pkg.version}-debug.apk`
    : `${config.artifactName}-${pkg.version}-release${plan.signed ? '' : '-unsigned'}.aab`;
  plan.output = join(resolve(root, config.outputDir ?? 'exports'), name);
  return plan;
}
export type CommandRunner = (command: Command, env: NodeJS.ProcessEnv) => void;
export function runCommand(command: Command, env: NodeJS.ProcessEnv) {
  console.log(`\n${command.label}`);
  const result = spawnSync(command.command, command.args, {cwd: command.cwd, env, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command.label} failed (exit ${result.status ?? 'signal'}).`);
}
export function describePlan(plan: BuildPlan) {
  // Never serialize plan.env: it may contain credentials inherited from the caller.
  return {project: plan.root, action: plan.action, commands: plan.commands,
    sdk: plan.env.ANDROID_HOME ?? plan.env.ANDROID_SDK_ROOT ?? null,
    source: plan.source ?? null, output: plan.output ?? null,
    signing: plan.action === 'apk' ? 'debug' : plan.signed ? 'configured in project Gradle' : 'unsigned'};
}
export function executePlan(plan: BuildPlan, runner: CommandRunner = runCommand) {
  if (plan.action !== 'sync') mkdirSync(plan.env.ANDROID_USER_HOME!, {recursive: true});
  for (const command of plan.commands) runner(command, plan.env);
  return exportAndroidArtifact(plan);
}
export function exportAndroidArtifact(plan: BuildPlan) {
  if (plan.source && plan.output) {
    if (!existsSync(plan.source) || statSync(plan.source).size === 0) throw Error(`Expected Android output missing or empty: ${plan.source}`);
    mkdirSync(dirname(plan.output), {recursive: true});
    copyFileSync(plan.source, plan.output);
    console.log(`Exported ${plan.output}`);
    if (plan.action === 'bundle' && !plan.signed) console.log('Unsigned bundle: configure project Gradle signing before Play submission.');
  }
  return plan.output;
}
