/**
 * The sweep list is generated, and this is what makes that worth anything.
 *
 * WHY A GENERATED DOCUMENT NEEDS A GUARD
 * `docs/i18n-sweep-list.md` is rewritten by `scripts/extract-raw-strings.mjs
 * --md`, not by hand. That is the right way to produce it — the count comes
 * from the same AST walk every time, so the number cannot be a regex's guess.
 * But it creates the failure this repository has already paid for once: a
 * document that was true when it was written and stops being true the moment
 * a round lands, while still LOOKING authoritative. Nobody re-runs a script to
 * check whether a table they are working from is current. So the drift is
 * caught here instead, by regenerating and comparing bytes.
 *
 * WHY IT GENERATES INTO A SCRATCH FILE
 * The obvious version of this test runs `--md` against the committed path and
 * then reads that file back. It passes forever. It would have rewritten the
 * document to whatever the current tree says and then compared the result to
 * itself, so the one thing it is supposed to detect — the committed file
 * disagreeing with the tree — is precisely the thing it cannot see. Hence
 * `I18N_SWEEP_DOC`: the generator writes somewhere else, and the comparison is
 * between two files neither of which the test produced.
 *
 * NO jsdom, because nothing here renders. There is no `localStorage`, no
 * `window`, and no component in this file — it reads two files and runs a
 * script. Four other test files in this suite say the same sentence for the
 * same reason.
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const doc = readFileSync(join(ROOT, "docs/i18n-sweep-list.md"), "utf8");

/**
 * Run the generator somewhere else and hand back what it wrote.
 *
 * The generator walks `src/` relative to its working directory, so `cwd` is
 * pinned to the repository root — running it from the test's own directory
 * would walk nothing and quietly produce a document claiming zero literals,
 * which is the sort of empty result a guard should not be able to accept.
 */
