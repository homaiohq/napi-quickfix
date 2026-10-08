---
name: upgrade-quickfix
description: Upgrade the pinned QuickFIX FIX-engine version that this napi-quickfix binding builds against. Use whenever the user wants to bump, upgrade, update, or move QuickFIX to a new version/tag/release (e.g. "upgrade quickfix", "bump quickfix to 1.16.1", "move to the latest quickfix", "update the FIX engine"), even if they don't name a version. Handles the CMake pin, doc references, a clean native rebuild, adapting the C++ bridge to any API breakage, running tests, classifying the change per the versioning policy, and updating package.json + CHANGELOG.md.
---

# Upgrade QuickFIX

This binding does not vendor QuickFIX. It fetches the QuickFIX C++ sources at
build time via CMake `FetchContent`, pinned to a single git tag, and statically
links them into the `.node` addon. "Upgrading QuickFIX" therefore means moving
that one pin, rebuilding against the new sources, fixing whatever the new
QuickFIX API broke in the C++ bridge, verifying behavior, and recording the
change under this project's versioning policy. The value of this skill is that
it knows exactly where the pin lives, where breakage surfaces, and how to
classify and record the result — so an upgrade is a mechanical, verifiable
operation instead of a hunt.

Work through the phases in order. Don't skip the build/test verification — a
bump that compiles but fails the loopback tests is a regression, not an upgrade.
The canonical rules for numbering and recording the release live in
`VERSIONING.md`; this skill applies them, so read that file if a classification
edge case comes up.

## Phase 1 — Resolve the target version

The single source of truth for the pin is `CMakeLists.txt`:

- Line ~26: `GIT_TAG vX.Y.Z`
- Line ~12: the comment `# ... Pinned to vX.Y.Z.`

Read the **current** version from `GIT_TAG` first — you'll need old→new for the
changelog provenance line and the version-bump decision.

Then determine the **target**:

- If the user named a version (e.g. "to 1.16.1", "v1.17"), use that. Normalize
  to the tag form QuickFIX uses: `vMAJOR.MINOR.PATCH` (tags on
  `quickfix/quickfix` are `v`-prefixed, e.g. `v1.16.0`).
- Otherwise, resolve the latest release tag from GitHub:

  ```bash
  gh release view --repo quickfix/quickfix --json tagName -q .tagName 2>/dev/null \
    || gh api repos/quickfix/quickfix/tags --jq '.[0].name'
  ```

  If `gh` is unavailable, fall back to `git ls-remote --tags --refs
  https://github.com/quickfix/quickfix.git 'v*'` and pick the highest semver.

Confirm the resolved target with the user in one line before changing files
(e.g. "Upgrading QuickFIX v1.16.0 → v1.16.1 — proceed?"), unless they already
gave an explicit version. If the target equals the current pin, say so and stop.

## Phase 2 — Move the pin and update the docs

Update the pin in `CMakeLists.txt` (both the `GIT_TAG` line and the comment),
then update every doc reference so the repo stays internally consistent. Grep
for the old version string rather than trusting a fixed list — references get
added over time:

```bash
grep -rn "OLD_VERSION" --include="*.md" CMakeLists.txt \
  README.md ARCHITECTURE.md CONTRIBUTING.md VERSIONING.md
```

Expect matches in: `README.md` (prose plus a dependency-table row
`| **QuickFIX** | vX.Y.Z ... |`), `ARCHITECTURE.md` (prose plus a mermaid node
`quickfix @ vX.Y.Z`), `CONTRIBUTING.md`, and `VERSIONING.md` (the illustrative
`GIT_TAG vX.Y.Z` in the "Relationship to QuickFIX's version" section). Update
all of them.

Do **not** touch `CHANGELOG.md` here — the bundled-QuickFIX line there is a
per-release provenance record, not a global version string. It gets a *new*
entry in Phase 6, and older entries stay as they were. Ignore matches under
`build/` and `node_modules/` — those are generated.

