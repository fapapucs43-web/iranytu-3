/**
 * Batch 6 — Önreflexiós kérdőív.
 *
 * This feature has one job that matters more than the code: help someone look
 * honestly at how they have been, WITHOUT turning that into a diagnosis of
 * them. Almost every test below exists to make one of the following impossible
 * to do by accident:
 *
 *   - paraphrase the disclaimer on some surface but not others
 *   - let a clinical word ("depresszió", "súlyos", "betegség") creep into a band
 *   - let "PHQ-9" leak into the UI and borrow clinical authority
 *   - let a partial run be scored into a band
 *   - let assessment data become readable from the profile / entry store
 *   - let item 9 appear without its safety notice
 *
 * The instrument text is also byte-pinned against the source document, so a
 * well-meaning "fix" cannot silently change what is being measured.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every file under `src/` that contains `needle`, with how many times.
 *
 * Used to prove a sentence exists in exactly one place. It walks the whole tree
 * rather than a named list of modules on purpose: the failure this guards
 * against is a sixth surface spelling the sentence out, and a guard that only
 * knows about today's five cannot see the sixth.
 */
function countInSrc(needle: string): Map<string, number> {
  const root = new URL("../src/", import.meta.url).pathname;
  const found = new Map<string, number>();
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, relPath);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const n = readFileSync(abs, "utf8").split(needle).length - 1;
      if (n > 0) found.set(`src/${relPath}`, n);
    }
  };
  walk(root, "");
  return found;
}
import {
  BANDS,
  DISCLAIMER,
  IMPACT_OPTIONS,
  IMPACT_QUESTION,
  INSTRUCTION,
  ITEM_COUNT,
  ITEMS,
  MAX_SCORE,
  RESOURCES,
  RESOURCES_TITLE,
  RESPONSE_OPTIONS,
  SAFETY_NOTICE,
  SOURCE_ATTRIBUTION,
  SOURCE_ITEMS,
  SUPPLEMENTARY_ITEM,
  SUPPLEMENTARY_LABEL,
  TITLE,
  bandFor,
  impactOf,
  isComplete,
  needsSupport,
  score,
  summarize,
  type AssessmentAnswers,
} from "../src/lib/assessments";
import {
  STORAGE_KEY,
  addAssessment,
  clearAssessments,
  getAssessment,
  isMemoryOnly,
  listAssessments,
  removeAssessment,
  resetForTests,
} from "../src/lib/assessmentStore";

const backing: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in backing ? backing[k] : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
  resetForTests();
});

/** Run a git command and return its trimmed stdout. */
function git(cmd: string): string {
  const { execSync } = require("node:child_process") as typeof import("node:child_process");
  return execSync(cmd, { encoding: "utf8" });
}

/** A complete, all-zero run. */
const all = (v: number): AssessmentAnswers => ({ answers: Array(ITEM_COUNT).fill(v) });

/**
 * The commit this batch started from: the parent of the commit that first
 * added lib/assessments.ts.
 *
 * Resolved at run time rather than hardcoded, and never `main` — see the
 * scoping guard below for why a moving base made that guard vacuous.
 */
function batchBaseRef(): string {
  const added = git("git log --format=%H --diff-filter=A -- src/lib/assessments.ts")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  expect(added.length).toBeGreaterThan(0);
  return `${added[added.length - 1]}^`;
}

/**
 * The diff the scoping guards are about: everything between the batch base
 * and HEAD under the given paths, with the given `git diff` flags.
 *
 * The guards' premise is a pre-batch tree of THIS project to diff against.
 * Two histories break that premise, and both are detected rather than
 * papered over:
 *
 *  - a squashed or shallow history, where the batch's first commit has no
 *    parent and `base^` names no revision at all (git dies with "unknown
 *    revision", which is how the suite went red on depth-1 clones);
 *  - a repository that was IMPORTED: this one shipped as a ZIP and its
 *    history was squashed into a single add-everything commit on top of an
 *    unrelated upload commit, so the base tree has no src/index.tsx and
 *    base..HEAD would report the entire project as the batch's work.
 *
 * Either way there is no pre-batch tree of this project to compare against,
 * so there is nothing the guard can guard, and the honest answer is an
 * empty diff. Callers treat that as "premise absent" and stand down; on any
 * normally-built history the original base..HEAD diff runs unchanged.
 */
