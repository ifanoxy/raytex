# Contributing to LaBagueTex

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
cargo test -p labaguetex-core --release -- --ignored
LABAGUETEX_SELFTEST=/path/to/a/project npm run app:dev   # prints PASSED or FAILED and quits
```

`tests/common_mistakes.rs` compiles about 110 documents made of common commands, each with a common mistake: every one must be reported with an explanation and an automatic fix, and the document must compile without error or warning once the fix is applied. Add a case there when you add a fix. `LBT_PROBE=1` prints the diagnostics instead of checking (to write a new case), `LBT_CASE=<text>` runs only the matching cases.

Optional variables of the end-to-end check (development builds only):

- `LABAGUETEX_SELFTEST_SCENES=workflow` with `LABAGUETEX_SELFTEST_ASSETS=<folder>`: creates an empty project in that folder, then checks templates and their thumbnails, live compilation, undo / redo, the formatting bar, `$` typing, linked environments and the panels; `=media` (assets: test images) checks the image, TikZ and font tools; `=fixes` writes a document full of mistakes, checks the suggestions, Alt+Enter and **Fix all** until it compiles; `=1` walks through the main screens for screenshots (each logs `scene: <name>`).
- `LABAGUETEX_CONFIG_DIR=<folder>`: settings, session and cache in that folder, so the check never touches those of an installed LaBagueTex.
- `LABAGUETEX_SELFTEST_KEEP=1`: leaves the window open at the end.

The continuous integration runs the same checks on Linux, macOS and Windows.

## Guidelines

- **Every package counts.** Never limit a feature to a hard-coded list of packages: the knowledge base adds documentation, it must not restrict what works.
- **Both languages.** Every user-facing text exists in English and French (`ui/lib/locales/en.ts` is the reference, `fr.ts` must have the same keys; engine texts use `Lang::pick` or `{ "en", "fr" }` in data files).
- **No surprises.** Commands that install or change the system are shown to the user before they run.
- **Performance.** Do engine work off the interface thread (IPC commands run on the blocking pool), keep IPC payloads small, avoid work proportional to the whole project on every keystroke.
- **Precision.** Diagnostics carry exact ranges; positions exchanged with the interface are 0-based lines and UTF-16 columns.
- **Style.** Follow the surrounding code: `rustfmt` (width 100), documented public items (`missing_docs` is enabled in the core), small focused modules; in the interface, Svelte 5 runes and typed IPC through `ui/lib/ipc.ts`.
- **Tests.** Add a unit test with every engine change; log parser changes come with a real log in `crates/labaguetex-core/tests/fixtures/logs/`.

## Adding content without writing Rust

- Package documentation: `crates/labaguetex-core/data/packages/<name>.json`
- A template: `crates/labaguetex-core/data/templates/<id>/`
- A help guide: `crates/labaguetex-core/data/help/{en,fr}/NN-id.md`
- An error explanation: `crates/labaguetex-core/data/errors.json`
- A snippet: `crates/labaguetex-core/data/snippets.json`

Formats are described in [docs/knowledge-base.md](docs/knowledge-base.md).

## Reporting a bug

Please include your operating system, your TeX distribution (the output of `baguette doctor` helps), what you expected, what happened, and if possible a small `.tex` file that reproduces the problem.

## License

By contributing, you agree that your contributions are dual-licensed under the MIT and Apache 2.0 licenses, like the rest of the project.