## Phase 3 — Clean rebuild (forces a fresh fetch)

The fetched QuickFIX sources are cached under `build/_deps/`. Because the pin
uses `GIT_SHALLOW TRUE`, a shallow clone only has the objects for the old tag,
so an incremental rebuild against a new tag can fail to check out. Remove the
build tree first so `FetchContent` re-clones at the new tag:

```bash
yarn clean   # removes dist/ and build/
yarn build   # build:native (cmake-js) then build:ts
```

Watch the configure step: it should log a git checkout of the **new** tag. If
the fetch itself fails (bad tag, network), fix that before anything else — the
tag may not exist or you normalized it wrong.

Once the fetch has landed, regenerate the typed `FIELD` table from the new
sources and rebuild the TypeScript so the checked-in file tracks the pin:

```bash
yarn gen:fields   # reads build/_deps/quickfix-src/src/C++/FixFieldNumbers.h
yarn build:ts
```

Inspect `git diff src/generated/fields.ts`. Added names are a feature; a
**removed or renumbered** name is a breaking change for consumers (they lose a
`FIELD.X` they may be using) — note it for the Phase 6 classification.

## Phase 4 — Fix C++ bridge breakage

If `build:native` fails to compile, the new QuickFIX changed an API the bridge
depends on. This is expected on minor/major bumps and is the part worth doing
carefully. The bridge lives entirely in `cpp/*.cpp` / `cpp/*.h` and leans on a
specific slice of the QuickFIX surface — knowing it tells you where to look:

- **Message layer**: `FIX::Message`, `FIX::FieldMap`, `FIX::SessionID`,
  `FIX::DataDictionary`, field access (`getField`/`setField`), header/trailer.
- **Session engine**: `FIX::SocketInitiator`, `FIX::SocketAcceptor`,
  `FIX::Application` (the virtual callbacks — `toApp`, `fromApp`, `onLogon`,
  etc.), `FIX::SessionSettings`, store/log factories (`FileStoreFactory`,
  `MemoryStoreFactory`, `ScreenLogFactory`, ...), `FIX::Session::sendToTarget`.
- **Exceptions**: `FIX::Exception` and its subclasses in `Exceptions.h`
  (`FieldNotFound`, `IncorrectDataFormat`, `RejectLogon`, `DoNotSend`, ...) —
  the error mapping in `cpp/errors.h` enumerates these, so a renamed or removed
  exception class breaks there.

Common breakage patterns across QuickFIX versions: a virtual signature in
`FIX::Application` gains/loses a parameter (breaks `application_bridge.cpp`); an
exception class is renamed or its constructor changes (breaks `errors.h`); a
header moves or a method is renamed. Read the actual compiler error, open the
new QuickFIX header (fetched under `build/_deps/quickfix-src/src/C++/`) to see
the current signature, and adapt the bridge to match.

Adapt the code to the new API — don't paper over it by pinning back or
`#ifdef`-ing away features. Rebuild until `yarn build` is clean. Keep a running
note of every C++ change, and — crucially for Phase 6 — of whether any change
alters **observable behavior** (a different rejection, a changed callback
payload) versus being a mechanical rename with identical behavior. That
distinction drives the version bump.

## Phase 5 — Verify with the test suite

A clean compile is necessary but not sufficient — the session engine is
exercised by real loopback tests. Run the full suite:

```bash
yarn test
```

The suite (`test/*.test.ts`) covers message build/parse, enums, the data
dictionary, error mapping, and a full initiator↔acceptor `loopback.test.ts`.
`loopback` and `lifecycle` are the ones that catch behavioral regressions in a
QuickFIX bump — a green message test with a red loopback means the wire
behavior changed. Investigate any failure; if it reflects an intentional
QuickFIX behavior change, note it as an observable behavior change (it affects
the Phase 6 classification) rather than forcing the old result.

## Phase 6 — Classify, bump the version, and record the changelog

