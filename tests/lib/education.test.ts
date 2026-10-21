/**
 * Mega Batch, commit 2 — the registry's own proof.
 *
 * The registry is user-facing therapeutic prose, so these tests read it the
 * way a reviewer would: the shape (15 articles, 3-5 paragraphs), the language
 * (non-clinical with ONE declared exception, informal register, Hungarian),
 * and the read markers (own key, deduped, tolerant of a corrupt blob).
 *
 * The rules live in `lib/articleBlocklist.ts` and `lib/tegezoRule.ts`, not
 * here, so commit 11's meditations can be held to the same standard without
 * copying a regex. This file therefore tests the CONTENT; the component lives
 * in `tests/components/EducationLibraryCard.test.tsx`.
 *
 * NO JSX: this is a `.ts` file, so `createElement` is the only option — the
 * same reason `tests/batch7d.test.ts` is written this way. The localStorage
 * fake is the one from `tests/lib/micro-lessons.test.ts`, and `education.ts`
 * is stateless between calls, so there is no module cache to bust.
 *
 * NOTE: `tsconfig.json` is `include: ["src"]`, so NO test in this suite is
 * typechecked. `bun test` is the only thing standing between a typo in these
 * assertions and a silently weakened check.
 */
import { describe, expect, test, afterEach } from "bun:test";
import {
  ARTICLES,
  articlesByCategory,
  findArticle,
  getReadArticleIds,
  isArticleRead,
  markArticleRead,
  resetReadArticles,
} from "../../src/lib/education";
import {
  CLINICAL_EXCEPTIONS,
  clinicalHit,
  isClinicalException,
  therapeuticClaimHit,
} from "../../src/lib/articleBlocklist";
import {
  formalAddressHit,
  hasHungarianDiacritics,
  speaksFormally,
} from "../../src/lib/tegezoRule";

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => {
    backing[k] = v;
  },
  removeItem: (k: string) => {
    delete backing[k];
  },
};

afterEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
});

/** The 15 categories the spec names. Asserted, not merely documented. */
const CATEGORIES = [
  "CBT alapok",
  "Szorongás",
  "Depresszió",
  "Alvás",
  "Táplálkozás",
  "Mozgás",
  "Stressz",
  "Kapcsolatok",
  "Munka",
  "Gyász",
  "Düh",
  "Önértékelés",
  "Önegyüttérzés",
  "Mindfulness",
  "Krízis",
] as const;

/** Everything a reader can see of one article, as one searchable string. */
function proseOf(a: (typeof ARTICLES)[number]): string {
  return [a.title, ...a.paragraphs, a.takeaway, a.action].join(" ");
}

describe("education — registry integrity", () => {
  test("exactly 15 articles, unique ids, ed- prefix", () => {
    expect(ARTICLES.length).toBe(15);
    expect(new Set(ARTICLES.map((a) => a.id)).size).toBe(15);
    for (const a of ARTICLES) expect(a.id.startsWith("ed-"), a.id).toBe(true);
  });

  test("the 15 required categories are present, each exactly once", () => {
    expect([...ARTICLES.map((a) => a.category)].sort()).toEqual(
      [...CATEGORIES].sort(),
    );
  });

  test("every article: 3-5 paragraphs, each >= 60 chars, takeaway and action present", () => {
    for (const a of ARTICLES) {
      expect(a.paragraphs.length, a.id).toBeGreaterThanOrEqual(3);
      expect(a.paragraphs.length, a.id).toBeLessThanOrEqual(5);
      for (const p of a.paragraphs) {
        expect(p.trim().length, `${a.id}: ${p.slice(0, 30)}`).toBeGreaterThanOrEqual(
          60,
        );
      }
      expect(a.takeaway.trim().length, a.id).toBeGreaterThan(0);
      expect(a.action.trim().length, a.id).toBeGreaterThan(0);
    }
  });

  test("every article carries Hungarian diacritics", () => {
    for (const a of ARTICLES) {
      expect(hasHungarianDiacritics(proseOf(a)), a.id).toBe(true);
    }
  });
});

describe("education — the non-clinical rule", () => {
  test("no clinical vocabulary in any article", () => {
    for (const a of ARTICLES) {
      const hit = clinicalHit(proseOf(a));
      expect(hit, `${a.id} contains "${hit}"`).toBeNull();
    }
  });

  test("no therapeutic promises, even where the clinical sweep is clean", () => {
    for (const a of ARTICLES) {
      const hit = therapeuticClaimHit(proseOf(a));
      expect(hit, `${a.id} promises "${hit}"`).toBeNull();
    }
  });

  test("a professional is named only by the crisis article", () => {
    const naming = ARTICLES.filter((a) => /szakember/.test(proseOf(a))).map(
      (a) => a.id,
    );
    expect(naming).toEqual(["ed-krizis"]);
    // The exception is a LIST, and the list must not quietly grow.
    expect([...CLINICAL_EXCEPTIONS]).toEqual(["ed-krizis"]);
    expect(isClinicalException("ed-krizis")).toBe(true);
    expect(isClinicalException("ed-duh")).toBe(false);
  });

  test("the crisis article names both helplines", () => {
    const krizis = proseOf(findArticle("ed-krizis")!);
    expect(krizis).toContain("116-123");
    expect(krizis).toContain("112");
  });
});

