# Subject and answer key

One file gives both the subject of a test and its answer key. Each solution is written right after its question: the subject hides it and leaves room to answer, the answer key shows it in a frame.

## Getting started

- A new project: the **Test with answer key** template (*Teachers* category).
- A document already there: **Insert › Subject and answer key › Solution**. RayTeX adds the switch (`\newif\ifanswers`) and the `solution` environment to the preamble, then writes the solution where the cursor is (the selected text goes in it).

The **Exam with answer key** (class `exam`) and **Exercise sheet** templates work the same way, as does any document that has a switch already: the class `exam` (`\printanswers`), the package `xsim` (`solution/print`), or a `\newif` or `\newtoggle` of its own named for the answers (`answers`, `solutions`, `corrections`…).

## Seeing the subject or the answer key

Above the preview, **Subject | Answer key** turns the switch in the preamble (one line: `\answersfalse` becomes `\answerstrue`, `% \printanswers` becomes `\printanswers`), then builds. Ctrl+Z goes back. The same choice is in *Insert › Subject and answer key › Show the solutions*, and in the command palette.

## Writing

The **Insert › Subject and answer key** submenu writes, at the cursor:

| Entry | What is written | With the class `exam` |
|---|---|---|
| Exercise with its points | `\begin{exercise}[4 points] … \end{exercise}`: "Exercise 1 (4 points)", numbered | `\question[2]` (in `questions`) |
| Solution | `\begin{solution} … \end{solution}`: framed in the answer key, left out of the subject; code or verbatim can go in it | `solution` |
| Lines to answer on | `\answerlines{5}`: five dotted lines | `\fillwithdottedlines{3cm}` |
| Room to answer | `\answerspace{3cm}`: a blank | `\makeemptybox{3cm}` |
| Grid to answer on | `\answergrid{4cm}`: 5 mm squares (TikZ) | `\fillwithgrid{4cm}` |

Lines, room and grid appear in the subject only. Each definition is written once in the preamble, with a comment saying what it does: the colour of the frame or its title are changed there. In a French document the names are French (`corrige`, `exercice`, `\lignesreponse`…). With `xsim`, only the exercise and the solution are offered: that package has settings of its own.

## Exporting

**Build ▾ › Export the subject and the answer key…** (or *Export both*, above the preview): choose the name of the subject, the answer key is written next to it ("Test - subject.pdf", "Test - answer key.pdf"). Each version is built apart: the document is not changed. The export window also offers either one alone, and gives the total of the points. Lighter pictures and PDF/A apply to both.
