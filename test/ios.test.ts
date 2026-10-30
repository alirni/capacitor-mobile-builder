import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createIosPlan, describeIosPlan, exportOptions, exportIosArtifact, type IosBuildConfig} from '../src/ios.js';
import {createMobilePlan, describeMobilePlan, executeMobilePlan, type MobilePlan} from '../src/mobile.js';
import {parseArgs} from '../src/args.js';
function fixture(ios: Partial<IosBuildConfig> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'mobile builder test '));
  mkdirSync(join(root, 'ios/App/App.xcodeproj'), {recursive: true});
  mkdirSync(join(root, 'android'), {recursive: true}); writeFileSync(join(root, 'android/gradlew'), '');
  mkdirSync(join(root, '.android-sdk/platforms/android-36'), {recursive: true});
  for (const name of ['cli', 'ios']) {
    const path = join(root, 'node_modules/@capacitor', name); mkdirSync(path, {recursive: true});
    writeFileSync(join(path, 'package.json'), JSON.stringify({name: `@capacitor/${name}`, version: '8.5.3', bin: {cap: 'bin/capacitor'}}));
  }
  const developerDir = join(root, 'Fake Xcode.app/Contents/Developer'); mkdirSync(join(developerDir, 'usr/bin'), {recursive: true});
  writeFileSync(join(developerDir, 'usr/bin/xcodebuild'), '');
  writeFileSync(join(root, 'package.json'), JSON.stringify({version: '1.2.3', scripts: {build: 'vite build'}, androidBuild: {artifactName: 'ExampleApp'}, iosBuild: {...ios}}));
  return {root, env: {DEVELOPER_DIR: developerDir, JAVA_HOME: '/fixture/java', IOS_TEAM_ID: 'ABCD123456'}, clean: () => rmSync(root, {recursive: true, force: true})};
}
function createOutputs(plan: MobilePlan) {
  if (plan.android?.source) {mkdirSync(join(plan.android.source, '..'), {recursive: true}); writeFileSync(plan.android.source, 'fixture apk');}
  if (plan.ios?.source) {
    mkdirSync(plan.ios.source, {recursive: true});
    if (plan.ios.action === 'ipa') writeFileSync(join(plan.ios.source, 'DifferentProduct.ipa'), 'fixture ipa');
    else {writeFileSync(join(plan.ios.source, 'Info.plist'), '<plist/>'); writeFileSync(join(plan.ios.source, 'Executable'), 'fixture executable');}
  }
}
test('simulator planning is unsigned, discovers SPM project and never writes files', () => {
  const f = fixture();
  try {
    const plan = createIosPlan({root: f.root, action: 'simulator', platform: 'darwin', env: {DEVELOPER_DIR: f.env.DEVELOPER_DIR}});
    assert.equal(plan.commands.length, 3); const args = plan.commands[2]!.args;
    assert.ok(args.includes('-project')); assert.ok(args.includes('CODE_SIGNING_ALLOWED=NO')); assert.ok(args.includes('generic/platform=iOS Simulator'));
    assert.ok(plan.output!.endsWith('ExampleApp-1.2.3-ios-simulator.app')); assert.ok(!existsSync(join(f.root, '.mobile-build')));
    assert.ok(!existsSync(join(f.root, 'exports'))); assert.equal(plan.exportOptionsXml, undefined);
    assert.equal(describeIosPlan(plan).signing, 'disabled for simulator only');
  } finally {f.clean();}
});
test('workspace discovery and archive settings preserve paths and schemes with spaces', () => {
  const f = fixture({scheme: 'Example App', configuration: 'Release'});
  try {
    mkdirSync(join(f.root, 'ios/App/App.xcworkspace'));
    const plan = createIosPlan({root: f.root, action: 'archive', platform: 'darwin', env: f.env});
    const args = plan.commands[2]!.args; assert.ok(args.includes('-workspace')); assert.ok(args.includes('Example App'));
    assert.ok(args.includes('generic/platform=iOS')); assert.ok(args.includes('DEVELOPMENT_TEAM=ABCD123456'));
    assert.ok(!args.includes('CODE_SIGNING_ALLOWED=NO')); assert.ok(!args.includes('-allowProvisioningUpdates'));
    assert.ok(plan.output!.endsWith('-ios.xcarchive')); assert.equal(plan.exportOptionsXml, undefined);
  } finally {f.clean();}
});
test('IPA uses local export options, requires a team and does not expose inherited secrets', () => {
  const f = fixture({exportMethod: 'app-store-connect'});
  try {
    assert.throws(() => createIosPlan({root: f.root, action: 'ipa', platform: 'darwin', env: {DEVELOPER_DIR: f.env.DEVELOPER_DIR}}), /IOS_TEAM_ID/);
    const plan = createIosPlan({root: f.root, action: 'ipa', platform: 'darwin', env: {...f.env, PRIVATE_API_KEY: 'fixture-private-value'}});
    assert.equal(plan.commands.length, 4); assert.ok(plan.commands[3]!.args.includes('-exportArchive'));
    assert.ok(plan.exportOptionsXml!.includes('<key>destination</key><string>export</string>'));
    assert.ok(plan.exportOptionsXml!.includes('<key>uploadSymbols</key><false/>'));
    assert.ok(plan.exportOptionsXml!.includes('<key>manageAppVersionAndBuildNumber</key><false/>'));
    assert.ok(!plan.commands.some(c => c.args.includes('-allowProvisioningUpdates')));
    assert.ok(!JSON.stringify(describeIosPlan(plan)).includes('fixture-private-value'));
    assert.ok(!existsSync(plan.workDir)); assert.ok(!existsSync(join(f.root, 'exports')));
    assert.ok(exportOptions('A&B', 'example<method>').includes('A&amp;B'));
  } finally {f.clean();}
});
test('provisioning changes require an explicit opt-in and a custom team variable works', () => {
  const f = fixture({allowProvisioningUpdates: true, teamIdEnv: 'EXAMPLE_TEAM'});
  try {
    const plan = createIosPlan({root: f.root, action: 'ipa', platform: 'darwin', env: {...f.env, EXAMPLE_TEAM: '123456ABCD'}});
    assert.ok(plan.commands[2]!.args.includes('-allowProvisioningUpdates')); assert.ok(plan.commands[3]!.args.includes('-allowProvisioningUpdates'));
    assert.ok(plan.exportOptionsXml!.includes('123456ABCD'));
  } finally {f.clean();}
});
test('unsupported hosts, missing projects, missing runtime and invalid Xcode paths fail before execution', () => {
  const f = fixture();
  try {
    for (const platform of ['linux', 'win32'] as const) assert.throws(() => createIosPlan({root: f.root, action: 'ipa', platform, env: f.env}), /macOS/);
    assert.throws(() => createIosPlan({root: f.root, action: 'simulator', platform: 'darwin', env: {...f.env, DEVELOPER_DIR: '/missing'}}), /Full Xcode/);
    rmSync(join(f.root, 'node_modules/@capacitor/ios'), {recursive: true});
    assert.throws(() => createIosPlan({root: f.root, action: 'simulator', platform: 'darwin', env: f.env}), /Install @capacitor\/ios/);
    rmSync(join(f.root, 'ios'), {recursive: true});
    assert.throws(() => createIosPlan({root: f.root, action: 'ipa', platform: 'darwin', env: f.env}), /Native iOS project is missing/);
    assert.ok(!existsSync(join(f.root, '.mobile-build')));
  } finally {f.clean();}
});
test('combined builds share the web build, export both artifacts and remain secret-safe', () => {
  const f = fixture();
  try {
    const plan = createMobilePlan({root: f.root, action: 'build', target: 'all', platform: 'darwin', env: {...f.env, PRIVATE_API_KEY: 'fixture-secret'}});
    assert.equal(plan.commands.filter(c => c.label === 'Build web app').length, 1);
    const labels: string[] = [];
    const outputs = executeMobilePlan(plan, c => {labels.push(c.label); if (c.label === 'Export local iOS IPA') createOutputs(plan);});
    assert.deepEqual(labels, ['Build web app', 'Sync Capacitor Android', 'Build Android', 'Sync Capacitor iOS', 'Archive iOS app', 'Export local iOS IPA']);
    assert.equal(outputs.length, 2); assert.equal(readFileSync(outputs[0]!, 'utf8'), 'fixture apk'); assert.equal(readFileSync(outputs[1]!, 'utf8'), 'fixture ipa');
    assert.ok(!JSON.stringify(describeMobilePlan(plan)).includes('fixture-secret'));
    assert.ok(readFileSync(plan.ios!.exportOptionsPath!, 'utf8').includes('<string>export</string>'));
  } finally {f.clean();}
});
test('combined build failure never replaces existing exports, and missing iOS fails before any build', () => {
  const f = fixture();
  try {
    const plan = createMobilePlan({root: f.root, action: 'build', target: 'all', platform: 'darwin', env: f.env});
    mkdirSync(join(f.root, 'exports')); writeFileSync(plan.android!.output!, 'old apk'); writeFileSync(plan.ios!.output!, 'old ipa');
    assert.throws(() => executeMobilePlan(plan, c => {if (c.label === 'Export local iOS IPA') throw Error('fixture export failed');}), /fixture export failed/);
    assert.equal(readFileSync(plan.android!.output!, 'utf8'), 'old apk'); assert.equal(readFileSync(plan.ios!.output!, 'utf8'), 'old ipa');
    rmSync(join(f.root, 'ios'), {recursive: true});
    assert.throws(() => createMobilePlan({root: f.root, action: 'build', target: 'all', platform: 'darwin', env: f.env}), /Native iOS/);
    assert.equal(readFileSync(plan.android!.output!, 'utf8'), 'old apk');
  } finally {f.clean();}
});
test('combined sync builds once, syncs both platforms and produces no artifact/work directories', () => {
  const f = fixture();
  try {
    const plan = createMobilePlan({root: f.root, action: 'sync', target: 'all', platform: 'darwin', env: f.env}), labels: string[] = [];
    assert.deepEqual(executeMobilePlan(plan, c => {labels.push(c.label);}), []);
    assert.deepEqual(labels, ['Build web app', 'Sync Capacitor Android', 'Sync Capacitor iOS']);
    assert.ok(!existsSync(join(f.root, '.mobile-build'))); assert.ok(!existsSync(join(f.root, '.android-user')));
  } finally {f.clean();}
});
test('simulator directory export replaces stale contents only after validating the new product', () => {
  const f = fixture();
  try {
    const plan = createMobilePlan({root: f.root, action: 'simulator', platform: 'darwin', env: f.env});
    mkdirSync(plan.ios!.output!, {recursive: true}); writeFileSync(join(plan.ios!.output!, 'Stale'), 'old');
    assert.throws(() => exportIosArtifact(plan.ios!), /missing/); assert.ok(existsSync(join(plan.ios!.output!, 'Stale')));
    executeMobilePlan(plan, () => createOutputs(plan));
    assert.ok(!existsSync(join(plan.ios!.output!, 'Stale'))); assert.ok(existsSync(join(plan.ios!.output!, 'Info.plist')));
  } finally {f.clean();}
});
test('invalid output/mode combinations and ambiguous iOS configuration are rejected', () => {
  const f = fixture({project: 'ios/App/App.xcodeproj', workspace: 'ios/App/App.xcworkspace'});
  try {
    assert.throws(() => createIosPlan({root: f.root, action: 'ipa', platform: 'darwin', env: f.env}), /not both/);
    assert.throws(() => createMobilePlan({root: f.root, action: 'apk', target: 'ios', platform: 'darwin', env: f.env}), /Android actions/);
    assert.throws(() => createMobilePlan({root: f.root, action: 'simulator', target: 'all', platform: 'darwin', env: f.env}), /ios-mode/);
    assert.throws(() => parseArgs(['build', '--platform', 'web']), /android, ios or all/);
    assert.throws(() => parseArgs(['build', '--ios-mode', 'unknown']), /simulator, archive or ipa/);
    assert.throws(() => parseArgs(['--android-format', 'exe']), /apk or bundle/);
    const parsed = parseArgs(['build', '--platform', 'all', '--ios-mode', 'simulator', '--android-format', 'bundle', '--dry-run']);
    assert.equal(parsed.target, 'all'); assert.equal(parsed.iosMode, 'simulator'); assert.equal(parsed.androidFormat, 'bundle');
  } finally {f.clean();}
});

