export * from './types';
export * from './generatePnpScript';
export * from './hydratePnpApi';
export * from './makeRuntimeApi';
export * from './generatePrettyJson';

import getBuiltESMLoaderSource from './esm-loader/built-loader';

/**
 * Appended to the loader to opt it into `module.registerHooks`. Shipping the
 * one bundle for both modes saves us a second compressed blob in the CLI.
 *
 * @privateRemarks The SDK wrappers sniff for this too, so they know whether
 * to `--import` the loader or `module.register` it
 */
export const STABLE_ESM_LOADER_MARKER = `registerStableHooks();`;

export function getESMLoaderTemplate({stable}: {stable: boolean}) {
  const source = getBuiltESMLoaderSource();

  return stable
    ? `${source}\n${STABLE_ESM_LOADER_MARKER}\n`
    : source;
}
