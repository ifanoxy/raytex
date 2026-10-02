# The RayTeX logo

A **manta ray** — the *Ray* of RayTeX — in two violets, drawn with
calligraphic strokes (curled fins, a dotted spine, a long sinuous tail).
The shape is traced from the drawing (`trace.py` → `ray.json`); the drawing
is still a working version.

The wordmark puts the ray next to **Ray\TeX** (T, lowered E, X), typeset by
LaTeX itself in bold Latin Modern and converted to outlines.

| File | Use |
|---|---|
| `../logo.svg` | Application icon (1024×1024): the ray on a lavender tile |
| `ray.svg` | The ray alone |
| `logo-mark-dark.svg` | Wordmark for dark backgrounds |
| `logo-mark-light.svg` | Wordmark for light backgrounds |

## Rebuild

```bash
cd assets/logo
python3 trace.py                 # only when the drawing changes (needs its photo)
latex letters.tex
dvisvgm --no-fonts --exact-bbox --precision=3 letters.dvi -o letters.svg
python3 build.py
cp ../logo.svg logo-mark-dark.svg logo-mark-light.svg ../../public/assets/
cd ../..
npx tauri icon assets/logo.svg -o crates/raytex-desktop/icons
rm -rf crates/raytex-desktop/icons/android crates/raytex-desktop/icons/ios
```

Latin Modern is distributed under the GUST Font License; only the glyph
outlines of the letters are used here. The logo is under the same licence
as the rest of the project.
