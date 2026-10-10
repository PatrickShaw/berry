export type MaybePromise<T> = T | Promise<T>;

export type NextHook<TContext, TResult> = (specifierOrUrl: string, context: TContext) => TResult;

/**
 * Our hooks are sync so they work with both hook APIs, but they still pass
 * through whatever `next` gives back - a Promise for `--experimental-loader`, a
 * plain value for `module.registerHooks`. Being generic over `next` keeps the
 * types honest for both without casting
 */
export type Hook<TContext, TResult> = <TNext extends MaybePromise<TResult>>(
  specifierOrUrl: string,
  context: TContext,
  next: NextHook<TContext, TNext>,
) => TNext | TResult;
