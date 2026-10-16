// Subject and answer key in the application: the switch of the document
// (read from the preamble of its main file as it is typed), turned from the
// preview, the pieces written from the Insert menu, and both PDFs exported
// (see `pdfexport.svelte.ts`).

import { type AnswerSwitch, answerSwitch, keyLang, type Piece, pieceSnippet, withAnswers, withPiece } from "../answerkey";
import { i18n, t } from "../i18n.svelte";
import type { DocVersion } from "../ipc";
import { app } from "./app.svelte";
import { build } from "./build.svelte";
import { editor } from "./editor.svelte";
import { project } from "./project.svelte";
import { ui } from "./ui.svelte";

/** The versions a document with a switch is exported as. */
export type Version = "subject" | "key";

class AnswerKeyStore {
  /** The switch of the main document, or null when it has none. */
  current = $derived.by((): AnswerSwitch | null => {
    void editor.revision;
    void editor.mainEdits;
    const main = project.info?.main;
    const text = main ? editor.headOf(main) : null;
    return text ? answerSwitch(text) : null;
  });
  /** The export of both was asked for (the window of the export opens with it chosen). */
  bothAsked = false;

  private get lang() {
    const main = project.info?.main;
    return keyLang((main && editor.headOf(main)) ?? "", i18n.lang === "fr" ? "fr" : "en");
  }

  /** Shows the answers or hides them: the switch turned in the document, then the PDF built again. */
  async show(shown: boolean) {
    const main = project.info?.main;
    if (!main || !this.current || this.current.shown === shown) return;
    await editor.transformRoot((text) => withAnswers(text, shown), main);
    if (app.settings?.build.autoBuild !== "off") void build.run({ auto: true });
  }

  /**
   * Writes a piece where the cursor is (the solution, an exercise, room to
   * answer), with what it needs in the preamble; said once when the
   * document gets its switch.
   */
  async insert(piece: Piece) {
    const view = editor.view;
    const tab = editor.activeTab;
    const main = project.info?.main;
    if (!view || !tab || tab.kind !== "tex" || tab.readOnly || !main) return;
    const lang = this.lang;
    const had = !!this.current;
    await editor.transformRoot((text) => withPiece(text, piece, lang), editor.active);
    const root = (await editor.rootOf(editor.active)) ?? main;
    const text = editor.textOf(root) ?? "";
    // In the class exam, a question goes in its list of questions.
    const before = view.state.sliceDoc(0, view.state.selection.main.from);
    const inQuestions = (before.match(/\\begin\{questions\}/g)?.length ?? 0) > (before.match(/\\end\{questions\}/g)?.length ?? 0);
    const snippet = pieceSnippet(text, piece, lang, inQuestions);
    if (!snippet) return;
    editor.insertSnippet(snippet, view, { block: piece === "solution" || (piece === "exercise" && !snippet.startsWith("\\question")) });
    view.focus();
    if (!had && answerSwitch(text)) ui.toast("info", t("answers.added"));
  }

  /** The text of the main file for a version. */
  versionOf(version: Version): DocVersion | null {
    const main = project.info?.main;
    const text = main ? editor.textOf(main) : null;
    if (!text || !this.current) return null;
    return { name: version === "subject" ? "sujet" : "corrige", text: withAnswers(text, version === "key") };
  }
}

export const answerKey = new AnswerKeyStore();
