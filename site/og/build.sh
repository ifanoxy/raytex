#!/bin/sh
# Builds the images of the site that come from the logo: og.png (a page
# typeset by LaTeX, og.tex), the favicon and the Apple touch icon.
# Needs LuaLaTeX (or pdfLaTeX), rsvg-convert and macOS's sips.
set -e
cd "$(dirname "$0")"
img=../assets/img
rsvg-convert -f pdf -o ray.pdf ../../assets/logo/ray.svg
pdflatex -interaction=nonstopmode -halt-on-error og.tex >/dev/null
sips -s format png og.pdf --out "$img/og.png" >/dev/null
rsvg-convert -w 32 -h 32 ../../assets/logo.svg -o "$img/favicon-32.png"
rsvg-convert -w 180 -h 180 ../../assets/logo.svg -o "$img/apple-touch-icon.png"
rm -f og.aux og.log og.pdf ray.pdf
