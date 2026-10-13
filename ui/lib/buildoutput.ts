// What the output of a TeX engine tells while it runs: which file it is
// reading. The engine prints `(` and the name of each file it opens, and `)`
// when it closes it; the files are followed like a stack, and the one being
// read is the last source file still open.

/** Whether a word that follows `(` in the output names a file. */
const FILE = /^(?:\.{0,2}[\\/]|[A-Za-z]:[\\/]|[\\/])[^\s()]*\.[A-Za-z0-9]+$/;
/** Files that are a part of the text of a document (not a package, a font map or an auxiliary file). */
const SOURCE = /\.(?:tex|ltx|tikz|bbl|ind|gls|toc|lof|lot)$/i;

export class OpenFiles {
  /** The files open, the last one last; an empty name for a parenthesis that opened no file. */
  private stack: string[] = [];

  /** Forgets everything: a new run of the engine. */
  reset() {
    this.stack = [];
  }

  /** Reads a piece of the output. */
  feed(text: string) {
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === "(") {
        let end = i + 1;
        while (end < text.length && !/[\s()]/.test(text[end])) end++;
        const word = text.slice(i + 1, end);
        this.stack.push(FILE.test(word) ? word : "");
        if (this.stack.length > 200) this.stack.shift();
      } else if (c === ")") {
        this.stack.pop();
      }
    }
  }

  /** The source file being read: the last one opened that is still open; null when none is. */
  get current(): string | null {
    for (let i = this.stack.length - 1; i >= 0; i--) if (SOURCE.test(this.stack[i])) return this.stack[i];
    return null;
  }
}

/** A file of the output as it is shown: without `./`, and under `base` (the folder of the document) when it is in it. */
export function shownFile(file: string, base = ""): string {
  const plain = file.replace(/\\/g, "/").replace(/^\.\//, "");
  const dir = base.replace(/\\/g, "/").replace(/\/+$/, "");
  return dir && plain.startsWith(`${dir}/`) ? plain.slice(dir.length + 1) : plain;
}
