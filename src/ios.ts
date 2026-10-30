import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, statSync, writeFileSync, cpSync, renameSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {dirname, join, resolve} from 'node:path';
import {capacitorBin, isObject, readProject, webBuildCommand} from './project.js';
import type {Command, PlanOptions} from './builder.js';
export type IosAction = 'sync' | 'simulator' | 'archive' | 'ipa';
export interface IosBuildConfig {
  artifactName: string;
  buildScript?: string;
  outputDir?: string;
  workspace?: string;
  project?: string;
  scheme?: string;
  appName?: string;
  configuration?: string;
  developerDir?: string;
  teamIdEnv?: string;
  exportMethod?: 'debugging' | 'release-testing' | 'app-store-connect' | 'enterprise';
  allowProvisioningUpdates?: boolean;
}
export interface IosPlan {
  root: string; action: IosAction; config: IosBuildConfig; env: NodeJS.ProcessEnv; commands: Command[];
  workDir: string; source?: string; output?: string; exportOptionsPath?: string; exportOptionsXml?: string;
}
export type IosPlanOptions = Omit<PlanOptions, 'action'> & {action: IosAction};
function configFor(root: string): IosBuildConfig {
  const pkg = readProject(root), config = pkg.iosBuild;
  if (!isObject(config)) throw Error('Set iosBuild settings in the project package.json before building iOS.');
  const fallback = isObject(pkg.androidBuild) ? pkg.androidBuild : {};
  const result:Record<string,unknown> = {artifactName: fallback.artifactName, ...config};
  if (typeof result.artifactName !== 'string' || !/^[\w.-]+$/.test(result.artifactName)) throw Error('Set iosBuild.artifactName (or androidBuild.artifactName).');
  for (const field of ['buildScript', 'outputDir', 'workspace', 'project', 'scheme', 'appName', 'configuration', 'developerDir', 'teamIdEnv'] as const) {
    if (result[field] !== undefined && (typeof result[field] !== 'string' || !String(result[field]).trim() || String(result[field]).includes('\0'))) throw Error(`iosBuild.${field} must be a nonempty string.`);
  }
  if (result.workspace && result.project) throw Error('Choose iosBuild.workspace or iosBuild.project, not both.');
  if (result.appName !== undefined && (/[/\\]/.test(String(result.appName)) || ['.', '..'].includes(String(result.appName)))) throw Error('iosBuild.appName must be a product name, not a path.');
  if (result.teamIdEnv !== undefined && !/^[A-Z][A-Z0-9_]*$/.test(String(result.teamIdEnv))) throw Error('Invalid iOS team environment variable name.');
  if (result.exportMethod !== undefined && !['debugging', 'release-testing', 'app-store-connect', 'enterprise'].includes(String(result.exportMethod))) throw Error('Unsupported iOS exportMethod.');
  if (result.allowProvisioningUpdates !== undefined && typeof result.allowProvisioningUpdates !== 'boolean') throw Error('allowProvisioningUpdates must be a boolean.');
  return result as unknown as IosBuildConfig;
}
function xml(value: string) {return value.replace(/[<>&"']/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'}[c]!));}
export function exportOptions(team: string, method: string) {
  // Destination is deliberately fixed to a local export. Never upload to App Store Connect.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>destination</key><string>export</string><key>method</key><string>${xml(method)}</string><key>teamID</key><string>${xml(team)}</string><key>signingStyle</key><string>automatic</string><key>manageAppVersionAndBuildNumber</key><false/><key>uploadSymbols</key><false/></dict></plist>\n`;
}
export function createIosPlan(options: IosPlanOptions): IosPlan {
  const host = options.platform ?? process.platform;
  if (host !== 'darwin') throw Error('iOS builds require macOS and Xcode. Choose Android on this machine.');
  if (!['sync', 'simulator', 'archive', 'ipa'].includes(options.action)) throw Error('Expected sync, simulator, archive or ipa.');
  const root = resolve(options.root), pkg = readProject(root), config = configFor(root), env = {...(options.env ?? process.env)};
  let native: string, kind: '-workspace' | '-project';
  if (config.workspace) {native = resolve(root, config.workspace); kind = '-workspace';}
  else if (config.project) {native = resolve(root, config.project); kind = '-project';}
  else if (existsSync(join(root, 'ios/App/App.xcworkspace'))) {native = join(root, 'ios/App/App.xcworkspace'); kind = '-workspace';}
  else {native = join(root, 'ios/App/App.xcodeproj'); kind = '-project';}
  if (!existsSync(native)) throw Error('Native iOS project is missing. Install matching @capacitor/ios, then run cap add ios; or configure iosBuild.workspace/project.');
  const require = createRequire(join(root, 'package.json'));
  try {if (!existsSync(require.resolve('@capacitor/ios/package.json'))) throw Error('Missing runtime');} catch {throw Error('Install @capacitor/ios matching this project’s Capacitor version.');}
  let developerDir = env.DEVELOPER_DIR || (config.developerDir ? resolve(root, config.developerDir) : undefined);
  if (!developerDir) {
    try {developerDir = execFileSync('/usr/bin/xcode-select', ['-p'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();} catch {throw Error('Xcode developer directory not found. Set DEVELOPER_DIR to your installed Xcode.app/Contents/Developer.');}
  }
  const xcode = join(developerDir, 'usr/bin/xcodebuild');
  if (!existsSync(xcode)) throw Error('Full Xcode is required; Command Line Tools alone are insufficient. Set DEVELOPER_DIR to Xcode.app/Contents/Developer.');
  env.DEVELOPER_DIR = developerDir;
  const node = options.nodePath ?? process.execPath;
  const commands = [webBuildCommand(root, config.buildScript ?? 'build', env, host, node),
    {label: 'Sync Capacitor iOS', command: node, args: [capacitorBin(root), 'sync', 'ios'], cwd: root}];
  const workDir = join(root, '.mobile-build', `ios-${randomUUID()}`);
  const plan: IosPlan = {root, action: options.action, config, env, commands, workDir};
  if (options.action === 'sync') return plan;
  const scheme = config.scheme ?? 'App', configuration = config.configuration ?? (options.action === 'simulator' ? 'Debug' : 'Release');
  const base = [kind, native, '-scheme', scheme, '-configuration', configuration];
  const output = resolve(root, config.outputDir ?? 'exports'), prefix = `${config.artifactName}-${pkg.version}`;
  if (options.action === 'simulator') {
    const data = join(workDir, 'DerivedData');
    commands.push({label: 'Build iOS Simulator app', command: xcode,
      args: [...base, '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', data, 'CODE_SIGNING_ALLOWED=NO', 'build'], cwd: root});
    plan.source = join(data, 'Build/Products', `${configuration}-iphonesimulator`, `${config.appName ?? 'App'}.app`);
    plan.output = join(output, `${prefix}-ios-simulator.app`);
    return plan;
  }
  const team = env[config.teamIdEnv ?? 'IOS_TEAM_ID'];
  if (team && !/^[A-Z0-9]{10}$/.test(team)) throw Error('iOS team ID must contain 10 uppercase letters/digits.');
  if (options.action === 'ipa' && !team) throw Error(`Set ${config.teamIdEnv ?? 'IOS_TEAM_ID'} to your Apple Developer team ID before exporting IPA. Simulator builds need no signing team.`);
  const archive = join(workDir, `${scheme.replace(/[/\\]/g, '_')}.xcarchive`);
  const updates = config.allowProvisioningUpdates ? ['-allowProvisioningUpdates'] : [];
  commands.push({label: 'Archive iOS app', command: xcode,
    args: [...base, '-sdk', 'iphoneos', '-destination', 'generic/platform=iOS', '-archivePath', archive, ...updates, ...(team ? [`DEVELOPMENT_TEAM=${team}`] : []), 'archive'], cwd: root});
  plan.source = archive; plan.output = join(output, `${prefix}-ios.xcarchive`);
  if (options.action === 'archive') return plan;
  plan.exportOptionsPath = join(workDir, 'ExportOptions.plist');
  plan.exportOptionsXml = exportOptions(team!, config.exportMethod ?? 'debugging');
  const exportPath = join(workDir, 'export');
  commands.push({label: 'Export local iOS IPA', command: xcode,
    args: ['-exportArchive', '-archivePath', archive, '-exportOptionsPlist', plan.exportOptionsPath, '-exportPath', exportPath, ...updates], cwd: root});
  plan.source = exportPath; plan.output = join(output, `${prefix}-ios.ipa`);
  return plan;
}
export function prepareIosPlan(plan: IosPlan) {
  if (plan.action === 'sync') return;
  mkdirSync(plan.workDir, {recursive: true});
  if (plan.exportOptionsPath && plan.exportOptionsXml) writeFileSync(plan.exportOptionsPath, plan.exportOptionsXml, {mode: 0o600});
}
export function iosArtifactSource(plan: IosPlan) {
  if (!plan.source || !plan.output) return undefined;
  let source = plan.source;
  if (plan.action === 'ipa') {
    const entries = existsSync(source) ? readdirSync(source).filter(file => file.endsWith('.ipa')) : [];
    if (entries.length !== 1) throw Error('Expected exactly one exported IPA. Existing exports were not replaced.');
    source = join(source, entries[0]!);
  }
  if (!existsSync(source)) throw Error(`Expected iOS output missing: ${source}`);
  const stat = statSync(source);
  if (plan.action === 'ipa' ? !stat.isFile() || stat.size === 0 : !stat.isDirectory() || !existsSync(join(source, 'Info.plist'))) throw Error('Expected iOS output is empty or incomplete.');
  return source;
}
export function exportIosArtifact(plan: IosPlan) {
  const source = iosArtifactSource(plan); if (!source || !plan.output) return undefined;
  mkdirSync(dirname(plan.output), {recursive: true});
  const temp = `${plan.output}.tmp-${randomUUID()}`, backup = `${plan.output}.backup-${randomUUID()}`;
  let backedUp = false;
  try {
    cpSync(source, temp, {recursive: true, dereference: false});
    if (existsSync(plan.output)) {renameSync(plan.output, backup); backedUp = true;}
    renameSync(temp, plan.output);
  } catch (error) {
    if (backedUp && !existsSync(plan.output)) renameSync(backup, plan.output);
    throw error;
  } finally {rmSync(temp, {recursive: true, force: true});}
  if (backedUp) rmSync(backup, {recursive: true, force: true});
  console.log(`Exported ${plan.output}`); return plan.output;
}
export function describeIosPlan(plan: IosPlan) {
  return {project: plan.root, action: plan.action, commands: plan.commands, developerDir: plan.env.DEVELOPER_DIR,
    source: plan.source ?? null, output: plan.output ?? null,
    signing: plan.action === 'simulator' ? 'disabled for simulator only' : 'existing Xcode signing settings; IPA export uses automatic signing',
    exportDestination: plan.action === 'ipa' ? 'local export, no upload' : null};
}
