# Page layout

Margins, header, footer, a watermark: the **Page layout** window sets them with fields, and shows the result on real pages, compiled with the class and the preamble of your project, before anything is written in the document. Open it from **See all › Page**, or from the command palette (*Margins of the document…*, *Page styles…*).

## Margins

The **Margins** tab reads what the preamble already says (`\usepackage[…]{geometry}`, `\geometry{…}`, the options of the class) and shows it plainly:

- **ready-made margins**: normal (2.5 cm), narrow, moderate, wide, binding, or those of LaTeX by default;
- the **paper** (A4, A5, Letter…, or a size of your own), the **orientation** and **two-sided**, where the margins become *inner* and *outer*;
- the four margins, around a drawing of the page;
- the **header and footer**: the height kept for the header, its distance to the text, that of the text to the footer;
- the **binding** (the paper it takes) and the **margin notes**;
- the other options of `geometry`, kept as you write them.

A field left empty is worked out by LaTeX: its value is shown in grey. These values, like the size of the text area under the drawing, are not estimated: TeX measures them on the page of the preview. Write a number in the chosen unit (`2.5`), or a whole length (`1in`, `0.1\paperwidth`).

On the right, the pages are drawn with their frames: the text, the header, the footer, the notes.

- **Apply to the document** writes everything in one place of the preamble, as one change that can be undone:

  ```latex
  \usepackage{geometry}
  \geometry{top=2.5cm, bottom=2.5cm, left=3.5cm, right=2cm}
  ```

  What was said in several places is gathered there.
- **From here on** writes `\newgeometry{…}` at the cursor: these margins start there, on a new page (a title page, a very wide table, an appendix), and the rest of the document keeps its own.
- **Document margins from here** writes `\restoregeometry`: the pages that follow get the margins of the document back.

## Page styles

A **page style** is what repeats on the pages: the header, the footer, their rules, a watermark. The **Page styles** tab lists those the document defines (`\fancypagestyle`) and makes new ones:

- three fields for the **header**, three for the **footer**: left, centre, right. The buttons under the fields write the page number, "page 2 / 9", the title of the current chapter or section, the date, an image;
- the thickness of the **rule** under the header and above the footer (0 for none);
- **Mirror on even pages**, for a two-sided document: what is outside stays outside;
- a **watermark**: a text across the page (DRAFT, CONFIDENTIAL) whose colour, strength, size and angle you set, or an image.

The preview shows two pages in this style. If the header is taller than the room the page keeps for it, RayTeX says so and one click gives it the height LaTeX asks for.

## Giving a style to the pages you want

Under the code of the style, **Give "…" to**:

| Button | What it does |
|---|---|
| **The whole document** | `\pagestyle{name}` in the preamble. Click again to take it back. |
| **Title and chapter pages** | These pages have a style of their own (`plain`): they take yours instead. |
| **From here on** | `\pagestyle{name}` at the cursor: this page and those that follow. |
| **This page only** | `\thispagestyle{name}` at the cursor. |
| **Pages … to …** | By the numbers of the pages in the PDF (the first one is 1). |

To go back to a style of LaTeX from some place, the buttons `plain` (number alone), `empty` (nothing) and `headings` (titles at the top) write the matching `\pagestyle` at the cursor.

> A page that opens a chapter keeps the style its chapter gives it, even when its number is in a range: use *Title and chapter pages* for those.

**Save the style** writes its definition in the preamble, with the packages it needs (`fancyhdr`, and `eso-pic`, `graphicx`, `xcolor`, `lastpage` depending on what it holds). **Delete the style** also removes what used it in the preamble; *Undo* in the editor brings it back.

A style written by hand is read the same way; what the window cannot hold (a length, even pages that differ) is kept as it is in the definition.