test('iOS-only applications do not require Android settings, wrapper or SDK', () => {
  const f = fixture();
  try {
    const packagePath = join(f.root, 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as {androidBuild?: unknown; iosBuild: Partial<IosBuildConfig>};
    delete pkg.androidBuild; pkg.iosBuild.artifactName = 'ExampleApp'; writeFileSync(packagePath, JSON.stringify(pkg));
    rmSync(join(f.root, 'android'), {recursive: true}); rmSync(join(f.root, '.android-sdk'), {recursive: true});
    const plan = createMobilePlan({root: f.root, action: 'simulator', platform: 'darwin', env: f.env});
    assert.equal(plan.android, undefined); assert.equal(plan.target, 'ios'); assert.equal(plan.commands.length, 3);
  } finally {f.clean();}
});
test('explicit legacy Android actions take precedence over generic build format options', () => {
  const f = fixture();
  try {
    const apk = createMobilePlan({root: f.root, action: 'apk', androidFormat: 'bundle', platform: 'darwin', env: f.env});
    const bundle = createMobilePlan({root: f.root, action: 'bundle', androidFormat: 'apk', platform: 'darwin', env: f.env});
    assert.ok(apk.commands[2]!.args.includes('assembleDebug')); assert.ok(bundle.commands[2]!.args.includes('bundleRelease'));
  } finally {f.clean();}
});