describe("education — the register rule", () => {
  test("tegeződés: no formal address in any user-facing line", () => {
    for (const a of ARTICLES) {
      const hit = formalAddressHit(proseOf(a));
      expect(hit, `${a.id} says "${hit}"`).toBeNull();
    }
  });

  // Three boundary cases, and all three are load-bearing:
  //   - two category NAMES begin with "Ön", and are not address;
  //   - "jön" CONTAINS "ön", and JS `\b` treats the accented letter as a
  //     non-word char, so a `\b`-based rule flags it. This is the case that
  //     actually failed on `ed-alvas`.
  //   - the lowercase formal word must still be caught, because Hungarian only
  //     capitalises the first word of a sentence.
  test("the sweep fires only on real formal address", () => {
    expect(speaksFormally("Önértékelés")).toBe(false);
    expect(speaksFormally("Önegyüttérzés")).toBe(false);
    expect(speaksFormally("Ha az alvás nem jön be, próbáld újra")).toBe(false);
    expect(speaksFormally("Jegyezd le, hogy mit éreztél")).toBe(false);
    expect(speaksFormally("Kérlek, vegye figyelembe")).toBe(true);
    expect(speaksFormally("Ön")).toBe(true);
    expect(formalAddressHit("Kérlek, vegye figyelembe")).toBe("vegye");
  });
});

describe("education — grouping and lookup", () => {
  test("articlesByCategory: 15 groups, counts sum to 15, registry order kept", () => {
    const groups = articlesByCategory();
    expect(groups.length).toBe(15);
    expect(groups.reduce((n, g) => n + g.articles.length, 0)).toBe(15);
    expect(groups.map((g) => g.category)).toEqual(
      ARTICLES.map((a) => a.category),
    );
  });

  test("findArticle resolves every id and nothing else", () => {
    for (const a of ARTICLES) expect(findArticle(a.id)?.title).toBe(a.title);
    expect(findArticle("ed-nincs")).toBeUndefined();
    expect(findArticle("")).toBeUndefined();
  });
});

describe("education — read markers", () => {
  test("nothing is read at first", () => {
    expect(getReadArticleIds()).toEqual([]);
    expect(isArticleRead("ed-cbt-alapok")).toBe(false);
  });

  test("markArticleRead makes it read, and it survives a re-read", () => {
    markArticleRead("ed-alvas");
    expect(isArticleRead("ed-alvas")).toBe(true);
    expect(getReadArticleIds()).toEqual(["ed-alvas"]);
  });

  test("marking twice does not duplicate", () => {
    markArticleRead("ed-alvas");
    markArticleRead("ed-alvas");
    markArticleRead("ed-munka");
    expect(getReadArticleIds()).toEqual(["ed-alvas", "ed-munka"]);
  });

  test("an empty id is ignored", () => {
    markArticleRead("");
    expect(getReadArticleIds()).toEqual([]);
  });

  test("a corrupt blob is an empty one, and marking still works after it", () => {
    backing["belso-iranytu-education-read"] = "{not json";
    expect(getReadArticleIds()).toEqual([]);
    markArticleRead("ed-gyasz");
    expect(getReadArticleIds()).toEqual(["ed-gyasz"]);
  });

  test("wrong shapes and junk rows are tolerated", () => {
    backing["belso-iranytu-education-read"] = JSON.stringify(["ed-alvas"]);
    expect(getReadArticleIds()).toEqual([]);
    backing["belso-iranytu-education-read"] = JSON.stringify({
      articleIds: "nope",
    });
    expect(getReadArticleIds()).toEqual([]);
    backing["belso-iranytu-education-read"] = JSON.stringify({
      articleIds: ["ed-alvas", 7, null, { a: 1 }],
    });
    expect(getReadArticleIds()).toEqual(["ed-alvas"]);
  });

  test("the marker is written to its own key and never to the main blob", () => {
    markArticleRead("ed-duh");
    expect(Object.keys(backing)).toEqual(["belso-iranytu-education-read"]);
    expect("belso-iranytu-data-v2" in backing).toBe(false);
  });

  test("resetReadArticles clears the markers", () => {
    markArticleRead("ed-duh");
    resetReadArticles();
    expect(getReadArticleIds()).toEqual([]);
    expect("belso-iranytu-education-read" in backing).toBe(false);
  });
});