# The labaguetex logo

The logo is the famous **LaTeX** lettering — L, raised small-cap A, T,
lowered E — whose **X is made of two crossed baguettes**.

The letters are typeset by LaTeX itself (Latin Modern, with the exact kerning
of the `\LaTeX` command), converted to outlines, then composed with the
baguettes by a small script.

| File | Use |
|---|---|
| `../logo.svg` | Application icon (1024×1024, night background) |
| `logo-mark-dark.svg` | Wordmark for dark backgrounds |
| `logo-mark-light.svg` | Wordmark for light backgrounds |

## Rebuild

```bash
cd assets/logo
latex letters.tex
dvisvgm --no-fonts --exact-bbox --precision=3 letters.dvi -o letters.svg
python3 build.py letters.svg
cd ../..
npx tauri icon assets/logo.svg -o crates/labaguetex-desktop/icons
```

Latin Modern is distributed under the GUST Font License; only the glyph
outlines of five letters are used here.
