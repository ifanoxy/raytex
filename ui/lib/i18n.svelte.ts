// Interface translations. `en` is the reference: TypeScript makes sure the
// French dictionary has exactly the same keys, and that `t()` is only
// called with existing keys.

import en from "./locales/en";
import fr from "./locales/fr";
import type { Doc, Lang } from "./types";

export type MessageKey = keyof typeof en;

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, fr };

export const i18n = $state<{ lang: Lang }>({ lang: "fr" });

/** Resolves `system` to the webview's language. */
export function resolveLang(setting: string | undefined): Lang {
  if (setting === "fr" || setting === "en") return setting;
  return (navigator.language || "en").toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** Translates `key`, replacing `{name}` placeholders with `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let s = dictionaries[i18n.lang][key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/** Picks the right language of a bilingual text from the engine. */
export function tr(doc: Doc | null | undefined): string {
  if (!doc) return "";
  return (i18n.lang === "fr" ? doc.fr : doc.en) || doc.en || doc.fr;
}

/** Plural helper: `plural(n, "file", "files")`. */
export function plural(n: number, one: MessageKey, many: MessageKey): string {
  return t(n === 1 ? one : many, { n });
}
