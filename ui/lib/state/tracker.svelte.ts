// What a running build says of itself, kept to show where it stands: its
// step, the pages written, the last line of the compiler. Fed by the events
// of the build (the usual one, or that of an export).

import { type BuildProgress, type BuildReference, buildProgress, pagesIn } from "../buildprogress";

export class BuildTracker {
  /** Name of the running step ("pdfLaTeX (2)"). */
  step = $state<string | null>(null);
  /** Steps finished before the running one (-1 before the first). */
  stepIndex = $state(-1);
  startedAt = $state(0);
  stepStartedAt = $state(0);
  /** Pages the running step wrote so far. */
  pages = $state(0);
  /** The last line the compiler wrote. */
  lastLine = $state("");
  /** What the build before this one took. */
  reference = $state<BuildReference | null>(null);

  start(reference: BuildReference | null) {
    this.reference = reference;
    this.step = null;
    this.stepIndex = -1;
    this.startedAt = this.stepStartedAt = Date.now();
    this.pages = 0;
    this.lastLine = "";
  }

  stepStarted(name: string) {
    this.step = name;
    this.stepIndex++;
    this.stepStartedAt = Date.now();
    this.pages = 0;
  }

  output(lines: { stream: string; text: string }[]) {
    let pages = 0;
    let last = "";
    for (const line of lines) {
      if (line.stream === "cmd") continue;
      pages += pagesIn(line.text);
      if (line.text.trim()) last = line.text.trim();
    }
    if (pages) this.pages += pages;
    if (last) this.lastLine = last;
  }

  /** Where the build is at `now`, from the build before it. */
  progress(now: number): BuildProgress {
    return buildProgress(this.reference, { step: Math.max(0, this.stepIndex), stepMs: Math.max(0, now - this.stepStartedAt), pages: this.pages });
  }
}