Follow `VERSIONING.md`. The essential thing it establishes: **this package's
version is decoupled from QuickFIX's version.** It tracks *this wrapper's* API
and observable behavior, not QuickFIX's release train. So do **not** mirror
QuickFIX's own bump type (a QuickFIX minor bump does not imply a napi minor).
Classify by impact instead:

- **No observable change** — internal QuickFIX fix, a pure rebuild, or a
  mechanical bridge rename that leaves behavior identical (tests unchanged) →
  **PATCH** (`0.1.0 → 0.1.1`).
- **Observable behavior change** — the FIX bindings behave differently (a
  changed rejection/error, altered callback payload, a test you had to update to
  match new behavior), OR the upgrade forces a min-Node bump / drops a
  platform / changes the exports map → this is **breaking**, which pre-1.0 is a
  **MINOR** (`0.1.x → 0.2.0`), not a major.
- **New bound functionality** exposed to consumers → **feature**, also MINOR
  pre-1.0.

Propose the bump with your reasoning and let the user confirm before writing
`package.json` (e.g. "QuickFIX v1.16.0 → v1.17.0 changed the SequenceReset
rejection; loopback test updated → observable behavior change → breaking →
suggest 0.1.0 → 0.2.0"). Remember the version↔tag contract in `VERSIONING.md`:
`package.json` `version` is the single source of truth and the release tag must
be `v<that version>`; a CI guard fails the release if they disagree. You only
set `version` here — you do not tag or push.

**CHANGELOG.md** (Keep a Changelog format, already in the repo): add the change
under `## [Unreleased]`, using the standard subsections (`### Changed`,
`### Fixed`, `### Added`). Two things every QuickFIX upgrade needs there:

- the change itself, terse and user-facing (`### Changed` — "Upgrade bundled
  QuickFIX v1.16.0 → v1.17.0" plus any behavior change consumers would notice);
- the **provenance line** matching the existing style — "Bundles **QuickFIX
  vX.Y.Z** (statically linked)." — since each release records which QuickFIX it
  shipped for audit/security tracing (see VERSIONING's
  "Relationship to QuickFIX's version").

If the user has decided the release number, promote `[Unreleased]` to
`## [0.2.0] - Unreleased`; otherwise leave it under `[Unreleased]`.

## Phase 7 — Report (with a ready-to-use conventional commit)

Leave all changes uncommitted in the working tree for the user to review. Do
**not** commit, tag, or push — releasing is a separate, deliberate act (pushing
a `v*` tag triggers the publish workflow).

The repo uses **Conventional Commits**, and `VERSIONING.md` maps the type to the
bump. Hand the user a ready-to-paste commit subject consistent with your Phase 6
classification and the fact that QuickFIX is a build-time dependency:

- No observable change (PATCH) → `build(deps): upgrade QuickFIX v1.16.0 → v1.16.1`
  (or `fix(deps):` if it lands an upstream bug fix).
- Observable behavior change (breaking → MINOR pre-1.0) → carry a breaking
  marker so the intended bump is explicit, even though no TS signature changed:
  `build(deps)!: upgrade QuickFIX v1.16.0 → v1.17.0` with a `BREAKING CHANGE:`
  footer describing the behavior change.
- Newly bound QuickFIX functionality → `feat: ...`.

Keep the changelog wording and the commit subject consistent. Then summarize:

- QuickFIX: old → new version.
- Build: clean/failed, and if failed why.
- `FIELD` table: regenerated; count of names added / removed (removed = breaking).
- Tests: pass/fail counts, naming any failures and how you resolved them.
- C++ bridge changes: file-by-file, each flagged as behavior-preserving or
  behavior-changing.
- Classification and the proposed `package.json` bump (awaiting confirmation if
  not yet applied), with the one-line reasoning.
- Files touched, plus the suggested conventional commit subject/footer.

If the build or tests can't be made green, stop and report the blocker clearly
rather than leaving the tree in a half-upgraded state — a failed upgrade the
user knows about is better than a silent one they discover at release time.
