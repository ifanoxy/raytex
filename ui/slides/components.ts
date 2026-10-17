// The components a slide is made of, as the bar "Insert" and the + between
// two blocks offer them: a kind of block, and what it starts as.

import type { BlockKind } from "$lib/slides/blocks";

export interface Component {
  kind: BlockKind;
  variant: string;
  icon: string;
  key: string;
  /** Shown in the bar itself (the others in its menu "More"). */
  main: boolean;
}

export const COMPONENTS: Component[] = [
  { kind: "text", variant: "", icon: "type", key: "slides.component.text", main: true },
  { kind: "list", variant: "", icon: "list", key: "slides.component.list", main: true },
  { kind: "image", variant: "", icon: "image", key: "slides.component.image", main: true },
  { kind: "columns", variant: "", icon: "layout", key: "slides.component.columns", main: true },
  { kind: "formula", variant: "", icon: "formula", key: "slides.component.formula", main: true },
  { kind: "table", variant: "", icon: "table", key: "slides.component.table", main: true },
  { kind: "box", variant: "", icon: "square", key: "slides.component.box", main: true },
  { kind: "list", variant: "ordered", icon: "list-ordered", key: "slides.component.numbered", main: false },
  { kind: "columns", variant: "3", icon: "grid", key: "slides.component.columns3", main: false },
  { kind: "box", variant: "alertblock", icon: "alert-triangle", key: "slides.component.alert", main: false },
  { kind: "box", variant: "exampleblock", icon: "lightbulb", key: "slides.component.example", main: false },
  { kind: "code", variant: "", icon: "code", key: "slides.component.code", main: false },
  { kind: "pause", variant: "", icon: "eye", key: "slides.component.pause", main: false },
];

/** The name a component is carried by while it is dragged (`list`, `box-alertblock`). */
export const componentId = (c: { kind: BlockKind; variant: string }) => (c.variant ? `${c.kind}-${c.variant}` : c.kind);

/** The component of a name carried. */
export function componentOf(id: string): { kind: BlockKind; variant: string } | null {
  const [kind, ...rest] = id.split("-");
  const found = COMPONENTS.find((c) => c.kind === kind && c.variant === rest.join("-"));
  return found ? { kind: found.kind, variant: found.variant } : null;
}
