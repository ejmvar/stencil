import * as d from '@declarations';
import { DEFAULT_STYLE_MODE } from '@utils';
import { generateNativeAppCore } from '../component-native/generate-native-core';
import { getAllModes, replaceStylePlaceholders } from '../app-core/register-app-styles';
import { getBuildFeatures, updateBuildConditionals } from '../app-core/build-conditionals';
import { MIN_FOR_LAZY_LOAD } from './output-lazy-load';
import { sys } from '@sys';


export async function generateWebComponents(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx) {
  if (!buildCtx.requiresFullBuild && buildCtx.isRebuild && !buildCtx.hasScriptChanges) {
    return;
  }

  const selfContainedOutputTargets = (config.outputTargets as d.OutputTargetWebComponent[]).filter(o => {
    return (o.type === 'webcomponent');
  });

  const bundledOutputTargets = (config.outputTargets as d.OutputTargetBuild[]).filter(o => {
    if (o.type === 'www' || o.type === 'dist') {
      if (buildCtx.moduleFiles.length < MIN_FOR_LAZY_LOAD) {
        return true;
      }
    }
    return false;
  });

  if (selfContainedOutputTargets.length === 0 && bundledOutputTargets.length === 0) {
    return;
  }

  await buildCtx.stylesPromise;

  const promises = [
    generateSelfContainedWebComponents(config, compilerCtx, buildCtx, buildCtx.moduleFiles, selfContainedOutputTargets),
    generateBundledWebComponents(config, compilerCtx, buildCtx, buildCtx.moduleFiles, bundledOutputTargets as any)
  ];

  await Promise.all(promises);
}


async function generateSelfContainedWebComponents(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, moduleFiles: d.Module[], outputTargets: d.OutputTargetWebComponent[]) {
  if (outputTargets.length === 0) {
    return;
  }

  const timespan = buildCtx.createTimeSpan(`generate self-contained web components started`, true);

  const promises: Promise<any>[] = [];

  moduleFiles.forEach(moduleFile => {
    const p = moduleFile.cmps.map(async cmp => {
      const appCmps = [cmp];
      const outputText = await generateWebComponentCore(config, compilerCtx, buildCtx, appCmps);

      if (!buildCtx.hasError && typeof outputText === 'string') {
        await writeSelfContainedWebComponentModes(compilerCtx, outputTargets, appCmps, outputText);
      }
    });
    promises.push(...p);
  });

  await Promise.all(promises);

  timespan.finish(`generate self-contained web components finished`);
}


async function generateBundledWebComponents(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, moduleFiles: d.Module[], outputTargets: d.OutputTargetWebComponent[]) {
  if (outputTargets.length === 0) {
    return;
  }

  const timespan = buildCtx.createTimeSpan(`generate self-contained web components started`, true);

  const cmps = moduleFiles.reduce((cmps, m) => {
    cmps.push(...m.cmps);
    return cmps;
  }, [] as d.ComponentCompilerMeta[]);

  const bundleOutputs = await generateWebComponentCore(config, compilerCtx, buildCtx, cmps);

  if (Array.isArray(bundleOutputs) && !buildCtx.shouldAbort) {
    await writeBundledWebComponentModes(config, compilerCtx, outputTargets, cmps, bundleOutputs);
  }

  timespan.finish(`generate self-contained web components finished`);
}


async function generateWebComponentCore(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, cmps: d.ComponentCompilerMeta[]) {
  const build = getBuildFeatures(cmps) as d.Build;

  build.lazyLoad = false;
  build.es5 = false;
  build.slotPolyfill = false;
  build.polyfills = false;
  build.prerenderClientSide = false;
  build.prerenderServerSide = false;

  updateBuildConditionals(config, build);

  return await generateNativeAppCore(config, compilerCtx, buildCtx, cmps, build);
}


async function writeSelfContainedWebComponentModes(compilerCtx: d.CompilerCtx, outputTargets: d.OutputTargetWebComponent[], cmps: d.ComponentCompilerMeta[], outputText: string) {
  const promises: Promise<any>[] = [];

  const allModes = getAllModes(cmps);

  allModes.forEach(modeName => {
    const modeOutputText = replaceStylePlaceholders(cmps, modeName, outputText);

    cmps.forEach(cmp => {
      outputTargets.forEach(async outputTarget => {
        promises.push(
          writeSelfContainedWebComponentModeOutput(compilerCtx, outputTarget, cmp, modeOutputText, modeName)
        );
      });
    });
  });

  await Promise.all(promises);
}


async function writeSelfContainedWebComponentModeOutput(compilerCtx: d.CompilerCtx, outputTarget: d.OutputTargetWebComponent, cmpMeta: d.ComponentCompilerMeta, modeOutputText: string, modeName: string) {
  let fileName = `${cmpMeta.tagName}`;
  if (modeName !== DEFAULT_STYLE_MODE) {
    fileName += `.${modeName}`;
  }
  fileName += `.js`;

  const filePath = sys.path.join(outputTarget.dir, fileName);

  await compilerCtx.fs.writeFile(filePath, modeOutputText);
}


async function writeBundledWebComponentModes(config: d.Config, compilerCtx: d.CompilerCtx, outputTargets: d.OutputTargetWebComponent[], cmps: d.ComponentCompilerMeta[], _bundleOutputs: d.RollupResult[]) {
  const allModes = getAllModes(cmps);

  const promises: Promise<any>[] = [];

  allModes.forEach(modeName => {
    outputTargets.map(async outputTarget => {
      promises.push(
        writeBundledWebComponentOutputMode(config, compilerCtx, outputTarget, modeName, modeName)
      );
    });
  });

  await Promise.all(promises);
}


async function writeBundledWebComponentOutputMode(config: d.Config, compilerCtx: d.CompilerCtx, outputTarget: d.OutputTargetWebComponent, modeOutputText: string, modeName: string) {
  let fileName = `${config.fsNamespace}`;
  if (modeName !== DEFAULT_STYLE_MODE) {
    fileName += `.${modeName.toLowerCase()}`;
  }
  fileName += `.js`;

  const filePath = sys.path.join(outputTarget.buildDir, fileName);

  await compilerCtx.fs.writeFile(filePath, modeOutputText);
}