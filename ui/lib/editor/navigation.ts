// Whether a position holds something "go to definition" understands:
// a command, an environment name, a label reference, a citation key or a
// file name (\input, \include, \includegraphics, \usepackage…).

import type { EditorState } from "@codemirror/state";

const ARG_COMMANDS =
  /\\(?:[a-zA-Z]*ref|[cC]ref|[a-zA-Z]*cite[a-zA-Z]*|label|input|include|subfile|includegraphics|includepdf|usepackage|RequirePackage|documentclass|begin|end|addbibresource|bibliography|lstinputlisting|inputminted|import|subimport)\*?(?:\[[^\]]*\])*\{[^}]*$/;

export function navigableAt(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos);
  const rel = pos - line.from;
  const text = line.text;
  // A control sequence under the pointer.
  let start = rel;
  while (start > 0 && /[A-Za-z@]/.test(text[start - 1])) start--;
  if (text[start - 1] === "\\" && /[A-Za-z@]/.test(text[start] ?? "")) return true;
  if (text[rel] === "\\" && /[A-Za-z@]/.test(text[rel + 1] ?? "")) return true;
  // Inside the argument of a navigable command.
  const close = text.indexOf("}", rel);
  if (close < 0) return false;
  return ARG_COMMANDS.test(text.slice(0, rel));
}
