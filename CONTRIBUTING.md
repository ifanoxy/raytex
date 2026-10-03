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

- `RAYTEX_SELFTEST_SCENES=workflow` with `RAYTEX_SELFTEST_ASSETS=<folder>`: creates an empty project in that folder, then checks templates and their thumbnails, live compilation, undo / redo, the formatting bar, `$` typing, linked environments and the panels; `=media` (assets: test images) checks the image, TikZ and font tools; `=fixes` writes a document full of mistakes, checks the suggestions, Alt+Enter and **Fix all** until it compiles; `=1` walks through the main screens for screenshots (each logs `scene: <name>`). `=shots` puts the window at 1400 × 813 and shows the editor with its PDF, the TikZ studio and the problems panel in the light and the dark theme, in French and English; `scripts/screenshots.mjs` crops them into `docs/screenshots/`.
- `RAYTEX_CONFIG_DIR=<folder>`: settings, session and cache in that folder, so the check never touches those of an installed RayTeX.
- `RAYTEX_SELFTEST_KEEP=1`: leaves the window open at the end.

The continuous integration runs the same checks on Linux, macOS and Windows, and the tests needing TeX (engine and end-to-end scenes of the application) with TeX Live on Linux and Windows; MiKTeX on Windows runs the same tests for information (it downloads packages while they run, so a failure of its servers does not make the run red). On Windows, see [docs/WINDOWS.md](docs/WINDOWS.md) (prerequisites, PowerShell syntax of the variables, what to check by hand).

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

The logo is in `assets/` (the icon, the wordmark for light and dark backgrounds, the ray alone); `public/assets` holds the copies the application shows, `crates/raytex-desktop/icons` the icons made from it with `npx tauri icon assets/logo.svg -o crates/raytex-desktop/icons`.

Formats are described in [docs/knowledge-base.md](docs/knowledge-base.md).

## Website

The website (landing page, downloads, versions, guide, FAQ, legal pages), in English and French, is in `site/`: plain HTML written by `site/build.mjs` from the pages in `site/src/pages`, no dependency.

```bash
npm run site          # build and serve it at http://localhost:4173/raytex/, with sample versions
npm run site:build    # build it into site/dist
```

The *Website* workflow publishes it on GitHub Pages (Settings → Pages → Source: *GitHub Actions*) at each change of `site/` and each time a release is published: the download pages then list every published version and its files, which stay hosted in the GitHub releases. For a custom domain, set the repository variable `SITE_URL` and add the domain in the Pages settings.

## Releasing

1. Update the version in `Cargo.toml` (`[workspace.package]`), `package.json` and `crates/raytex-desktop/tauri.conf.json`, and give the *Unreleased* section of `CHANGELOG.md` its version and date.
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. The *Release* workflow builds macOS (Apple silicon and Intel), Windows and Linux and prepares a draft release with the installers; check it, write the notes from the changelog, and publish it.
4. Publishing the release rebuilds the website: its download page offers the new version (the notes written in the release are shown on its *Versions* page).

The installers are signed (Windows by SignPath, macOS by Apple) once the secrets described in [docs/SIGNING.md](docs/SIGNING.md) are set; every release also gets `SHA256SUMS.txt` and a build provenance attestation.

## Reporting a bug

Please include your operating system, your TeX distribution (the output of `raytex doctor` helps), what you expected, what happened, and if possible a small `.tex` file that reproduces the problem.

## License

By contributing, you agree that your contributions are dual-licensed under the MIT and Apache 2.0 licenses, like the rest of the project.
