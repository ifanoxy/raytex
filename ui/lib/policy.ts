// What the security policy of the installed application refuses (a style,
// a script): written down, since nothing shows it on the page. In
// development the page is served without that policy, and nothing is ever
// refused: a mistake there is only seen in the built application.

/** Each refusal: the rule, and what it stopped. */
export const refused: string[] = [];

/** Starts listening; `report` gets the first refusals (not a flood of them). */
export function watchPolicy(report: (message: string) => void) {
  document.addEventListener("securitypolicyviolation", (e) => {
    const where = e.sourceFile ? `, ${e.sourceFile}:${e.lineNumber}` : "";
    const what = `${e.violatedDirective} refused (${e.blockedURI}${where})`;
    refused.push(what);
    if (refused.length <= 5) report(`content security policy: ${what}`);
  });
}
