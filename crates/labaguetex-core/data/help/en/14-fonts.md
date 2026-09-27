# Fonts

The font gives the document its character. labaguetex offers three ways to choose it, in *Format › Fonts…* or the command palette.

## LaTeX fonts (every engine)

Packages of the TeX distribution that also work with pdfLaTeX: Latin Modern, Libertinus, Palatino (newpx), Times (newtx), EB Garamond, Charter, Utopia, Kp-Fonts, STIX Two, Source Sans, Fira Sans, Roboto, Helvetica, Inconsolata, Source Code Pro… Several also provide matching maths.

The window shows a **compiled preview** (text, bold, italic, formula) and adds the right `\usepackage`; another font package of the same kind is commented out to avoid conflicts. If the package is not installed, install it from the **Packages** view.

## Fonts of the computer

Every font installed on your system can be used thanks to **fontspec** (XeLaTeX or LuaLaTeX):

```latex
\usepackage{fontspec}
\setmainfont{Georgia}
```

Choose its use: main text, sans serif text, code, mathematics (OpenType Math fonts only, with `unicode-math`), or a **new command** for a few words (`\newfontfamily\heading{…}` then `{\heading My title}`).

labaguetex checks that LaTeX finds the font (compiled preview), adds fontspec, can comment out `fontenc` and `inputenc` (not needed with fontspec) and builds the document with LuaLaTeX.

> Your co-authors need the same font installed. To share the project, prefer font files.

## Font files

Add `.ttf` or `.otf` files (downloaded from Google Fonts, Adobe Fonts…): labaguetex copies them into the `fonts/` folder of the project and names them in the preamble, style by style:

```latex
\setmainfont{sourceserif4-regular.otf}[
  Path = fonts/,
  BoldFont = sourceserif4-bold.otf,
  ItalicFont = sourceserif4-italic.otf,
  BoldItalicFont = sourceserif4-bolditalic.otf
]
```

The document then compiles anywhere, even on a computer where the font is not installed.

## Good to know

- The first LuaLaTeX build with a system font can take longer: LuaLaTeX prepares its list of fonts once and for all.
- To go back to the default font, delete (or comment out) the `\setmainfont` line or the `\usepackage` of the font.
