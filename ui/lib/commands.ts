// The commands and environments a project defines (`\newcommand`,
// `\DeclareMathOperator`, `\newenvironment`, `\newtheorem`): what the
// engine lists, and what a new one is made of.

import type { Location } from "./types";

export type CustomKind = "command" | "operator" | "environment" | "theorem";

/** A command or an environment the project defines. */
export interface CustomCommand {
  /** Without backslash. */
  name: string;
  kind: CustomKind;
  args: number;
  firstOptional: boolean;
  /** The body of a command, the title of a theorem. */
  definition: string;
  /** Only works in a formula. */
  math: boolean;
  /** How it is written, as a snippet (`\norme{${1}}`). */
  usage: string;
  /** A text that tries it (`$\norme{a}$`). */
  sample: string;
  location: Location;
  /** The definition as it is written, whole. */
  source: string;
  /** Written in the preamble of the root document. */
  inPreamble: boolean;
  uses: number;
}

/** What a new definition is made of. */
export interface CommandSpec {
  kind: CustomKind;
  name: string;
  args: number;
  /** Default value of the first argument, which makes it optional. */
  default: string | null;
  body: string;
  /** What an environment ends with. */
  end: string;
}

/** A definition ready for the preamble, with what was found wrong in it. */
export interface CommandDraft {
  name: string;
  code: string;
  usage: string;
  sample: string;
  math: boolean;
  packages: string[];
  /** What prevents adding it. */
  problems: string[];
  /** Worth knowing; prevents nothing. */
  notes: string[];
}

/** What the studio is opened for. */
export interface CommandRequest {
  /** An existing command to try. */
  test?: CustomCommand;
  /** A new command, with what is known of it already. */
  create?: Partial<CommandSpec>;
}

/** `\norme{·}`, `\begin{boite}{·}`: the name with one mark per argument. */
export function signature(c: Pick<CustomCommand, "name" | "kind" | "args" | "firstOptional">): string {
  const environment = c.kind === "environment" || c.kind === "theorem";
  let out = environment ? `\\begin{${c.name}}` : `\\${c.name}`;
  for (let i = 1; i <= c.args; i++) out += i === 1 && c.firstOptional ? "[·]" : "{·}";
  return out;
}

/**
 * What a selection of the editor gives a new command: its text as the
 * definition, and a formula when it is one (`$…$` around it is dropped).
 */
export function specFromSelection(selected: string): Partial<CommandSpec> {
  const text = selected.trim();
  if (!text) return {};
  const inline = /^\$([^$]+)\$$/.exec(text) ?? /^\\\(([\s\S]+)\\\)$/.exec(text);
  return { kind: "command", body: (inline ? inline[1] : text).trim() };
}
