import {mkdirSync, existsSync, statSync} from 'node:fs';
import {createPlan, describePlan, exportAndroidArtifact, runCommand, type Action, type BuildPlan, type Command, type CommandRunner, type PlanOptions} from './builder.js';
import {createIosPlan, describeIosPlan, prepareIosPlan, iosArtifactSource, exportIosArtifact, type IosAction, type IosPlan} from './ios.js';
export type Target = 'android' | 'ios' | 'all';
export type MobileAction = Action | IosAction | 'build';
export interface MobileOptions extends Omit<PlanOptions, 'action'> {
  action: MobileAction;
  target?: Target;
  androidFormat?: 'apk' | 'bundle';
  iosMode?: Exclude<IosAction, 'sync'>;
}
export interface MobilePlan {root: string; target: Target; commands: Command[]; env: NodeJS.ProcessEnv; android?: BuildPlan; ios?: IosPlan;}
export function createMobilePlan(options: MobileOptions): MobilePlan {
  const target = options.target ?? (['simulator', 'archive', 'ipa'].includes(options.action) ? 'ios' : 'android');
  if ((options.action === 'apk' || options.action === 'bundle') && target !== 'android') throw Error('apk/bundle are Android actions. Use build --platform all with --android-format instead.');
  if (['simulator', 'archive', 'ipa'].includes(options.action) && target !== 'ios') throw Error('Use build --platform all with --ios-mode for combined builds.');
  if (!['android', 'ios', 'all'].includes(target)) throw Error('Choose android, ios or all.');
  if (!['sync', 'apk', 'bundle', 'simulator', 'archive', 'ipa', 'build'].includes(options.action)) throw Error('Unknown build action.');
  const android = target === 'ios' ? undefined : createPlan({...options, action: options.action === 'sync' ? 'sync' : options.action === 'bundle' ? 'bundle' : options.action === 'apk' ? 'apk' : options.androidFormat ?? 'apk'});
  const ios = target === 'android' ? undefined : createIosPlan({...options, env: android?.env ?? options.env, action: options.action === 'sync' ? 'sync' : options.action === 'build' ? options.iosMode ?? 'ipa' : options.action as IosAction});
  if (android && ios && (android.config.buildScript ?? 'build') !== (ios.config.buildScript ?? 'build')) throw Error('Combined builds require the same web buildScript for both platforms.');
  return {root: android?.root ?? ios!.root, target, env: ios?.env ?? android!.env,
    commands: [...(android?.commands ?? []), ...(ios ? android ? ios.commands.slice(1) : ios.commands : [])], android, ios};
}
export function describeMobilePlan(plan: MobilePlan) {
  return {project: plan.root, target: plan.target, commands: plan.commands,
    android: plan.android ? describePlan(plan.android) : null, ios: plan.ios ? describeIosPlan(plan.ios) : null};
}
export function executeMobilePlan(plan: MobilePlan, runner: CommandRunner = runCommand) {
  // Both platform preflights completed before executing any web/native build.
  if (plan.android && plan.android.action !== 'sync') mkdirSync(plan.android.env.ANDROID_USER_HOME!, {recursive: true});
  if (plan.ios) prepareIosPlan(plan.ios);
  for (const command of plan.commands) runner(command, plan.env);
  // Validate every result before publishing any artifact in a combined build.
  if (plan.android?.source && (!existsSync(plan.android.source) || statSync(plan.android.source).size === 0)) throw Error('Expected Android output missing or empty. Existing exports were not replaced.');
  if (plan.ios) iosArtifactSource(plan.ios);
  const outputs: string[] = [];
  if (plan.android) {const result = exportAndroidArtifact(plan.android); if (result) outputs.push(result);}
  if (plan.ios) {const result = exportIosArtifact(plan.ios); if (result) outputs.push(result);}
  return outputs;
}
