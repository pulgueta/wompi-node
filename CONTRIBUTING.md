# Contributing

Hello and welcome! Contributions are always welcome, no matter how large or small. Do you have a question? Do you want to contribute? Please read the guidelines below.

## Prerequisites

- **Node.js** `>= 20`
- **pnpm** `9.7.0` (the repo pins it via the `packageManager` field — `corepack enable` will pick it up automatically)
- **Git**

## Getting started

Clone the repository and move into it:

```bash
git clone https://github.com/pulgueta/wompi-sdk.git
cd wompi-sdk
```

Create a branch for your work:

```bash
git checkout -b my-branch
```

Install the dependencies:

```bash
pnpm install
```

## Project layout

This is a [Turborepo](https://turbo.build/repo) monorepo with pnpm workspaces:

```plaintext
apps
└── docs            # Astro documentation site
packages
├── core            # @pulgueta/wompi — the SDK (the published package)
└── ts              # @pulgueta/wompi-tsconfig — shared tsconfig
```

Most contributions touch `packages/core`. Its source lives under `src/` and its tests under `test/`.

## Common commands

Run these from the repository root:

| Command | Description |
| --- | --- |
| `pnpm build` | Build every package |
| `pnpm dev` | Run packages in watch/dev mode |
| `pnpm test` | Run the test suites |
| `pnpm test:cov` | Run the tests with coverage |
| `pnpm lint` | Lint and auto-fix with Biome |
| `pnpm format` | Format with Biome |
| `pnpm changeset` | Record a changeset for your changes |

## Testing

Tests run on [Vitest](https://vitest.dev/). Inside `packages/core`:

- `pnpm test` — watch mode (runs once automatically in CI)
- `pnpm exec vitest run` — a single, non-watch run
- `pnpm test:cov` — a single run with a coverage report

### Integration tests

The suites under `packages/core/test/integration/` exercise the **real Wompi sandbox**. They are gated on `WOMPI_PUBLIC_KEY` and skipped automatically when no credentials are present, so the default `pnpm test` and CI skip them.

To run them locally, create a `.env.local` at the repository root (it is git-ignored) with your sandbox credentials:

```bash
WOMPI_PUBLIC_KEY=pub_test_xxxxxxxx
WOMPI_PRIVATE_KEY=prv_test_xxxxxxxx
WOMPI_INTEGRITY_KEY=test_integrity_xxxxxxxx
```

`packages/core/test/setup.ts` loads that file before the suites run. Use sandbox keys only — never commit real credentials.

## Code style

Formatting and linting are handled by [Biome](https://biomejs.dev/) (2-space indentation, 100-column lines, `es5` trailing commas, LF line endings). Run `pnpm lint` and `pnpm format` before committing; CI enforces the same rules with `biome ci .`.

## Commit convention

Before making a PR, check if your commits comply with the convention used in the repository.

When making a commit, it is required to follow the appropriate convention as in the example:

- `feat:`: All changes that bring new code.
- `fix:`: Changes that fix a bug.
- `refactor:`: Code changes that neither fix a bug nor add a feature.
- `docs:`: Documentation changes (README, LICENSE, etc.).
- `build:`: Changes in the project build.
- `test:`: Changes that affect tests (adding new ones, removing tests, etc.),
- `ci:`: Changes in the project's CI/CD
- `chore:`: Any other changes that do not relate to the above

If you are interested in more details, you can visit
<https://www.conventionalcommits.org> or
[Angular Commit Message Guidelines](https://github.com/angular/angular/blob/22b96b9/CONTRIBUTING.md#-commit-message-guidelines).

## Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to version and publish packages. **Any pull request that changes `packages/core` must include a changeset.**

After making your changes, run:

```bash
pnpm changeset
```

Select the package, pick the bump type, and write a short summary:

- **patch** — bug fixes and internal changes with no API impact
- **minor** — new, backwards-compatible features
- **major** — breaking changes

This creates a Markdown file under `.changeset/`. Commit it alongside your changes — it becomes the changelog entry for the next release.

## Releasing

Releasing is automated and happens on `main`:

1. PRs are merged into `main`, each carrying its own changeset.
2. The **Release** workflow opens (or updates) a **"Version Packages"** PR that consumes the pending changesets, bumps versions, and updates the changelogs.
3. Merging the "Version Packages" PR publishes the new versions to npm.

Maintainers do not publish by hand. `pnpm version-packages` (apply changesets locally) and `pnpm release` (build + publish) exist for the automation and are not part of the normal contributor flow.

## Pull request checklist

Before opening a PR, make sure that:

- [ ] The branch is up to date with `main`.
- [ ] `pnpm build` succeeds.
- [ ] `pnpm test` passes.
- [ ] `pnpm lint` and `pnpm format` report no issues.
- [ ] A changeset is included if `packages/core` changed.
- [ ] Commits follow the commit convention above.
