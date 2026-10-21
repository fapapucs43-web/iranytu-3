/**
 * Mega batch, commit 6 — every control has an accessible name.
 *
 * The audit found eleven controls whose only affordance was a placeholder or a
 * sibling `<span class="field-label">`, which is not a label: a span does not
 * associate, and a placeholder is not announced reliably and disappears the
 * moment somebody types. They now carry an `aria-label`.
 *
 * This test exists because that class of gap comes back silently. A control
 * added in a hurry with a placeholder and nothing else compiles, renders, looks
 * right and passes every render assertion.
 *
 * THREE THINGS THE SCAN GETS WRONG IF DONE NAIVELY, each of which produced a
 * false positive while this was being written:
 *
 *  1. `onChange={(e) => …}` contains a `>`. A `[^>]*` attribute match stops at
 *     the arrow, so any control with an arrow function is reported as
 *     unlabelled even when its aria-label is right there on the next line. The
 *     `=>` is swapped for a two-character sentinel, which keeps every index
 *     identical.
 *  2. Comments in this codebase quote markup — "the file input is a real
 *     `<input type="file">` under a `<label>`". Counting those raw makes a
 *     wrapped control look unwrapped. Comments are blanked to spaces, again
 *     index-for-index.
 *  3. A `<span class="field-label">` next to an input reads like a label and is
 *     not one. Only a real `<label>`, an `htmlFor` that matches, or an explicit
 *     `aria-label` counts.
 *
 * THE ALLOW-LIST IS CLOSED AND EXPLAINS ITSELF. Two entries, both deliberate:
 * the shared `TextInput` primitive passes its props straight through, so its
 * name is the caller's to give, and it is the one control in this list whose
 * name cannot be asserted here.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";

/** Controls whose naming is somebody else's decision, with the reason. */
const ALLOWED_UNNAMED: Record<string, string> = {
  "src/components/ui/ui.tsx": "TextInput spreads {...props}; its name is the caller's",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = `${dir}/${entry}`;
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * Blank out comments index-for-index, so offsets and line numbers still hold.
 *
 * The `(?=[\s*-])` lookahead is load-bearing and was added after this rule
 * produced a spectacular false positive: `accept="image/*"` contains the two
 * characters `/*`, so a naive block-comment regex swallowed everything from
 * there to the next `*/` and reported a splice of unrelated code. A real block
 * comment here is always followed by whitespace, a `*` (for `/**`) or a dash.
 * `image/*"` is followed by a quote, and survives.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*(?=[\s*-])[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
}

/** `exp-note-${exp.id}` → `exp-note-`, so a template htmlFor can be matched. */
function staticId(attrs: string): string | null {
  const m = attrs.match(/\bid\s*=\s*(?:"([^"]+)"|\{`([^`$]*)\$\{)/);
  return m ? (m[1] ?? m[2]) : null;
}

type Finding = { file: string; line: number; kind: string; snippet: string };

function audit(): Finding[] {
  const findings: Finding[] = [];
  for (const file of walk("src")) {
    const raw = readFileSync(file, "utf8");
    const src = stripComments(raw).replace(/=>/g, "=\u2020");
    const lineAt = (i: number) => raw.slice(0, i).split("\n").length;

    /** Is the element at `at` inside an unclosed <label>? */
    function wrapped(at: number): boolean {
      const before = src.slice(0, at);
      return (
        (before.match(/<label\b/g) ?? []).length > (before.match(/<\/label>/g) ?? []).length
      );
    }

    function htmlForMatches(attrs: string): boolean {
      const id = staticId(attrs);
      if (!id) return false;
      const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`htmlFor=(?:"${esc}|\\{\`${esc})`).test(src);
    }

    const named = (attrs: string, at: number, inner: string) =>
      /aria-label\s*=/.test(attrs) ||
      /aria-labelledby\s*=/.test(attrs) ||
      /title\s*=/.test(attrs) ||
      (staticId(attrs) !== null && htmlForMatches(attrs)) ||
      wrapped(at) ||
      inner.replace(/<[^>]*>/g, " ").replace(/[{}"'`\u2020]/g, " ").trim().length > 0;

    const button = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
    let m: RegExpExecArray | null;
    while ((m = button.exec(src)) !== null) {
      if (!named(m[1] ?? "", m.index, m[2] ?? "")) {
        findings.push({
          file,
          line: lineAt(m.index),
          kind: "button",
          snippet: (m[1] ?? "").replace(/\u2020/g, ">").replace(/\s+/g, " ").trim().slice(0, 60),
        });
      }
    }

    const control = /<(input|textarea|select)\b([^>]*?)\/?>/g;
    while ((m = control.exec(src)) !== null) {
      const attrs = (m[2] ?? "").replace(/\u2020/g, ">");
      // Removed from the accessibility tree on purpose: a file input behind a
      // visible button, or a submit-only input.
      const invisible =
        /\bhidden\b/.test(attrs) ||
        /type="hidden"/.test(attrs) ||
        /aria-hidden="true"/.test(attrs) ||
        /display:\s*"none"/.test(attrs);
      if (!invisible && !named(attrs, m.index, "")) {
        findings.push({
          file,
          line: lineAt(m.index),
          kind: m[1] ?? "control",
          snippet: attrs.replace(/\s+/g, " ").trim().slice(0, 60),
        });
      }
    }
  }
  return findings;
}

const FINDINGS = audit();

describe("every control has an accessible name", () => {
  test("no button is announced as just \"button\"", () => {
    const buttons = FINDINGS.filter((f) => f.kind === "button");
    expect(
      buttons.map((b) => `${b.file}:${b.line} ${b.snippet}`),
    ).toEqual([]);
  });

  test("no input, textarea or select is named only by its placeholder", () => {
    const controls = FINDINGS.filter((f) => f.kind !== "button").filter(
      (f) => !ALLOWED_UNNAMED[f.file],
    );
    expect(
      controls.map((c) => `${c.file}:${c.line} ${c.snippet}`),
    ).toEqual([]);
  });

  test("the allow-list is still the closed set it claims to be", () => {
    // A stale entry would hide a real gap, so the file must still be the
    // pass-through primitive and nothing may have been added to the map.
    const primitive = readFileSync("src/components/ui/ui.tsx", "utf8");
    expect(primitive).toContain("export function TextInput(props:");
    expect(Object.keys(ALLOWED_UNNAMED)).toEqual(["src/components/ui/ui.tsx"]);
  });

  test("the scan itself is not silently passing on nothing", () => {
    // A regex that matches nothing reports zero findings forever. This counts
    // the controls it actually looked at.
    //
    // Summed over both tabs the toolbox has lived on since Batch 14 split them:
    // the Ma fül keeps three literal buttons (the two recorder paths and the
    // save), the Eszköztár tab took the rest. Reading only one file would make
    // this guard watch half the app.
    const buttons = ["src/views/TodayView.tsx", "src/views/ToolsView.tsx"]
      .map((f) => [...stripComments(readFileSync(f, "utf8")).matchAll(/<button\b/g)].length)
      .reduce((a, b) => a + b, 0);
    expect(buttons).toBeGreaterThan(3);
  });
});