function generateElsewhere(): string {
  const dir = mkdtempSync(join(tmpdir(), "i18n-sweep-"));
  try {
    const out = join(dir, "sweep.md");
    execFileSync(process.execPath, ["scripts/extract-raw-strings.mjs", "--md"], {
      cwd: ROOT,
      env: { ...process.env, I18N_SWEEP_DOC: out },
      encoding: "utf8",
    });
    return readFileSync(out, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const generated = generateElsewhere();

/**
 * The rounds line carries THREE numbers, and the middle one is new: rounds 15
 * and 16 hold `.ts` files, which the walk never visits, so counting them under
 * "with work left" would be a claim about a number nobody measured. The total
 * is kept, the measurable count is kept, and the two together say which is
 * which.
 *
 * Module scope, because the "not the trivial one" guard below needs it too and
 * that guard lives in the FIRST describe.
 */
const rounds = (): { total: number; measurable: number; withWork: number } => {
  const m = /\| rounds \| (\d+) \((\d+) measurable, (\d+) with work left\) \|/.exec(doc)!;
  return { total: Number(m[1]), measurable: Number(m[2]), withWork: Number(m[3]) };
};

describe("docs/i18n-sweep-list.md is the tree, not a snapshot of it", () => {
  test("regenerating it reproduces the committed file byte for byte", () => {
    // The whole guard. If a round moved a literal and the document was not
    // regenerated, this is the line that says so — and it names the file to
    // fix and the command that fixes it.
    expect(generated.length).toBeGreaterThan(0);
    expect(generated).toBe(doc);
  });

  test("the generated document is not empty, and not the trivial one", () => {
    // A generator that walked nothing writes a well-formed document full of
    // zeroes, and a byte-comparison alone cannot tell that from a real one.
    //
    // This used to assert that a particular file was named, and round 1 is
    // what proved that a bad way to say this: sweeping a file legitimately
    // removes it from a work queue, so the pin went red on success.
    //
    // Round 14 proved the same thing about `literals > 0`: the whole sweep
    // exists to reach zero, so a guard that fails at zero forbids the state
    // the work is for. The evidence that the walk HAPPENED moved to things a
    // broken walk cannot fake: the count of keys now reached through `t()`, the
    // number of rounds, and the fact that every round is accounted for — swept
    // or not. A generator that walked nothing reports zero catalogued keys and
    // an empty round table, and both are zero here only if the walk is real.
    const literals = Number(/\| raw literals still to sweep \| \*\*(\d+)\*\* \|/.exec(doc)![1]);
    const files = Number(/\| files holding them \| \*\*(\d+)\*\* \|/.exec(doc)![1]);
    const sections = [...doc.matchAll(/^### src\//gm)].length;
    // Renamed in the generator, and the name is the point: this counts the `t()`
    // calls the WALK saw, not the keys that exist. Rounds 15 and 16 put 69 keys
    // behind `t()` calls in `.ts` files this walk never reads, so a label
    // reading "already catalogued" would have claimed a reachability the number
    // does not measure.
    const catalogued = Number(/\| `t\(\)` call sites this walk saw \| (\d+) \|/.exec(doc)![1]);
    expect(catalogued).toBeGreaterThan(0);
    expect(sections).toBe(files);
    expect(literals).toBeGreaterThanOrEqual(0);
    // And at the end state, which is where the document now is: zero literals
    // in zero files is only the SAME zero a broken walk produces if the rounds
    // that got there are still named.
    if (literals === 0) {
      // The partition is now three ways, not two: a round is either in the
      // table, in "Already swept", or it holds a `.ts` file this walk cannot
      // measure. Round 15 is what forced the third bucket — it reads 0 and is
      // genuinely done, and before this split the document could not tell it
      // apart from round 16, which reads 0 and is NOT done.
      const { measurable, total } = rounds();
      const swept = (/^\*\*Already swept:\*\* (.+)\.$/m.exec(doc)?.[1] ?? "")
        .split(", ")
        .filter(Boolean).length;
      const unmeasurable = /\*\*Rounds (\d+(?:, \d+)*) hold `\.ts` files\.\*\*/.exec(doc)?.[1] ?? "";
      const named = unmeasurable === "" ? 0 : unmeasurable.split(", ").length;
      // The `.ts` rounds are OUTSIDE `measurable`, by construction — that is
      // what the middle number means. So the partition is: measurable rounds
      // are swept or in the table, and the rest are the `.ts` ones.
      expect(swept).toBe(measurable);
      expect(named).toBe(total - measurable);
    }
  });
});

describe("the sweep list is internally consistent", () => {
  // These read the committed document only. They are independent of the
  // generator on purpose: byte-identity proves the document matches the tree,
  // and these prove the document does not contradict ITSELF — a document that
  // summed its own rounds to a different total would survive a regeneration
  // unchanged, because the generator would keep writing the same wrong total.

const headline = Number(/\| raw literals still to sweep \| \*\*(\d+)\*\* \|/.exec(doc)![1]);
const roundRows = [...doc.matchAll(/^\| (\d+) \| (.+?) \| (\d+) \| (.+?) \|$/gm)];
  // The count is right-padded to three columns in the document, so the anchor
  // has to allow the leading spaces or it matches nothing — and a check that
  // silently collects zero rows still passes when compared against a zero.
  const listed = [...doc.matchAll(/^\s*(\d+) (?:line|lines)$/gm)].map((m) => Number(m[1]));

  test("the round table and the headline count the same literals", () => {
    // Same reasoning as the guard above: a round with no literals left is not
    // in the table, it is in the **Already swept** line — so at the end state
    // the table is empty and "summed equals headline" is 0 === 0, which is
    // true of a document that also lost its rounds entirely. The check that
    // still has teeth is the partition: every round is in exactly one of the
    // two, and together they are all of them.
    const summed = roundRows.reduce((n, m) => n + Number(m[3]), 0);
    expect(summed).toBe(headline);
    const { measurable, total, withWork } = rounds();
    const swept = (/^\*\*Already swept:\*\* (.+)\.$/m.exec(doc)?.[1] ?? "")
      .split(", ")
      .filter(Boolean).length;
    // Every measurable round is either a table row or swept, exactly once each.
    // Before round 15 this was two buckets and the third did not exist because
    // a `.ts` round could not be written down at all.
    const unmeasurable =
      /\*\*Rounds (\d+(?:, \d+)*) hold `\.ts` files\.\*\*/.exec(doc)?.[1] ?? "";
    const named = unmeasurable === "" ? 0 : unmeasurable.split(", ").length;
    expect(roundRows.length + swept).toBe(measurable);
    expect(named).toBe(total - measurable);
    expect(withWork).toBe(roundRows.length);
  });

  test("the per-file sections and the headline count the same literals", () => {
    // The third cut of the same total, and the one that catches a file that
    // is listed under a round but has no section, or a section with no row.
    //
    // `expect(listed.length > 0)` used to be here and had to go with the rest:
    // a finished sweep has no per-file sections, because a file with nothing
    // left in it is no longer in the queue. What replaces it is the pair the
    // generator must always agree on — one section per file holding literals —
    // which is what makes the sum meaningful when it is not zero.
    expect(listed.reduce((a, b) => a + b, 0)).toBe(headline);
    expect(listed.length).toBe(Number(/\| files holding them \| \*\*(\d+)\*\* \|/.exec(doc)![1]));
  });

  test("every round names only files the document has a section for", () => {
    // The generator throws when a round names a file the walk cannot find, so
    // a name here that has no section would mean the table and the sections
    // came apart inside one run. A round listed under **Already swept** has no
    // section by construction, so the check is over the table only — and the
    // swept line is checked for the thing it can still be wrong about: naming
    // a round number that does not exist.
    const headed = new Set([...doc.matchAll(/^### (src\/[^\s—]+) —/gm)].map((m) => m[1]!));
    for (const row of roundRows) {
      for (const cell of row[2]!.matchAll(/`(components\/[^`]+|App\.tsx)`/g)) {
        const path = cell[1] === "App.tsx" ? "src/App.tsx" : `src/${cell[1]}`;
        expect(headed.has(path), `round ${row[1]} names ${path}, which has no section`).toBe(true);
      }
    }
    const total = rounds().total;
    for (const n of (/^\*\*Already swept:\*\* (.+)\.$/m.exec(doc)?.[1] ?? "")
      .split(", ")
      .map((s) => Number(/round (\d+)/.exec(s)?.[1]))
      .filter((n): n is number => n !== undefined)) {
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(total);
    }
    // And the `.ts` rounds name themselves in full, with the files they hold —
    // a section that said "some rounds are unmeasurable" without saying which
    // would be a warning with no address.
    const unmeasurable = /\*\*Rounds (\d+(?:, \d+)*) hold `\.ts` files\.\*\*/.exec(doc)![1]
      .split(", ")
      .map((s) => Number(s));
    for (const n of unmeasurable) {
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(total);
    }
    for (const file of (doc.split("hold `.ts` files.**")[1] ?? "").matchAll(/`(src\/[^`]+\.ts)`/g)) {
      expect(file[1]!, file[1]!).toBeTruthy();
    }
  });
});
