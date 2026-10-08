# Versioning policy

`@homaiohq/napi-quickfix` follows [Semantic Versioning](https://semver.org/), with
the pre-1.0 conventions described below. This is the canonical reference for how
releases are numbered; contributors should map their change to a bump using the rules
here.

## Scheme

The package is currently in the **`0.x` (pre-1.0)** phase. While in `0.x`:

- **PATCH** (`0.1.0 → 0.1.1`) — backward-compatible changes only.
- **MINOR** (`0.1.x → 0.2.0`) — everything else. Pre-1.0 has no major channel, so **new
  features and breaking changes both bump the minor**.
- There are **no MAJOR bumps** until the deliberate promotion to `1.0.0`.

### Consumer guidance

Under npm's special 0.x rules, a caret range locks the minor:

```
^0.1.0  ===  >=0.1.0 <0.2.0
```

So every breaking minor bump (`0.1.x → 0.2.0`) already requires an explicit opt-in from
consumers on a `^` range. Pin `^0.1.0` (the default) and treat a minor bump pre-1.0 as
"review the changelog before upgrading".

## What counts as each bump

Because this package ships a compiled native addon, "breaking" is broader than the
JavaScript/TypeScript surface. Classify every change into one bucket. Pre-1.0 the first
two buckets both bump **MINOR**; post-1.0 the first bumps **MAJOR**.

### Breaking (pre-1.0: MINOR · post-1.0: MAJOR)

- Removing, renaming, or changing the signature/semantics of any exported TS API.
- An incompatible behavior change in the QuickFIX bindings.
- Raising the minimum Node version (`engines.node`, currently `>=22`).
- Dropping a supported platform/arch prebuild (e.g. removing `darwin-x64`).
- Raising the N-API floor (currently v9) such that an in-range Node loses support.
- Changing the module format / `exports` map in a non-additive way.

### Feature (pre-1.0: MINOR · post-1.0: MINOR)

- New exported API or newly bound QuickFIX functionality — additive, backward-compatible.
- Adding a new platform/arch prebuild (e.g. Linux musl).
- Adding support for a new Node LTS (e.g. Node 28) with no existing support removed.

### Patch (PATCH)

- Bug fixes in C++ or TS with no public API change.
- Rebuilding against updated build dependencies (`node-addon-api`, etc.) with no behavior
  change.
- Docs, CI, and internal build changes that leave the published surface identical.

## Conventional Commits

Commits and PR titles should follow
[Conventional Commits](https://www.conventionalcommits.org/). This makes the intended
bump explicit per change and keeps the door open for automating releases later
(release-please, changesets, etc. all read this format) without changing the policy above.

The type maps to the buckets as follows — note that **pre-1.0, breaking changes bump
MINOR, not MAJOR** (there is no major channel yet):

| Commit | Bucket | Pre-1.0 bump | Post-1.0 bump |
| --- | --- | --- | --- |
| `fix:` | Patch | PATCH | PATCH |
| `feat:` | Feature | MINOR | MINOR |
| `feat!:` / `fix!:` / `BREAKING CHANGE:` footer | Breaking | **MINOR** | MAJOR |
| `docs:`, `chore:`, `ci:`, `refactor:`, `test:` | Patch (no public change) | PATCH | PATCH |

Remember that "breaking" here is broader than the API surface (see the buckets above): a
Node-version floor bump, a dropped prebuild, or a behavior-changing QuickFIX upgrade should
carry a `!` / `BREAKING CHANGE:` marker even if no TS signature changed.

## Relationship to QuickFIX's version

Our version tracks **this wrapper's** API and observable behavior — **not** the upstream
QuickFIX release train.

QuickFIX is a **build-time, statically-linked** dependency: `CMakeLists.txt` pins it via
`FetchContent ... GIT_TAG v1.16.0` with `QUICKFIX_SHARED_LIBS OFF`, so it is compiled
*into* the `.node` binary. Consumers never install or select it, so there is no
compatibility range to encode in our version number.

The numbers are decoupled, but the **impact is not**: changing the pinned QuickFIX version
alters the shipped binary and is classified under the buckets above —

- a QuickFIX upgrade that changes observable FIX behavior → **breaking** (pre-1.0: MINOR);
- a QuickFIX bump with no observable change (internal fix, rebuild) → **PATCH**.

The pinned QuickFIX version is recorded as a **provenance mapping** (our version → bundled
QuickFIX version) in the [CHANGELOG](./CHANGELOG.md), not as a compatibility table — a
matrix would imply a consumer choice that does not exist. Its value is security/audit
("which of our releases shipped a given QuickFIX version?") and change tracing.

## ABI note

The addon is **N-API-tagged** (`node.napi[.libc].node`), so a single prebuild per
platform/arch serves every supported Node LTS (22/24/26). The package version therefore
tracks the library's API/behavior, never the Node ABI: there is no per-Node versioning,
and adding a new in-ABI Node LTS is a *feature* bump, not a break.

## Prereleases

Prereleases use SemVer prerelease identifiers — `0.2.0-rc.1`, `0.2.0-beta.1` — tagged as
`v0.2.0-rc.1`.

- **Stable** releases are published to the npm `latest` dist-tag.
- **Prereleases** are published to the npm `next` dist-tag.

This keeps `npm install @homaiohq/napi-quickfix` on stable while testers opt in with
`@homaiohq/napi-quickfix@next`.

## Version ↔ tag contract

The `version` field in `package.json` is the single source of truth. The release git tag
**must** be `v<that version>` (e.g. `v0.1.0` for `0.1.0`). The release flow is:

1. Bump `version` in `package.json` per the rules above.
2. Update the [CHANGELOG](./CHANGELOG.md) (including the bundled QuickFIX version if it
   changed).
3. Commit, then tag `vX.Y.Z` and push the tag.
4. Pushing the tag triggers `.github/workflows/release.yml`, which builds the
   multi-platform prebuilds and publishes to npm via OIDC Trusted Publishing with
   automatic provenance (no npm token; see
   [CONTRIBUTING.md](./CONTRIBUTING.md#release-automation-npm-trusted-publishing)).
   A guard job fails the release before any prebuild runs if `package.json` and the tag
   disagree.

## Promotion to 1.0.0

Promote to `1.0.0` deliberately, once:

- the exported TS API has stabilized,
- the package has had real external users, and
- the supported platform/arch matrix is settled.

After `1.0.0`, switch to standard SemVer — breaking → MAJOR, feature → MINOR, fix →
PATCH — using the same change classification above.
