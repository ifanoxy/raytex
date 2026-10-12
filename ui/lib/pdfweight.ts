// What the PDF would weigh with lighter pictures. The engine weighs the
// pictures at each step of compression; what they lose is taken off the
// weight of the PDF as it is. It is an estimate (the engines do not embed
// every picture at the size of its file), said as one.

/** What the pictures of a document weigh together, with the PDF as it is. */
export interface PdfWeights {
  /** How many PNG and JPEG pictures the document embeds. */
  pictures: number;
  /** Their size as they are, in bytes. */
  original: number;
  /** Their size at each step of compression, from the lightest touch to the heaviest. */
  steps: number[];
  /** The size of the PDF as it is, when it is whole. */
  pdf: number | null;
}

/** The steps offered by name: lighter with nothing to see of it; much lighter. */
export const STEP_BALANCED = 1;
export const STEP_LIGHT = 3;

/** How the PDF is exported: as it is, at a step of compression, or under a size. */
export type PdfChoice = { kind: "original" } | { kind: "step"; step: number } | { kind: "limit"; bytes: number };

/** The PDF with its pictures at `step`: an estimate, null when the PDF as it is was not weighed. */
export function estimate(weights: PdfWeights, step: number): number | null {
  if (weights.pdf === null || step < 0 || step >= weights.steps.length) return null;
  // The text and the drawings: what the PDF weighs without its pictures.
  const rest = Math.max(0, weights.pdf - weights.original);
  return rest + weights.steps[step];
}

/**
 * The first step at which the PDF would weigh `limit` at most, and whether
 * one does: when even the heaviest is not enough (the text and the drawings
 * are too heavy by themselves), it is the heaviest, and `within` is false.
 */
export function stepFor(weights: PdfWeights, limit: number): { step: number; within: boolean } {
  for (let step = 0; step < weights.steps.length; step++) {
    const size = estimate(weights, step);
    if (size !== null && size <= limit) return { step, within: true };
  }
  return { step: Math.max(0, weights.steps.length - 1), within: false };
}

/** A size typed in megabytes (`10`, `7,5`, `2.5`) in bytes; null for anything else. */
export function megabytes(typed: string): number | null {
  const n = Number(typed.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1_000_000) : null;
}
