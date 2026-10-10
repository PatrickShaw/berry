import {Filename, PortablePath, npath, ppath, xfs}                from '@yarnpkg/fslib';
import {STABLE_ESM_LOADER_MARKER as PNP_STABLE_ESM_LOADER_MARKER} from '@yarnpkg/pnp';
import type {PnpApi}                                              from '@yarnpkg/pnp';
import {execFileSync}                                             from 'child_process';

import {STABLE_ESM_LOADER_MARKER, Wrapper}                        from '../sources/generateSdk';

const PACKAGE_NAME = `fake-sdk` as PortablePath;

const EXPERIMENTAL_LOADER = `export const resolve = (specifier, context, next) => next(specifier, context);\n`;
const STABLE_LOADER = `export function registerStableHooks() { globalThis.__registeredStableHooks = true; }\n${STABLE_ESM_LOADER_MARKER}\n`;

type WrapperOutput = {nodeOptions: string, registeredStableHooks: boolean};

// Just enough of a project for the wrapper to `require` the fake package
// through plain node_modules resolution, without a real PnP runtime
async function makeFakeProject(projectRoot: PortablePath): Promise<PnpApi> {
  const packageLocation = ppath.join(projectRoot, Filename.nodeModules, PACKAGE_NAME);

  await xfs.mkdirPromise(packageLocation, {recursive: true});
  await xfs.writeJsonPromise(ppath.join(packageLocation, Filename.manifest), {name: PACKAGE_NAME, version: `1.0.0`});
  await xfs.writeFilePromise(ppath.join(packageLocation, `index.js` as Filename), `console.log(JSON.stringify({nodeOptions: process.env.NODE_OPTIONS, registeredStableHooks: globalThis.__registeredStableHooks === true}));\n`);
  await xfs.writeFilePromise(ppath.join(projectRoot, Filename.pnpCjs), `exports.setup = () => {};\n`);

  const informations = new Map([
    [null, {packageLocation: npath.fromPortablePath(projectRoot), packageDependencies: new Map([[PACKAGE_NAME, `1.0.0`]])}],
    [PACKAGE_NAME, {packageLocation: npath.fromPortablePath(packageLocation), packageDependencies: new Map()}],
  ]);

  return {
    topLevel: {name: null, reference: null},
    getPackageInformation: ({name}: {name: PortablePath | null}) => informations.get(name) ?? null,
    getLocator: (name: string, reference: string) => ({name, reference}),
    resolveRequest: () => npath.fromPortablePath(ppath.join(projectRoot, Filename.pnpCjs)),
  } as unknown as PnpApi;
}

function runWrapper(wrapperPath: PortablePath): WrapperOutput {
  // Our own PnP runtime would otherwise leak into the wrapper through
  // NODE_OPTIONS and make it skip the setup we're trying to test
  const stdout = execFileSync(process.execPath, [npath.fromPortablePath(wrapperPath)], {
    env: {...process.env, NODE_OPTIONS: ``},
    encoding: `utf8`,
  });

  return JSON.parse(stdout);
}

describe(`generateSdk`, () => {
  it(`should use the same stable loader marker as @yarnpkg/pnp`, () => {
    expect(STABLE_ESM_LOADER_MARKER).toStrictEqual(PNP_STABLE_ESM_LOADER_MARKER);
  });

  it(`should pick the loader mode at runtime so wrappers don't go stale`, async () => {
    await xfs.mktempPromise(async projectRoot => {
      const pnpApi = await makeFakeProject(projectRoot);
      const target = ppath.join(projectRoot, `.yarn/sdks` as PortablePath);
      const loaderPath = ppath.join(projectRoot, Filename.pnpEsmLoader);

      const wrapper = new Wrapper(PACKAGE_NAME, {pnpApi, target});
      const wrapperPath = await wrapper.writeFile(`index.js` as PortablePath, {setupEnv: true});

      await xfs.writeFilePromise(loaderPath, EXPERIMENTAL_LOADER);
      const experimental = runWrapper(wrapperPath);
      expect(experimental.registeredStableHooks).toStrictEqual(false);
      expect(experimental.nodeOptions).toContain(`--experimental-loader`);
      expect(experimental.nodeOptions).not.toContain(`--import`);

      await xfs.writeFilePromise(loaderPath, STABLE_LOADER);
      const stable = runWrapper(wrapperPath);
      expect(stable.registeredStableHooks).toStrictEqual(true);
      expect(stable.nodeOptions).toContain(`--import`);
      expect(stable.nodeOptions).not.toContain(`--experimental-loader`);
    });
  });
});
