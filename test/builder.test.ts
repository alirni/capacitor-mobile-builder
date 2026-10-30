import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPlan, describePlan, executePlan, type AndroidBuildConfig} from '../src/builder.js';
import {parseArgs} from '../src/args.js';
function fixture(config: Partial<AndroidBuildConfig> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'android builder test '));
  mkdirSync(join(root, 'android'), {recursive: true});
  writeFileSync(join(root, 'android/gradlew'), ''); writeFileSync(join(root, 'android/gradlew.bat'), '');
  mkdirSync(join(root, '.android-sdk/platforms/android-36'), {recursive: true});
  const cap = join(root, 'node_modules/@capacitor/cli'); mkdirSync(cap, {recursive: true});
  writeFileSync(join(cap, 'package.json'), JSON.stringify({name: '@capacitor/cli', bin: {cap: 'bin/capacitor'}}));
  writeFileSync(join(root, 'package.json'), JSON.stringify({version: '1.2.3', scripts: {build: 'vite build'}, androidBuild: {artifactName: 'TestGame', ...config}}));
  return {root, clean: () => rmSync(root, {recursive: true, force: true})};
}
test('dry-run planning has no filesystem mutations, keeps spaced paths and never exposes signing values', () => {
  const f = fixture({signingEnvPrefix: 'GAME'});
  try {
    const env = {JAVA_HOME: '/java', npm_execpath: '/tools with spaces/npm-cli.js', GAME_KEYSTORE: 'secret-file', GAME_STORE_PASSWORD: 'secret-password', GAME_KEY_ALIAS: 'secret-alias', GAME_KEY_PASSWORD: 'secret-key'};
    const plan = createPlan({root: f.root, action: 'bundle', env, platform: 'linux'});
    assert.equal(plan.commands.length, 3); assert.equal(plan.commands[0]!.args[0], env.npm_execpath);
    assert.equal(plan.commands[0]!.cwd, f.root); assert.ok(plan.output!.endsWith('TestGame-1.2.3-release.aab'));
    const summary = JSON.stringify(describePlan(plan));
    for (const value of ['secret-file', 'secret-password', 'secret-alias', 'secret-key']) assert.ok(!summary.includes(value));
    assert.ok(!existsSync(join(f.root, 'exports'))); assert.ok(!existsSync(join(f.root, '.android-user')));
    assert.deepEqual(env, {JAVA_HOME: '/java', npm_execpath: '/tools with spaces/npm-cli.js', GAME_KEYSTORE: 'secret-file', GAME_STORE_PASSWORD: 'secret-password', GAME_KEY_ALIAS: 'secret-alias', GAME_KEY_PASSWORD: 'secret-key'});
  } finally {f.clean();}
});
test('sync only builds web and syncs Capacitor, and needs no SDK or signing key', () => {
  const f = fixture();
  try {
    rmSync(join(f.root, '.android-sdk'), {recursive: true});
    const plan = createPlan({root: f.root, action: 'sync', env: {}, platform: 'linux'}), labels: string[] = [];
    executePlan(plan, command => {labels.push(command.label);});
    assert.deepEqual(labels, ['Build web app', 'Sync Capacitor Android']); assert.equal(plan.output, undefined);
    assert.ok(!existsSync(join(f.root, '.android-user')));
  } finally {f.clean();}
});
test('APK runs in order, preserves debug naming and exports only a successful output', () => {
  const f = fixture({offline: true});
  try {
    const plan = createPlan({root: f.root, action: 'apk', env: {JAVA_HOME: '/java'}, platform: 'linux'}), labels: string[] = [];
    assert.deepEqual(plan.commands[2]!.args, ['assembleDebug', '--offline', '--no-daemon']);
    executePlan(plan, command => {
      labels.push(command.label);
      if (command.label === 'Build Android') {mkdirSync(join(f.root, 'android/app/build/outputs/apk/debug'), {recursive: true}); writeFileSync(plan.source!, 'test apk');}
    });
    assert.deepEqual(labels, ['Build web app', 'Sync Capacitor Android', 'Build Android']);
    assert.equal(readFileSync(plan.output!, 'utf8'), 'test apk'); assert.ok(plan.output!.endsWith('TestGame-1.2.3-debug.apk'));
  } finally {f.clean();}
});
test('failed commands stop the pipeline and never replace an existing export', () => {
  const f = fixture();
  try {
    const plan = createPlan({root: f.root, action: 'apk', env: {}, platform: 'linux'}); mkdirSync(join(f.root, 'exports')); writeFileSync(plan.output!, 'existing apk');
    const labels: string[] = [];
    assert.throws(() => executePlan(plan, c => {labels.push(c.label); throw Error('build error');}), /build error/);
    assert.deepEqual(labels, ['Build web app']); assert.equal(readFileSync(plan.output!, 'utf8'), 'existing apk');
    assert.throws(() => executePlan(plan, () => {}), /missing or empty/);
    assert.equal(readFileSync(plan.output!, 'utf8'), 'existing apk');
  } finally {f.clean();}
});
test('explicit SDK and cache settings win, invalid SDK fails before execution, partial signing is rejected', () => {
  const f = fixture({signingEnvPrefix: 'GAME'});
  try {
    const sdk = join(f.root, 'explicit sdk'); mkdirSync(join(sdk, 'platforms/android-36'), {recursive: true});
    const plan = createPlan({root: f.root, action: 'apk', platform: 'linux', env: {ANDROID_SDK_ROOT: sdk, GRADLE_USER_HOME: '/custom/cache', ANDROID_USER_HOME: '/custom/user'}});
    assert.equal(plan.env.ANDROID_HOME, sdk); assert.equal(plan.env.GRADLE_USER_HOME, '/custom/cache'); assert.equal(plan.env.ANDROID_USER_HOME, '/custom/user');
    assert.throws(() => createPlan({root: f.root, action: 'apk', platform: 'linux', env: {ANDROID_HOME: '/missing'}}), /SDK API 36/);
    assert.throws(() => createPlan({root: f.root, action: 'bundle', platform: 'linux', env: {GAME_KEYSTORE: 'only-one'}}), /all four/);
  } finally {f.clean();}
});
test('unsigned bundle naming, project toolchains and Windows wrapper are supported', () => {
  const f = fixture({sdkPath: '.android-sdk', gradleUserHome: 'shared cache'});
  try {
    const plan = createPlan({root: f.root, action: 'bundle', platform: 'win32', env: {}, offline: false});
    assert.ok(plan.output!.endsWith('-release-unsigned.aab')); assert.equal(plan.signed, false);
    assert.deepEqual(plan.commands[2]!.args, ['/d', '/c', 'gradlew.bat', 'bundleRelease', '--no-daemon']);
    assert.equal(plan.env.GRADLE_USER_HOME, join(f.root, 'shared cache'));
  } finally {f.clean();}
});
test('CLI rejects unknown flags, multiple actions and missing project paths', () => {
  assert.throws(() => parseArgs(['--project']), /needs a path/); assert.throws(() => parseArgs(['--force']), /Unknown/);
  assert.throws(() => parseArgs(['apk', 'bundle']), /single action/);
  assert.equal(parseArgs(['sync', '--dry-run', '--offline']).dryRun, true);
  assert.equal(parseArgs(['apk', '--online']).offline, false);
});
test('configuration rejects unsafe build script names and unavailable scripts', () => {
  const f = fixture({buildScript: 'build; echo unsafe'});
  try {assert.throws(() => createPlan({root: f.root, action: 'sync', env: {}}), /Invalid build script/);} finally {f.clean();}
  const g = fixture({buildScript: 'missing'});
  try {assert.throws(() => createPlan({root: g.root, action: 'sync', env: {}}), /Missing package script/);} finally {g.clean();}
});

