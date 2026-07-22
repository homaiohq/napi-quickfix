// Type declaration for the authored (not compiled) load-native.cjs, which
// resolves and loads the native addon via node-gyp-build. The default export is
// the addon's `module.exports`; native.ts casts it to the NativeModule contract.
declare const nativeModule: unknown;
export = nativeModule;
