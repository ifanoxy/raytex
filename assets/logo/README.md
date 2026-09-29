# The RayTeX logo

A **manta ray** — the *Ray* of RayTeX — gliding with the **\TeX** logo
(T, lowered E, X), typeset by LaTeX itself in bold Latin Modern and
converted to outlines. The ray is drawn in amber light, like the glow of a
ray under water at night.

| File | Use |
|---|---|
| `../logo.svg` | Application icon (1024×1024, night background): the ray above the letters |
| `logo-mark-dark.svg` | Wordmark for dark backgrounds: the ray, then the letters |
| `logo-mark-light.svg` | Wordmark for light backgrounds |

## Rebuild

```bash
cd assets/logo
latex letters.tex
dvisvgm --no-fonts --exact-bbox --precision=3 letters.dvi -o letters.svg
python3 build.py letters.svg
cp ../logo.svg logo-mark-dark.svg logo-mark-light.svg ../../public/assets/
cd ../..
npx tauri icon assets/logo.svg -o crates/raytex-desktop/icons
rm -rf crates/raytex-desktop/icons/android crates/raytex-desktop/icons/ios
```

The shape of the ray is in `build.py` (`RAY_BODY`, `RAY_TAIL`, in a box
1000 units wide). Latin Modern is distributed under the GUST Font License;
only the glyph outlines of three letters are used here. The logo is under
the same licence as the rest of the project.
