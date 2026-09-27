// Colours offered to colour text: they depend on the document (xcolor and
// its options, colours it defines). Picking a colour wraps the selection
// and loads what the colour needs, in one step.

import { BASE_COLORS, documentColors, type DocumentColors, type NamedColor, withXcolorOption } from "../colors";
import { setColor } from "../editor/format";
import * as ipc from "../ipc";
import { addLines, addPackageOption, addPackages } from "../preamble";
import { debounce } from "../utils";
import { editor } from "./editor.svelte";
import { project } from "./project.svelte";

export interface ColorChoice extends NamedColor {
  /** xcolor option the colour needs (`dvipsnames`, `svgnames`). */
  option?: string;
  /** Hexadecimal value of a colour picked by hand (defined in the preamble). */
  define?: string;
}

class ColorsStore {
  current = $state<DocumentColors | null>(null);
  /** Colour of the button next to the menu (the last one used). */
  last = $state<NamedColor>(BASE_COLORS.find((c) => c.name === "red")!);

  constructor() {
    editor.onDidSync(debounce(() => void this.refresh(), 300));
  }

  async refresh() {
    const main = project.info?.main;
    if (!main) {
      this.current = null;
      return;
    }
    const root = (await editor.rootOf().catch(() => null)) ?? main;
    const text = editor.textOf(root) ?? (await ipc.readTextFile(root).then((f) => f.text).catch(() => ""));
    this.current = documentColors(text);
  }

  /** Loads xcolor (more colours), without colouring anything. */
  async enableXcolor() {
    await editor.transformRoot((text) => (documentColors(text).xcolor ? text : addPackages(text, [{ name: "xcolor" }])));
    await this.refresh();
  }

  /** Colours the selection and loads what the colour needs. */
  async apply(color: ColorChoice) {
    const view = editor.view;
    if (!view || editor.activeTab?.kind !== "tex") return;
    setColor(view, color.name);
    await editor.transformRoot((text) => {
      let out = text;
      if (color.option) out = withXcolorOption(out, color.option, (t) => addPackageOption(t, "xcolor", color.option!));
      else if (!documentColors(out).xcolor) out = addPackages(out, [{ name: "xcolor" }]);
      if (color.define) out = addLines(out, [`\\definecolor{${color.name}}{HTML}{${color.define.replace(/^#/, "").toUpperCase()}}`], "xcolor");
      return out;
    });
    this.last = { name: color.name, css: color.css };
    editor.focus();
    await this.refresh();
  }
}

export const colors = new ColorsStore();
