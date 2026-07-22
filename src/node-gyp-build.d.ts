/**
 * Minimal ambient declaration for `node-gyp-build`, which ships no bundled
 * TypeScript types. It resolves and loads the correct prebuilt (or locally
 * compiled) `.node` addon for the current platform/arch/ABI given a package
 * root directory, returning the addon's `module.exports`.
 */
declare module 'node-gyp-build' {
  /**
   * Load the native addon located under `dir` (the package root that contains
   * `prebuilds/` and/or `build/Release`).
   *
   * @param dir Absolute path to the package root.
   * @returns The native addon's exports (typed by callers).
   */
  function nodeGypBuild(dir: string): unknown;
  export = nodeGypBuild;
}
