# Third-party components

RayTeX is licensed under MIT or Apache-2.0 (see [LICENSE-MIT](LICENSE-MIT) and
[LICENSE-APACHE](LICENSE-APACHE)). The application ships or builds on the
following components, which keep their own licenses.

## Shipped with the application

| Component | Use | License |
|---|---|---|
| [Inter](https://rsms.me/inter/) (`@fontsource-variable/inter`) | Interface font | SIL Open Font License 1.1 |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (`@fontsource-variable/jetbrains-mono`) | Editor font | SIL Open Font License 1.1 |
| [pdf.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) | PDF viewer | Apache-2.0 |
| [KaTeX](https://katex.org) and its fonts | Formula previews | MIT |
| [CodeMirror 6](https://codemirror.net) | Editor | MIT |
| [@replit/codemirror-vim](https://github.com/replit/codemirror-vim) | Vim mode | MIT |
| [Svelte](https://svelte.dev) | Interface framework | MIT |
| [Tauri](https://tauri.app) and its plugins | Desktop shell | MIT or Apache-2.0 |
| Latin Modern (glyph outlines of T, E, X in the logo) | Logo | GUST Font License |

The thumbnails of the templates (`crates/raytex-desktop/thumbnails`) are
pictures of documents made by RayTeX's own templates with Latin Modern and
the other fonts of the templates (SIL Open Font License, GUST Font License).

## Rust crates

The engine and the desktop application use the crates listed in
[`Cargo.lock`](Cargo.lock). They are under permissive licenses: MIT,
Apache-2.0, BSD-2/3-Clause, ISC, Zlib, Unicode-3.0, Unlicense, CC0, BSL-1.0;
a few crates brought by Tauri and ureq are under MPL-2.0 (`cssparser`,
`selectors`, `dtoa-short`, `option-ext`, used unmodified) and
CDLA-Permissive-2.0 (`webpki-roots`, the list of root certificates).

To list every crate with its license:

```bash
cargo install cargo-about && cargo about generate --format json
```

## TeX

RayTeX does not ship TeX: it drives the distribution installed on the
computer (TeX Live, MacTeX, MiKTeX, TinyTeX, Tectonic), whose packages have
their own licenses. The documentation of commands and packages in
`crates/raytex-core/data` is written for RayTeX; package keys offered by the
completion may also be read from the installed packages' sources, on the
user's computer.
