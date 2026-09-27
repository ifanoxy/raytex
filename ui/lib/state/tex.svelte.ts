// TeX installation status and installation jobs.

import * as ipc from "../ipc";
import type { JobRequest, TexStatus } from "../types";

export interface Job {
  id: number;
  title: string;
  lines: string[];
  running: boolean;
  success: boolean | null;
  cancelled: boolean;
}

/** "MacTeX 2025", without repeating a version already in the name. */
export function distLabel(d: { name: string; version: string | null }): string {
  return d.version && !d.name.includes(d.version) ? `${d.name} ${d.version}` : d.name;
}

class TexStore {
  status = $state<TexStatus | null>(null);
  jobs = $state<Job[]>([]);
  private finishedHandlers = new Map<number, (success: boolean) => void>();

  get active() {
    const s = this.status;
    if (!s) return null;
    return s.distributions.find((d) => d.id === s.active) ?? s.distributions[0] ?? null;
  }

  get ready(): boolean {
    return !!this.status?.detected && (this.status?.distributions.length ?? 0) > 0;
  }

  get missing(): boolean {
    return !!this.status?.detected && !this.status.detecting && this.status.distributions.length === 0;
  }

  async init() {
    this.status = await ipc.texStatus();
    await ipc.on("tex:status", (s) => (this.status = s));
    await ipc.on("job:output", ({ id, lines }) => {
      const job = this.jobs.find((j) => j.id === id);
      if (job) job.lines.push(...lines);
    });
    await ipc.on("job:finished", ({ id, success, cancelled }) => {
      const job = this.jobs.find((j) => j.id === id);
      if (job) {
        job.running = false;
        job.success = success;
        job.cancelled = cancelled;
      }
      this.finishedHandlers.get(id)?.(success);
      this.finishedHandlers.delete(id);
    });
  }

  detect() {
    return ipc.detectTex();
  }

  /** Starts a job and resolves when it finishes. */
  async run(request: JobRequest, title: string): Promise<{ job: Job; done: Promise<boolean> }> {
    const id = await ipc.startJob(request);
    const job: Job = { id, title, lines: [], running: true, success: null, cancelled: false };
    this.jobs = [job, ...this.jobs].slice(0, 20);
    const done = new Promise<boolean>((resolve) => this.finishedHandlers.set(id, resolve));
    return { job: this.jobs[0], done };
  }

  cancel(id: number) {
    return ipc.cancelJob(id);
  }
}

export const tex = new TexStore();