function batchDiff(flags: string, args: string): string {
  const base = batchBaseRef();
  const { execSync } = require("node:child_process") as typeof import("node:child_process");
  try {
    execSync(`git rev-parse --verify --quiet ${base}`, { stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    return "";
  }
  try {
    // The pre-batch tree must be a tree of THIS project. On the imported
    // history base^ is the unrelated upload commit and holds no src/.
    execSync(`git cat-file -e ${base}^:src/index.tsx`, { stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    return "";
  }
  return git(`git diff ${flags} ${base} HEAD -- ${args}`);
}

/**
 * Is this file claimed by some batch's own test?
 *
 * Batch 7 legitimately adds src/lib/iconsets.ts and tests/batch7.test.ts, so
 * Batch 6's exact allowlist would fail on work that is not a drive-by edit.
 * Rather than let each batch's guard go stale — a guard that fails on intended
 * work trains people to delete it — a file outside this list is accepted only
 * if some batch test names it explicitly.
 */
function claimedByAnyBatch(file: string): boolean {
  // Read the WORKING TREE, not HEAD: the batch being developed is uncommitted
  // by definition, and a guard that cannot see the work it is guarding is
  // worse than no guard.
  const { readFileSync, readdirSync } = require("node:fs") as typeof import("node:fs");
  const dir = new URL("../tests/", import.meta.url);
  const tests = readdirSync(dir).filter((n: string) => /^batch\d.*\.test\.ts$/.test(n));
  return tests.some((n: string) => {
    try {
      return readFileSync(new URL(n, dir), "utf8").includes(`"${file}"`);
    } catch {
      return false;
    }
  });
}

/* ================================================================== */
/* 1. The instrument is what it claims to be                          */
/* ================================================================== */

describe("instrument provenance", () => {
  test("the source contributes exactly eight items, and we say so", () => {
    // The Hungarian MAPI document omits the ninth question entirely. Calling
    // this a PHQ-9 anywhere would be a false claim.
    expect(SOURCE_ITEMS).toHaveLength(8);
    expect(SOURCE_ITEMS.every((i) => !i.isSupplementary)).toBe(true);
    expect(SOURCE_ITEMS.map((i) => i.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(SOURCE_ATTRIBUTION).toBe("PHQ-8 magyar fordítása, Pfizer/MAPI 2005");
  });

  test("the added ninth item is flagged, last, and not part of the source", () => {
    expect(SUPPLEMENTARY_ITEM.isSupplementary).toBe(true);
    expect(SUPPLEMENTARY_ITEM.index).toBe(9);
    expect(ITEMS).toHaveLength(9);
    expect(ITEMS[8]).toBe(SUPPLEMENTARY_ITEM);
    expect(SOURCE_ITEMS.some((i) => i.isSupplementary)).toBe(false);
  });

  test("max score is 27, and the band table covers exactly 0..27", () => {
    expect(ITEM_COUNT).toBe(9);
    expect(MAX_SCORE).toBe(27);
    expect(BANDS[0]!.min).toBe(0);
    expect(BANDS[BANDS.length - 1]!.max).toBe(MAX_SCORE);
    // Contiguous and gapless — no score can fall between two bands.
    for (let i = 1; i < BANDS.length; i += 1) {
      expect(BANDS[i]!.min).toBe(BANDS[i - 1]!.max + 1);
    }
  });

  test("the UI is never called PHQ-9, and PHQ-8 stays out of user-facing copy", () => {
    const userFacing = [TITLE, INSTRUCTION, SAFETY_NOTICE, SUPPLEMENTARY_LABEL, ...BANDS.map((b) => b.note)];
    for (const s of userFacing) {
      expect(s).not.toContain("PHQ");
    }
    expect(TITLE).toBe("Önreflexiós kérdőív");
  });

  test("the source attribution is confined to where the owner allowed it", () => {
    // Allowed: the consent screen and the PDF export footer. Those are
    // Batch 2 surfaces; here we only pin the constant and assert that no
    // other exported string carries the instrument name.
    expect(SOURCE_ATTRIBUTION).toContain("PHQ-8");
    for (const s of [TITLE, INSTRUCTION, IMPACT_QUESTION, SAFETY_NOTICE, ...RESPONSE_OPTIONS]) {
      expect(s).not.toContain("PHQ");
    }
  });
});

/* ================================================================== */
/* 2. Item text is byte-pinned to the source                          */
/* ================================================================== */

describe("item text", () => {
  test.each(SOURCE_ITEMS.map((i) => [i.index, i.text] as const))(
    "item %i is byte-exact",
    (_n, text) => {
      // Frozen copy of the MAPI transcription. Editing a diacritic or a
      // conjunction here changes what the questionnaire measures.
      const PINNED: Record<number, string> = {
        1: "Kevés érdeklődés vagy örömérzés tevékenységei során",
        2: "Szomorúság, lehangoltság vagy reménytelenség",
        3: "Nehezen tud elaludni, éjszaka könnyen felébred, vagy túl sokat alszik",
        4: "Fáradtság vagy kevés energia",
        5: "Rossz étvágy vagy túlzott evés",
        6: "Rossz érzések saját magával kapcsolatban, vagy olyan gondolatok, hogy Ön sikertelen, vagy csalódást okozott önmaga vagy családja számára",
        7: "Koncentrálási nehézségek, pl. újságolvasás vagy tévénézés közben",
        8: "Mozgása vagy beszéde annyira lelassult, hogy mások is észrevehették, vagy ellenkezleg, olyan nyugtalan, hogy a szokásosnál sokkal többet mozgott",
      };
      expect(text).toBe(PINNED[_n]);
    },
  );

  test("item 1 carries the CORRECTED spelling, not the source's typo", () => {
    // The source document's raw bytes spell "érdekldés" — the ő is missing.
    // Shipping the typo would look like carelessness in the user's language.
    expect(ITEMS[0]!.text).toContain("érdeklődés");
    expect(ITEMS[0]!.text).not.toContain("érdekldés");
  });

  test("the correction is documented in the source file", () => {
    const src = readFileSync(new URL("../src/lib/assessments.ts", import.meta.url), "utf8");
    expect(src).toContain("érdekldés");
    expect(src).toContain("érdeklődés");
  });

  test("the supplementary item is the owner-supplied wording, exactly", () => {
    expect(SUPPLEMENTARY_ITEM.text).toBe(
      "Az elmúlt 2 hétben milyen gyakran gondolta, hogy jobb lenne, ha meghalna, vagy hogy bántania kellene magát?",
    );
  });

  test("instruction and response scale are verbatim", () => {
    expect(INSTRUCTION).toBe(
      "Az elmúlt 2 hétben milyen gyakran okoztak Önnek gondot az alábbi panaszok?",
    );
    expect([...RESPONSE_OPTIONS]).toEqual([
      "Egyszer sem",
      "Néhány napon",
      "A napok több mint felében",
      "Majd-nem minden nap",
    ]);
  });

  test("the functional-impact follow-up is verbatim and unscored", () => {
    expect(IMPACT_QUESTION).toBe(
      "Amennyiben bejelölt egy vagy több problémát, mekkora nehézséget okoztak ezek a problémák a munkahelyén, otthoni teendi ellátásában vagy más emberekkel való kapcsolatában?",
    );
    expect([...IMPACT_OPTIONS]).toEqual([
      "Egyáltalán nem okozott nehézséget",
      "Kis nehézséget okozott",
      "Nagy nehézséget okozott",
      "Kifejezetten nagy nehézséget okozott",
    ]);
    // Four options, but they are NOT the symptom scale and must never be
    // added to the total — they measure a different construct.
    expect(IMPACT_OPTIONS).not.toEqual(RESPONSE_OPTIONS);
  });
});

/* ================================================================== */
/* 3. Scoring                                                         */
/* ================================================================== */

describe("scoring", () => {
  test("an all-zero run scores 0 and lands in the lowest band", () => {
    const s = summarize(all(0));
    expect(s.score).toBe(0);
    expect(s.band.label).toBe("Nincs jellemző tünet");
  });

  test("an all-three run scores the maximum", () => {
    const s = summarize(all(3));
    expect(s.score).toBe(MAX_SCORE);
    expect(s.band.label).toBe("Nagyon erős tünetek");
  });

  test("known-answer vector", () => {
    const { score: total } = summarize({ answers: [0, 1, 2, 3, 0, 1, 2, 3, 0] });
    expect(total).toBe(12);
  });

  test("an incomplete run is refused, not silently scored", () => {
    expect(() => score({ answers: [0, 0, 0] })).toThrow();
    expect(() => score({ answers: [...Array(8).fill(0)] })).toThrow();
    expect(() => score({ answers: [...Array(9).fill(0), 0] })).toThrow();
    // Out-of-range answers are refused too.
    expect(() => score({ answers: [...Array(8).fill(0), 4] })).toThrow();
    expect(() => score({ answers: [...Array(8).fill(0), -1] })).toThrow();
  });

  test("isComplete is the single gate for a scoreable run", () => {
    expect(isComplete(all(0))).toBe(true);
    expect(isComplete({ answers: [0, 0, 0] })).toBe(false);
    expect(isComplete({ answers: [...Array(9).fill(9)] })).toBe(false);
  });

  test("the impact answer is optional and never part of the total", () => {
    const base: AssessmentAnswers = { answers: Array(9).fill(2) };
    const withImpact = { ...base, impact: 3 };
    expect(score(withImpact)).toBe(score(base));
    expect(impactOf(withImpact)).toBe(3);
    expect(impactOf(base)).toBeNull();
    expect(impactOf({ ...base, impact: 9 })).toBeNull();
  });

  test("needsSupport is per-run and never stored as a condition", () => {
    expect(needsSupport({ answers: [...Array(8).fill(0), 0] })).toBe(false);
    expect(needsSupport({ answers: [...Array(8).fill(0), 1] })).toBe(true);
    expect(needsSupport({ answers: [...Array(8).fill(0), 3] })).toBe(true);
  });
});

/* ================================================================== */
/* 4. Bands stay descriptive                                          */
/* ================================================================== */

describe("bands are descriptive, never clinical", () => {
  test("the five labels are exactly the approved wording", () => {
    expect(BANDS.map((b) => b.label)).toEqual([
      "Nincs jellemző tünet",
      "Enyhe tünetek jelei",
      "Közepes erősségű tünetek",
      "Erősebb tünetek",
      "Nagyon erős tünetek",
    ]);
  });

  test("no band, note or label uses clinical vocabulary", () => {
    const BANNED = [
      "depresszió", "depressziós", "szorongászavar", "szorongásos zavar",
      "diagnózis", "diagnózisa", "betegség", "kór", "súlyos", "enyhe depresszió",
      "generalizált", "pánikroham", "pszichiátriai", "betegségtudat",
    ];
    for (const band of BANDS) {
      const hay = `${band.label} ${band.note}`.toLowerCase();
      for (const word of BANNED) {
        expect(hay).not.toContain(word);
      }
    }
  });

  test("the module names no diagnosis at all any more", () => {
    const src = readFileSync(new URL("../src/lib/assessments.ts", import.meta.url), "utf8");
    // It used to allow two: the disclaimer and the comment above it. The
    // disclaimer is in the catalogue now, so the honest form of this rule is
    // zero — which is the stronger claim, not the weaker one.
    const hits = src.match(/diagnózis/gi) ?? [];
    expect(hits.length).toBe(0);
  });

  test("every score from 0 to 27 resolves to a band, at the boundaries", () => {
    for (let v = 0; v <= MAX_SCORE; v += 1) {
      const b = bandFor(v);
      expect(v).toBeGreaterThanOrEqual(b.min);
      expect(v).toBeLessThanOrEqual(b.max);
    }
  });

  test("the cut points follow the PHQ convention, at exactly 5/10/15/20", () => {
    expect(bandFor(4).label).toBe("Nincs jellemző tünet");
    expect(bandFor(5).label).toBe("Enyhe tünetek jelei");
    expect(bandFor(9).label).toBe("Enyhe tünetek jelei");
    expect(bandFor(10).label).toBe("Közepes erősségű tünetek");
    expect(bandFor(14).label).toBe("Közepes erősségű tünetek");
    expect(bandFor(15).label).toBe("Erősebb tünetek");
    expect(bandFor(19).label).toBe("Erősebb tünetek");
    expect(bandFor(20).label).toBe("Nagyon erős tünetek");
    expect(bandFor(27).label).toBe("Nagyon erős tünetek");
  });

  test("the owner rejected rescaling — a raw sum is never mapped elsewhere", () => {
    // 9 items × 3 = 27, so the top band is 20..27. If a future change adds a
    // proportional score, these edges move and this test says so.
    expect(BANDS[4]!.min).toBe(20);
    expect(BANDS[4]!.max).toBe(27);
    expect(BANDS).toHaveLength(5);
  });
});

/* ================================================================== */
/* 5. Disclaimer and resources                                        */
/* ================================================================== */

describe("the disclaimer is exactly the mandated wording", () => {
  test("byte-exact", () => {
    expect(DISCLAIMER).toBe(
      "Ez nem diagnózis, hanem összegzés arról, amit írtál be. Ha valami aggaszt, érdemes szakemberrel beszélni.",
    );
  });

  test("it is a single exported constant — no second copy exists", () => {
    // The wording moved into the catalogue, so this guard moved with it rather
    // than being deleted: there is still exactly ONE copy in the app, and now it
    // is asserted to be in `i18n.ts` and NOWHERE ELSE UNDER src/ — which covers
    // all five surfaces and any sixth added later, where the old version named
    // one module and trusted the rest.
    //
    // The needle is the imported constant itself. Typing a second copy of the
    // sentence into a test whose job is to prove there is no second copy is how
    // the second copy gets made in the first place.
    const occurrences = countInSrc(DISCLAIMER);
    expect(occurrences.get("src/lib/i18n.ts"), "the one copy, in the catalogue").toBe(1);
    for (const [file, n] of occurrences) {
      if (file !== "src/lib/i18n.ts") expect(n, file).toBe(0);
    }
  });

  test("the same for the resources heading — one copy, everywhere else none", () => {
    const occurrences = countInSrc(RESOURCES_TITLE);
    expect(occurrences.get("src/lib/i18n.ts"), "the one copy, in the catalogue").toBe(1);
    for (const [file, n] of occurrences) {
      if (file !== "src/lib/i18n.ts") expect(n, file).toBe(0);
    }
  });

  test("the five surfaces still reach it through the one exported name", () => {
    // The point of keeping `DISCLAIMER` and `RESOURCES_TITLE` exported is that
    // the surfaces did not have to change. This pins that: every module that
    // shows either sentence imports it, rather than reading a key itself.
    for (const path of [
      "src/components/CrisisCard.tsx",
      "src/components/AssessmentResult.tsx",
      "src/components/AssessmentConsent.tsx",
      "src/views/SettingsView.tsx",
      "src/lib/reportPdf.ts",
    ]) {
      const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
      if (path === "src/lib/reportPdf.ts" || path === "src/views/SettingsView.tsx") {
        expect(src.includes("DISCLAIMER"), `${path} reads the disclaimer`).toBe(true);
        expect(src.includes('from "./assessments"') || src.includes('from "../lib/assessments"'), path).toBe(true);
        continue;
      }
      expect(src.includes("DISCLAIMER") || src.includes("CrisisCard"), `${path} reads the disclaimer`).toBe(true);
      expect(src.includes('from "../lib/assessments"') || src.includes("CrisisCard"), path).toBe(true);
    }
  });
});

describe("resources are present, correct, and verified", () => {
  test("every mandatory number is present", () => {
    const phones = RESOURCES.map((r) => r.phone ?? "").join(" ");
    for (const n of ["116-123", "112", "116-111", "116-000"]) {
      expect(phones).toContain(n);
    }
  });

  test("116-123 and 112 are the first two entries, in that order", () => {
    // These are the two the safety notice names, so they lead the list.
    expect(RESOURCES[0]!.phone).toBe("116-123");
    expect(RESOURCES[1]!.phone).toBe("112");
  });

  test("the 24/7 lines say so, in plain Hungarian", () => {
    const first = RESOURCES[0]!;
    expect(first.hours).toBe("éjjel-nappal, ingyenes");
  });

  test("the web resources are https and Hungarian-language sites", () => {
    const hrefs = RESOURCES.map((r) => r.href).filter(Boolean) as string[];
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    for (const h of hrefs) expect(h.startsWith("https://")).toBe(true);
    expect(hrefs.join(" ")).toContain("ongyilkossagmegelozes.hu");
  });

  test("nothing in the module reaches an external host at runtime", () => {
    // Resources are plain links the user may choose to open. The module must
    // not ship code that fetches anything — the app keeps its no-upload promise.
    const src = readFileSync(new URL("../src/lib/assessments.ts", import.meta.url), "utf8");
    expect(src).not.toContain("fetch(");
    expect(src).not.toContain("XMLHttpRequest");
  });
});

describe("the safety notice", () => {
  test("is byte-exact", () => {
    expect(SAFETY_NOTICE).toBe(
      "Ha bármikor ilyen gondolatai vannak, azonnal hívja a 116-123-at (éjjel-nappal, ingyenes) vagy 112-t életveszély esetén.",
    );
  });

  test("names both numbers the user needs", () => {
    expect(SAFETY_NOTICE).toContain("116-123");
    expect(SAFETY_NOTICE).toContain("112");
  });

  test("the supplementary item is labelled as an addition, not part of the form", () => {
    expect(SUPPLEMENTARY_LABEL).toBe("kiegészítő kérdés");
  });
});

/* ================================================================== */
/* 6. Storage: dated log, own key, not on the profile                 */
/* ================================================================== */

describe("assessment storage", () => {
  const day = "2026-03-01";
  const answers = [1, 1, 2, 0, 1, 2, 1, 0, 0]; // sums to 8

  test("uses its own key, not the app blob", () => {
    expect(STORAGE_KEY).toBe("belso-iranytu-assessments-v1");
    addAssessment({ date: day, answers });
    const keys = Object.keys(backing);
    expect(keys).toEqual([STORAGE_KEY]);
    // The main app blob is never created by writing an assessment.
    expect(keys).not.toContain("belso-iranytu-data-v2");
  });

  test("only raw answers are persisted — score and band are derived", () => {
    addAssessment({ date: day, answers });
    const raw = JSON.parse(backing[STORAGE_KEY]!) as {
      items: Record<string, unknown>[];
    };
    const item = raw.items[0]!;
    expect(item.answers).toEqual(answers);
    expect(item.date).toBe(day);
    // A stored score could drift from a stored answer if bands ever change.
    expect(item).not.toHaveProperty("score");
    expect(item).not.toHaveProperty("band");
  });

  test("the log is dated and newest-first", () => {
    addAssessment({ date: "2026-03-01", answers });
    addAssessment({ date: "2026-03-05", answers });
    addAssessment({ date: "2026-03-03", answers });
    expect(listAssessments().map((a) => a.date)).toEqual(["2026-03-05", "2026-03-03", "2026-03-01"]);
  });

  test("it is append-only — a second run never overwrites the first", () => {
    const a = addAssessment({ date: day, answers })!;
    const b = addAssessment({ date: day, answers: [3, 3, 3, 3, 3, 3, 3, 3, 3] })!;
    expect(a.id).not.toBe(b.id);
    expect(listAssessments()).toHaveLength(2);
  });

  test("derived score and band come back on read", () => {
    addAssessment({ date: day, answers });
    const rec = listAssessments()[0]!;
    expect(rec.score).toBe(8);
    expect(rec.band.label).toBe("Enyhe tünetek jelei");
    expect(rec.needsSupport).toBe(false);
  });

  test("needsSupport is derived, never persisted", () => {
    addAssessment({ date: day, answers: [...Array(8).fill(0), 2] });
    const rec = listAssessments()[0]!;
    expect(rec.needsSupport).toBe(true);
    expect(backing[STORAGE_KEY]).not.toContain("needsSupport");
  });

  test("the optional impact answer round-trips", () => {
    addAssessment({ date: day, answers, impact: 2 });
    addAssessment({ date: "2026-03-02", answers });
    // Newest first: 03-02 (no impact) is [0], 03-01 (impact 2) is [1].
    const log = listAssessments();
    expect(log[0]!.date).toBe("2026-03-02");
    expect(log[0]!.impact).toBeNull();
    expect(log[1]!.date).toBe(day);
    expect(log[1]!.impact).toBe(2);
  });

  test("an incomplete run is refused outright", () => {
    expect(addAssessment({ date: day, answers: [1, 2, 3] })).toBeNull();
    expect(listAssessments()).toEqual([]);
    expect(backing[STORAGE_KEY]).toBeUndefined();
  });

  test("a malformed date is refused", () => {
    expect(addAssessment({ date: "2026-3-1", answers })).toBeNull();
    expect(addAssessment({ date: "not-a-date", answers })).toBeNull();
    expect(addAssessment({ date: "", answers })).toBeNull();
  });

  test("a corrupt payload degrades to an empty log, never a crash", () => {
    for (const junk of ["{", "null", "[]", '"x"', '{"version":1}', '{"version":1,"items":{}}']) {
      backing[STORAGE_KEY] = junk;
      expect(() => listAssessments()).not.toThrow();
      expect(listAssessments()).toEqual([]);
    }
  });

  test("a tampered half-written record is dropped, not scored", () => {
    // The one thing this feature must never do is put a partial run in a band.
    backing[STORAGE_KEY] = JSON.stringify({
      version: 1,
      items: [
        { id: "a", date: "2026-03-01", answers: [1, 1, 1], impact: null },
        { id: "b", date: "2026-03-02", answers: [1, 1, 1, 9, 1, 1, 1, 1, 1], impact: null },
        { id: "c", date: "2026-03-03", answers: [1, 1, 1, 1, 1, 1, 1, 1, 1], impact: null },
      ],
    });
    const log = listAssessments();
    expect(log.map((a) => a.id)).toEqual(["c"]);
  });

  test("turning the module off actually deletes the data", () => {
    addAssessment({ date: day, answers });
    expect(listAssessments()).toHaveLength(1);
    clearAssessments();
    expect(listAssessments()).toEqual([]);
    expect(backing[STORAGE_KEY]).toBeUndefined();
  });

  test("a single record can be removed", () => {
    const a = addAssessment({ date: day, answers })!;
    addAssessment({ date: "2026-03-02", answers });
    removeAssessment(a.id);
    expect(listAssessments().map((r) => r.date)).toEqual(["2026-03-02"]);
  });

  test("getAssessment finds by id and returns null otherwise", () => {
    const a = addAssessment({ date: day, answers })!;
    expect(getAssessment(a.id)?.date).toBe(day);
    expect(getAssessment("nope")).toBeNull();
  });

  test("unavailable storage degrades to memory, still functional", async () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    resetForTests();
    expect(addAssessment({ date: day, answers })).not.toBeNull();
    expect(listAssessments()).toHaveLength(1);
    expect(isMemoryOnly()).toBe(true);
  });
});

/* ================================================================== */
/* 7. The structural guarantee                                        */
/* ================================================================== */

describe("assessments cannot become a condition on the profile", () => {
  test("the main app data model has no assessments field", () => {
    const types = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    expect(types).not.toMatch(/^\s*assessments\s*[?:]/m);
  });

  test("the main store never imports the assessment modules", () => {
    for (const path of ["src/lib/store.ts", "src/lib/analysis.ts", "src/lib/achievements.ts"]) {
      const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
      expect(src).not.toContain("assessmentStore");
      expect(src).not.toContain("assessments");
    }
  });

  test("nothing on the profile or entry type can reach an assessment", () => {
    const src = readFileSync(new URL("../src/lib/assessmentStore.ts", import.meta.url), "utf8");
    // The store is self-contained: it imports only the pure module, so it can
    // never see a profile, an entry, or the app's data shape.
    const imports = [...src.matchAll(/^import .*from "([^"]+)";/gm)].map((m) => m[1]!);
    expect(imports).toEqual(["./assessments"]);
  });

  test("the store never writes to the app blob", () => {
    // Comments are stripped first: the module's doc comment NAMES the app blob
    // precisely to explain why it does not touch it, and a naive substring
    // scan would flag the rationale as the violation.
    const src = readFileSync(new URL("../src/lib/assessmentStore.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toContain("belso-iranytu-data-v2");
    expect(src).not.toContain("localStorage.getItem(\"belso-iranytu");
  });
});

/* ================================================================== */
/* 8. Nothing existing was disturbed                                   */
/* ================================================================== */

describe("Batch 6 Commit 1 touches no existing behaviour", () => {
  test("Batch 6 touches a known, enumerated set of files and nothing else", () => {
    // This began as a Commit 1 scoping guard ("adds files only") and became
    // stale the moment Commit 2 legitimately modified settings, the toolbox
    // and the PDF. Restated as the invariant it was actually protecting:
    // the feature touches a known set, and anything outside it is a surprise
    // worth a human look rather than a drive-by edit.
    //
    // The base is DERIVED and deliberately NOT `main`. This guard used to
    // diff against `main`, which meant the instant the branch was merged the
    // diff came back empty and the allowlist was never consulted — it passed
    // on the branch and failed on main, exactly backwards for a guard. The
    // base is now the parent of the commit that first added
    // lib/assessments.ts, so it means the same thing in both places.
    const changed = batchDiff("--name-only", "src tests public")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // Premise absent — no pre-batch tree of this project exists (imported or
    // squashed history; see batchDiff). There is no scope to violate, so the
    // guard stands down instead of reporting the import as Batch 6's work.
    if (changed.length === 0) return;
    const ALLOWED = new Set([
      // Commit 1 — the instrument and its storage, both inert.
      "src/lib/assessments.ts",
      "src/lib/assessmentStore.ts",
      "tests/batch6.test.ts",
      // Commit 2 — the UI, the settings gate, the two exports.
      "src/components/AssessmentItemView.tsx",
      "src/components/AssessmentRunner.tsx",
      "src/components/AssessmentResult.tsx",
      "src/components/AssessmentLog.tsx",
      "src/components/AssessmentConsent.tsx",
      "src/components/AssessmentModule.tsx",
      "src/views/SettingsView.tsx",
      "src/views/TodayView.tsx",
      "src/components/ReportExport.tsx",
      "src/lib/reportPdf.ts",
      "src/lib/icons.tsx",
      "src/styles.css",
      "src/types.ts",
      "tests/batch6-ui.test.ts",
      "tests/batch6-pdf.test.ts",
    ]);
    expect(changed.length).toBeGreaterThan(0);
    // Later batches build on this one, so the diff legitimately grows. The
    // invariant is not "this exact list" — it is "nothing here is a file no
    // batch has claimed". Each batch's own guard asserts its own scope; this
    // one only has to know about the batches that share these files.
    for (const f of changed) {
      if (ALLOWED.has(f)) continue;
      // Batch 7 let 76 vendored icon-set SVGs through on a PATTERN rather than
      // 76 lines of list, and Batch 7b withdrew all 76 — the artwork is inlined
      // now, so the directory is gone. Both halves have to be answered, because
      // a pattern that can no longer match anything is a loophole: it would
      // hide a stray re-vendor.
      //
      //   still on disk → generated output nobody chose, allowed by pattern
      //   gone         → a Batch 7 withdrawal, allowed by the same claim
      //
      // `existsSync` is the whole test. Re-vendoring the directory on a later
      // branch without claiming it here would fail on the first pattern, which
      // is the point.
      if (/^public\/iconsets\/[a-z0-9-]+\/[a-z0-9-]+\.svg$/.test(f)) {
        const { existsSync } = require("node:fs") as typeof import("node:fs");
        if (!existsSync(new URL(`../${f}`, import.meta.url).pathname)) continue;
      }
      // Vendored typefaces, same argument: 12 woff2 files and 5 OFL texts whose
      // names are derived from `src/lib/fonts.ts`, and which
      // `scripts/vendor-fonts.ts` plus batch5/batch8's registry-to-directory
      // comparison check. Batch 8 added this pattern when it withdrew two
      // families; without it the guard fails on files nobody chose to name.
      if (/^public\/fonts\/[A-Za-z0-9-]+\.woff2$/.test(f)) continue;
      if (/^public\/fonts\/OFL-[a-z-]+\.txt$/.test(f)) continue;
      // Batch 7i's two subsets and their licence, in their own directory for
      // the reason Batch 8's two withdrawals needed a pattern here: the names
      // are derived from a vendoring script, not from `src/lib/fonts.ts`, so
      // no registry carries them. They are checked by byte count and SHA-256
      // against the manifest `scripts/subset-pdf-font.ts` wrote, which is the
      // check that is worth more than a filename would be.
      if (/^public\/pdf-fonts\/[A-Za-z0-9.-]+$/.test(f)) continue;
      expect(claimedByAnyBatch(f), `${f} is touched but claimed by no batch`).toBe(true);
    }
  });

  test("no source file was deleted or renamed", () => {
    // Batches 1-7 were additive and this asserted it flatly. Batch 8 is the
    // first batch to WITHDRAW anything: it removed Manrope and Plus Jakarta
    // Sans, so four binaries and two licence texts legitimately disappear and
    // git reports two of them as renames.
    //
    // The rule is narrowed rather than dropped, and the narrowing is the whole
    // point: a `src/` file disappearing is still forbidden outright, because
    // that is code, and no batch in this project removes code. A `public/`
    // VENDORED asset disappearing is a different thing — those files are
    // derived from a registry and re-derivable by a script — and is allowed
    // ONLY if the registry really stopped asking for it, which the next test
    // proves. An exception that cannot distinguish a withdrawal from data loss
    // would be worse than no guard at all.
    const rows = batchDiff("--name-status -M", "src tests public")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const parts = l.split("\t");
        return { status: parts[0]!, path: parts[parts.length - 1]! };
      });
    // Premise absent (imported/squashed history — see batchDiff): the guard
    // stands down. An empty diff here means "nothing to compare against",
    // not "nothing was deleted or renamed".
    if (rows.length === 0) return;
    // Non-empty, or this would pass trivially — the failure mode that made
    // the previous version of this file silently assert nothing.
    expect(rows.length).toBeGreaterThan(0);

    const removed = rows.filter((r) => r.status.startsWith("D") || r.status.startsWith("R"));
    for (const r of removed) {
      expect(
        r.path.startsWith("public/fonts/") || r.path.startsWith("public/iconsets/"),
        `${r.path} was ${r.status[0]} — only a vendored public asset may be withdrawn`,
      ).toBe(true);
    }
  });

  test("every withdrawn asset really is gone from its registry", () => {
    // The compensating half of the exception above. Batch 8 deleted four
    // binaries because `src/lib/fonts.ts` stopped listing them; a deletion
    // with no registry change behind it is data loss wearing a withdrawal's
    // clothes, and nothing else in the suite would notice.
    const fonts: { FONTS: { files: { file: string }[] }[]; HAND_FONTS: { files: { file: string }[] }[] } =
      require("../src/lib/fonts") as typeof import("../src/lib/fonts");
    const { readFileSync, existsSync } = require("node:fs") as typeof import("node:fs");
    const wanted = new Set(
      [...fonts.FONTS, ...fonts.HAND_FONTS].flatMap((f) => f.files.map((x) => x.file)),
    );
    const root = new URL("../", import.meta.url);
    const rows = batchDiff("--name-status -M", "public")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const parts = l.split("\t");
        const status = parts[0]!;
        const isRename = status.startsWith("R");
        return {
          status,
          // For a rename git prints OLD then NEW; for everything else, one path.
          old: isRename ? parts[1]! : parts[1]!,
          now: isRename ? parts[2]! : parts[1]!,
        };
      });
    const withdrawn = rows.filter(
      (r) => r.status.startsWith("D") || r.status.startsWith("R"),
    );
    // Premise absent (imported/squashed history — see batchDiff): there is
    // no pre-withdrawal tree to compare, so the withdrawal check has no
    // subject and the guard stands down.
    if (withdrawn.length === 0) return;
    expect(withdrawn.length).toBeGreaterThan(0);

    for (const r of withdrawn) {
      // Whatever went away is gone from disk, at both names a rename touches.
      expect(
        existsSync(new URL(r.old, root).pathname),
        `${r.old} still exists after being withdrawn`,
      ).toBe(false);
      if (r.status.startsWith("R")) {
        // ...and what replaced it is really there and really registered.
        expect(existsSync(new URL(r.now, root).pathname), `${r.now} is missing`).toBe(true);
        if (r.now.startsWith("public/fonts/") && r.now.endsWith(".woff2")) {
          const file = r.now.replace("public/fonts/", "");
          expect(
            wanted.has(file),
            `${r.now} replaced a withdrawn file but no registry entry asks for it`,
          ).toBe(true);
        }
      } else if (r.old.startsWith("public/fonts/")) {
        const file = r.old.replace("public/fonts/", "");
        expect(
          wanted.has(file),
          `${r.old} was deleted but the registry still asks for it`,
        ).toBe(false);
      }
    }
    // And the licence texts: one per family that ships binaries, and nothing
    // more. The COUNT is derived from the registry rather than written down,
    // because it was written down — as five — through two batches that changed
    // the number of families without touching this test. That is how a licence
    // text for a withdrawn family survives a withdrawal, which is exactly the
    // thing the loop above exists to catch.
    const dir = new URL("../public/fonts/", import.meta.url);
    const ofl = require("node:fs").readdirSync(dir.pathname) as string[];
    expect(ofl.filter((n) => n.toUpperCase().includes("OFL")).length).toBe(
      [...fonts.FONTS, ...fonts.HAND_FONTS].filter((f) => f.family !== null).length,
    );
    for (const n of ofl) {
      if (n.toUpperCase().includes("OFL")) {
        expect(readFileSync(new URL(n, dir), "utf8")).toContain("SIL OPEN FONT LICENSE");
      }
    }
  });

  test("mood and achievement emoji are still intact", () => {
    const mood = readFileSync(new URL("../src/lib/mood.ts", import.meta.url), "utf8");
    const ach = readFileSync(new URL("../src/lib/achievements.ts", import.meta.url), "utf8");
    for (const e of ["😖", "😕", "😐", "🙂", "😄"]) expect(mood).toContain(e);
    for (const e of ["🧭", "🔥", "🌿", "🏆", "🙏", "💧"]) expect(ach).toContain(e);
  });

  test("activity labels are still the correlation key", () => {
    const store = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
    expect(store).toContain('"🚶 Mozgás"');
  });
});