test('real subprocess pipeline handles spaced paths and copies a fixture artifact', {skip: process.platform === 'win32'}, () => {
  const f = fixture();
  try {
    const manager = join(f.root, 'fake manager.cjs');
    writeFileSync(manager, "require('node:fs').appendFileSync('steps.txt','build\\n');");
    const cap = join(f.root, 'node_modules/@capacitor/cli/bin'); mkdirSync(cap, {recursive: true});
    writeFileSync(join(cap, 'capacitor'), "require('node:fs').appendFileSync('steps.txt','sync\\n');");
    writeFileSync(join(f.root, 'android/gradlew'), '#!/bin/sh\nset -e\nprintf "gradle\\n" >> ../steps.txt\nmkdir -p app/build/outputs/apk/debug\nprintf "fixture artifact" > app/build/outputs/apk/debug/app-debug.apk\n');
    const plan = createPlan({root: f.root, action: 'apk', platform: process.platform, env: {...process.env, ANDROID_HOME: join(f.root, '.android-sdk'), ANDROID_SDK_ROOT: undefined, JAVA_HOME: '/test/java', npm_execpath: manager}});
    // Our fixture wrapper is executable; no actual Android SDK/Gradle build runs.
    chmodSync(join(f.root, 'android/gradlew'), 0o755);
    executePlan(plan);
    assert.equal(readFileSync(join(f.root, 'steps.txt'), 'utf8'), 'build\nsync\ngradle\n');
    assert.equal(readFileSync(plan.output!, 'utf8'), 'fixture artifact');
  } finally {f.clean();}
});
