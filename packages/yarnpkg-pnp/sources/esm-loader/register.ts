import esmModule                from 'module';

import {load as loadHook}       from './hooks/load';
import {resolve as resolveHook} from './hooks/resolve';
import './fspatch';

type HookContext = {conditions?: Array<string>};
type NextHook<TContext, TResult> = (specifierOrUrl: string, context: TContext) => TResult;
type Hook<TContext, TResult> = (specifierOrUrl: string, context: TContext, next: NextHook<TContext, TResult>) => TResult;

// `registerHooks` landed in v22.15.0 and v23.5.0, after the `@types/node`
// version we compile against
type RegisterHooks = (hooks: {
  resolve: Hook<Parameters<typeof resolveHook>[1], ReturnType<typeof resolveHook>>;
  load: Hook<Parameters<typeof loadHook>[1], ReturnType<typeof loadHook>>;
}) => unknown;

const registerHooks: RegisterHooks | undefined = (esmModule as {registerHooks?: RegisterHooks}).registerHooks;
if (typeof registerHooks !== `function`)
  throw new Error(`pnpEnableStableLoader requires module.registerHooks, which isn't available in Node.js ${process.versions.node} (needs v22.15.0+ or v23.5.0+)`);

// Unlike off-thread loaders, these hooks also run for `require()`. The PnP
// runtime in `.pnp.cjs` already patches the CJS loader, and the ESM hooks
// apply ESM rules (no extension probing, mandatory `source`), so CJS requests
// go straight to the next hook.
function skipRequire<TContext extends HookContext, TResult>(hook: Hook<TContext, TResult>): Hook<TContext, TResult> {
  return (specifierOrUrl, context, next) => {
    if (context.conditions?.includes(`require`))
      return next(specifierOrUrl, context);

    return hook(specifierOrUrl, context, next);
  };
}

registerHooks({
  resolve: skipRequire(resolveHook),
  load: skipRequire(loadHook),
});
