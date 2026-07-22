// Authored (NOT compiled by tsc). Copied verbatim into dist/esm and dist/cjs by
// build:ts:copy. From either of those directories, two levels up is the package
// root, where prebuilds/ lives (and build/Release/*.node in local dev).
const path = require('node:path');
module.exports = require('node-gyp-build')(path.join(__dirname, '..', '..'));
