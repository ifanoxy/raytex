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
  /** The steps of this build so far: the last one runs (`ms` null) unless the build has ended. */
  history = $state<{ name: string; startedAt: number; ms: number | null }[]>([]);

  start(reference: BuildReference | null) {
    this.reference = reference;
    this.step = null;
    this.stepIndex = -1;
    this.startedAt = this.stepStartedAt = Date.now();
    this.pages = 0;
    this.lastLine = "";
    this.history = [];
  }

  /** The build has ended: its last step too. */
  ended() {
    const last = this.history.at(-1);
    if (last && last.ms === null) last.ms = Date.now() - last.startedAt;
  }

  stepStarted(name: string) {
    this.ended();
    this.step = name;
    this.stepIndex++;
    this.stepStartedAt = Date.now();
    this.pages = 0;
    this.history.push({ name, startedAt: this.stepStartedAt, ms: null });
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
