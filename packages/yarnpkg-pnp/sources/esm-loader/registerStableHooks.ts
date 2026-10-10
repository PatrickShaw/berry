import esmModule                                          from 'module';

import {load, type LoadContext, type LoadResult}          from './hooks/load';
import {resolve, type ResolveContext, type ResolveResult} from './hooks/resolve';
import type {Hook, NextHook}                              from './hooks/types';

type SyncHook<TContext, TResult> = (specifierOrUrl: string, context: TContext, next: NextHook<TContext, TResult>) => TResult;

// `registerHooks` landed in v22.15.0 and v23.5.0, after the `@types/node`
// version we compile against
type RegisterHooks = (hooks: {
  resolve: SyncHook<ResolveContext, ResolveResult>;
  load: SyncHook<LoadContext, LoadResult>;
}) => unknown;

// Unlike off-thread loaders, these hooks also run for `require()`. The PnP
// runtime in `.pnp.cjs` already patches the CJS loader, and the ESM hooks
// apply ESM rules (no extension probing, mandatory `source`), so CJS requests
// go straight to the next hook.
function skipRequire<TContext extends Pick<LoadContext, `conditions`>, TResult>(hook: Hook<TContext, TResult>): SyncHook<TContext, TResult> {
  return (specifierOrUrl, context, next) => {
    if (context.conditions?.includes(`require`))
      return next(specifierOrUrl, context);

    return hook(specifierOrUrl, context, next);
  };
}

/**
 * Registers the PnP hooks in-thread through `module.registerHooks`.
 *
 * @privateRemarks The generated `.pnp.loader.mjs` only calls this when
 * `pnpEnableStableLoader` is set (see `getESMLoaderTemplate`). It has to be
 * opt-in at runtime rather than at import time since the same bundle doubles
 * as the `--experimental-loader` entrypoint
 */
export function registerStableHooks() {
  const {registerHooks} = esmModule as unknown as {registerHooks?: RegisterHooks};
  if (typeof registerHooks !== `function`)
    throw new Error(`pnpEnableStableLoader requires module.registerHooks, which isn't available in Node.js ${process.versions.node} (needs v22.15.0+ or v23.5.0+)`);

  registerHooks({
    resolve: skipRequire(resolve),
    load: skipRequire(load),
  });
}
