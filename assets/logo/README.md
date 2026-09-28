# The RayTeX logo

The logo is the lettering of the **\LaTeX** logo — R, raised small caps AY,
T, lowered E — whose **X is made of two crossed rays of light**, with a
spark where they meet.

The letters are typeset by LaTeX itself (Latin Modern, with the kerning of
the `\LaTeX` command), converted to outlines, then composed with the rays by
a small script.

| File | Use |
|---|---|
| `../logo.svg` | Application icon (1024×1024, night background) |
| `logo-mark-dark.svg` | Wordmark for dark backgrounds |
| `logo-mark-light.svg` | Wordmark for light backgrounds (amber rays) |

## Rebuild

```bash
cd assets/logo
latex letters.tex
dvisvgm --no-fonts --exact-bbox --precision=3 letters.dvi -o letters.svg
python3 build.py letters.svg
cp ../logo.svg logo-mark-dark.svg logo-mark-light.svg ../../public/assets/
cd ../..
npx tauri icon assets/logo.svg -o crates/raytex-desktop/icons
```

Latin Modern is distributed under the GUST Font License; only the glyph
outlines of a few letters are used here.
