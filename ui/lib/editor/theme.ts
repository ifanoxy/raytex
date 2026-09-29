// CodeMirror theme built on the application's CSS variables, so that it
// follows the light/dark theme without reconfiguration.

import { EditorView } from "@codemirror/view";

/** Completion lists and their documentation (also used by the cells of the grid editor). */
const TOOLTIPS = {
  ".cm-tooltip": {
    backgroundColor: "var(--bg-elev-2)",
    color: "var(--text)",
    border: "1px solid var(--border-strong)",
    borderRadius: "10px",
    boxShadow: "var(--shadow)",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-ui)",
    fontSize: "13px",
    maxHeight: "22em",
    minWidth: "300px",
    maxWidth: "min(640px, 70vw)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    padding: "3px 10px 3px 6px",
    lineHeight: "1.5",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent-soft)",
    color: "var(--text)",
  },
  ".cm-completionLabel": { fontFamily: "var(--font-mono)", fontSize: "12.5px" },
  ".cm-completionMatchedText": { textDecoration: "none", color: "var(--accent)", fontWeight: "700" },
  ".cm-completionDetail": {
    marginLeft: "auto",
    paddingLeft: "14px",
    fontStyle: "normal",
    color: "var(--text-faint)",
    fontSize: "11.5px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "340px",
  },
  ".cm-completionInfo": {
    padding: "10px 12px",
    maxWidth: "420px",
    fontSize: "12.5px",
    lineHeight: "1.55",
  },
  ".cm-completionIcon": { width: "18px", opacity: "0.9", paddingRight: "0" },
};

export const tooltipTheme = EditorView.theme(TOOLTIPS);

export function editorTheme(fontFamily: string, fontSize: number, lineHeight: number) {
  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "var(--editor-bg)",
      color: "var(--text)",
      fontSize: `${fontSize}px`,
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily,
      lineHeight: String(lineHeight),
      overflow: "auto",
      // The characters as typed: no ligature turns `->`, `=>` or `<--`
      // into an arrow (JetBrains Mono, Fira Code…).
      fontVariantLigatures: "none",
      fontFeatureSettings: '"liga" 0, "calt" 0',
    },
    ".cm-content": {
      caretColor: "var(--accent)",
      padding: "10px 0 40vh",
    },
    ".cm-line": { padding: "0 16px 0 8px" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--selection) !important",
    },
    ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 5%, transparent)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text)" },
    ".cm-gutters": {
      backgroundColor: "var(--editor-gutter)",
      color: "var(--text-faint)",
      border: "none",
      paddingLeft: "6px",
    },
    ".cm-lineNumbers .cm-gutterElement": { minWidth: "32px", fontSize: "0.86em", paddingRight: "6px" },
    ".cm-foldGutter .cm-gutterElement": { color: "var(--text-faint)", cursor: "pointer" },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--bg-active)",
      border: "1px solid var(--border-strong)",
      color: "var(--text-muted)",
      borderRadius: "4px",
      padding: "0 6px",
      margin: "0 3px",
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "var(--accent-soft)",
      outline: "1px solid color-mix(in srgb, var(--accent) 50%, transparent)",
      borderRadius: "2px",
    },
    ".cm-nonmatchingBracket": { outlineColor: "var(--error)" },
    ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)" },
    ".cm-searchMatch": {
      backgroundColor: "color-mix(in srgb, var(--warning) 25%, transparent)",
      outline: "1px solid color-mix(in srgb, var(--warning) 60%, transparent)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "color-mix(in srgb, var(--warning) 45%, transparent)" },
    ".cm-panels": { backgroundColor: "var(--bg-elev)", color: "var(--text)", borderColor: "var(--border)" },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
    ".cm-panel.cm-search": { padding: "8px 10px", fontFamily: "var(--font-ui)", fontSize: "12px" },
    ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-textfield": {
      fontFamily: "var(--font-ui)",
      fontSize: "12px",
      borderRadius: "6px",
      border: "1px solid var(--border-strong)",
      backgroundColor: "var(--bg-input)",
      color: "var(--text)",
      padding: "3px 8px",
    },
    ".cm-panel.cm-search button": { backgroundImage: "none", cursor: "pointer" },
    ".cm-panel.cm-search label": { fontSize: "12px", color: "var(--text-muted)" },
    ...TOOLTIPS,
    ".cm-diagnostic": { padding: "6px 10px", fontFamily: "var(--font-ui)", fontSize: "12.5px", maxWidth: "520px" },
    ".cm-diagnostic-error": { borderLeft: "3px solid var(--error)" },
    ".cm-diagnostic-warning": { borderLeft: "3px solid var(--warning)" },
    ".cm-diagnostic-info": { borderLeft: "3px solid var(--info)" },
    ".cm-diagnostic-hint": { borderLeft: "3px solid var(--hint)" },
    ".cm-diagnosticAction": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-contrast)",
      borderRadius: "5px",
      padding: "2px 8px",
      marginLeft: "0",
      marginRight: "6px",
      marginTop: "6px",
      font: "inherit",
      fontSize: "12px",
      fontWeight: "600",
    },
    ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--error)", textUnderlineOffset: "3px" },
    ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline wavy var(--warning)", textUnderlineOffset: "3px" },
    ".cm-lintRange-info": { backgroundImage: "none", textDecoration: "underline dotted var(--info)", textUnderlineOffset: "3px" },
    ".cm-lintRange-hint": { backgroundImage: "none", textDecoration: "underline dotted var(--hint)", textUnderlineOffset: "3px" },
    ".cm-lint-marker": { width: "0.8em", height: "0.8em" },
    ".cm-snippetField": { backgroundColor: "var(--accent-soft)", borderRadius: "2px" },
    ".cm-snippetFieldPosition": { borderLeft: "1.5px solid var(--accent)" },
    ".cm-highlightSpace": { backgroundImage: "radial-gradient(circle at 50% 55%, var(--text-faint) 11%, transparent 5%)" },
    ".cm-trailingSpace": { backgroundColor: "color-mix(in srgb, var(--error) 18%, transparent)" },
    ".cm-sync-flash": { backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent)", transition: "background-color 1.2s" },
  });
}
