# Contributing to RayTeX

Thank you for helping! Contributions of every kind are welcome: bug reports, documentation of packages, templates, translations, code.

## Getting started

```bash
npm install
npm run app:dev            # desktop application with hot reload
npm run dev                # interface alone in a browser, with a simulated engine (ui/dev/mocks.ts)
cargo test --workspace     # engine tests
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is organised.

## Before opening a pull request

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm run check              # svelte-check, no errors and no warnings
npm run build
```

With a TeX distribution installed, also run the integration tests and the end-to-end check of the application:

```bash
cargo test -p raytex-core --release -- --ignored
node scripts/e2e.mjs            # the scenes of the real application, with a screenshot at each step (e2e-output/)
node scripts/e2e.mjs fixes      # one group: workflow, fixes, files, projects or media
E2E_LANG=en node scripts/e2e.mjs  # the scenes with the interface in English
```

`scripts/e2e.mjs` runs `npm run app:dev` on a fresh copy of `tests/e2e/rapport` with a fresh configuration, so it never touches an installed RayTeX (stop any other `npm run dev` first: the port 1420 must be free).

`tests/common_mistakes.rs` compiles about 110 documents made of common commands, each with a common mistake: every one must be reported with an explanation and an automatic fix, and the document must compile without error or warning once the fix is applied. Add a case there when you add a fix. `LBT_PROBE=1` prints the diagnostics instead of checking (to write a new case), `LBT_CASE=<text>` runs only the matching cases.

Optional variables of the end-to-end check (development builds only):

- `RAYTEX_SELFTEST_SCENES=workflow` with `RAYTEX_SELFTEST_ASSETS=<folder>`: creates an empty project in that folder, then checks templates and their thumbnails, live compilation, undo / redo, the formatting bar, `$` typing, linked environments and the panels; `=media` (assets: test images) checks the image, TikZ and font tools; `=fixes` writes a document full of mistakes, checks the suggestions, Alt+Enter and **Fix all** until it compiles; `=1` walks through the main screens for screenshots (each logs `scene: <name>`).
- `RAYTEX_CONFIG_DIR=<folder>`: settings, session and cache in that folder, so the check never touches those of an installed RayTeX.
- `RAYTEX_SELFTEST_KEEP=1`: leaves the window open at the end.

The continuous integration runs the same checks on Linux, macOS and Windows, and the tests needing TeX with TeX Live (Linux) and MiKTeX (Windows). On Windows, see [docs/WINDOWS.md](docs/WINDOWS.md) (prerequisites, PowerShell syntax of the variables, what to check by hand).

## Guidelines

- **Every package counts.** Never limit a feature to a hard-coded list of packages: the knowledge base adds documentation, it must not restrict what works.
- **Both languages.** Every user-facing text exists in English and French (`ui/lib/locales/en.ts` is the reference, `fr.ts` must have the same keys; engine texts use `Lang::pick` or `{ "en", "fr" }` in data files).
- **No surprises.** Commands that install or change the system are shown to the user before they run.
- **Performance.** Do engine work off the interface thread (IPC commands run on the blocking pool), keep IPC payloads small, avoid work proportional to the whole project on every keystroke.
- **Precision.** Diagnostics carry exact ranges; positions exchanged with the interface are 0-based lines and UTF-16 columns.
- **Style.** Follow the surrounding code: `rustfmt` (width 100), documented public items (`missing_docs` is enabled in the core), small focused modules; in the interface, Svelte 5 runes and typed IPC through `ui/lib/ipc.ts`.
- **Tests.** Add a unit test with every engine change; log parser changes come with a real log in `crates/raytex-core/tests/fixtures/logs/`.

## Adding content without writing Rust

- Package documentation: `crates/raytex-core/data/packages/<name>.json`
- A template: `crates/raytex-core/data/templates/<id>/`
- A help guide: `crates/raytex-core/data/help/{en,fr}/NN-id.md`
- An error explanation: `crates/raytex-core/data/errors.json`
- A snippet: `crates/raytex-core/data/snippets.json`
- Keys and values of an argument (completion with documentation): `crates/raytex-core/data/keys.json`
- What a free argument expects (hint above the cursor): `crates/raytex-core/data/arguments.json`

After changing a built-in template, make its thumbnails again (macOS, or any system with Ghostscript):

```bash
RAYTEX_WRITE_THUMBNAILS=1 cargo test -p raytex-core --release -- --ignored write_bundled_thumbnails
```

The logo is built from LaTeX and a small script: see [assets/logo/README.md](assets/logo/README.md).

Formats are described in [docs/knowledge-base.md](docs/knowledge-base.md).

## Releasing

1. Update the version in `Cargo.toml` (`[workspace.package]`), `package.json` and `crates/raytex-desktop/tauri.conf.json`, and give the *Unreleased* section of `CHANGELOG.md` its version and date.
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. The *Release* workflow builds macOS (Apple silicon and Intel), Windows and Linux and prepares a draft release with the installers; check it, write the notes from the changelog, and publish it.

## Reporting a bug

Please include your operating system, your TeX distribution (the output of `raytex doctor` helps), what you expected, what happened, and if possible a small `.tex` file that reproduces the problem.

## License

By contributing, you agree that your contributions are dual-licensed under the MIT and Apache 2.0 licenses, like the rest of the project.
