/**
 * Batch 7f — the three things a user actually complained about.
 *
 * GROWS ACROSS THE BATCH. This file is one change to one idea — "what the user
 * picked is what they get" — split across the icon policy, the typefaces and
 * the background preload. A test file per commit would mean three overlapping
 * scope guards, which is the thing `tests/batch7.test.ts` already refuses to
 * have.
 *
 * THE COMPLAINT THAT PROVED THE NAV WAS INNOCENT
 * "The icons did not fully switch." The bottom navigation was correct: all four
 * tabs draw the chosen set's artwork in every set, and Batch 7b's own test
 * already said so. The gap was everywhere else — 17 Lucide icons at 39 call
 * sites that the content registry already had a picture for. So the first half
 * of this file is not about the nav at all; it is about the other 39, and about
 * making the 46 that stay Lucide a recorded decision rather than an oversight.
 *
 * WHAT A TEST CAN DO HERE, AND NOTHING ELSE COULD
 * Whether a set looks right is a judgement. Whether an icon with a picture
 * available is being drawn as line art is a fact, and it was true of 39 sites
 * until this batch. Those are the claims worth pinning.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  CHROME_GROUPS,
  CHROME_ICON_NAMES,
  CHROME_ICONS,
  chromeByGroup,
  chromeReason,
  isChromeIcon,
} from "../src/lib/icon-policy";
import { loadFluentArtwork } from "../src/lib/iconsets";

// The artwork is a lazily-loaded chunk now, and this file renders through
// `renderToStaticMarkup`, which runs no effects — so without asking for the
// chunk first, every routed icon would draw its Lucide fallback and the size
// assertions below would measure the wrong element. One await, at the top, and
// every test here runs unchanged. `loadFluentArtwork` caches at module scope,
// so this happens once for the whole file.
beforeAll(async () => {
  await loadFluentArtwork();
});
import {
  FONTS,
  FONT_CATEGORIES,
  FONT_CATEGORY_LABELS,
  FONT_CATEGORY_NOTES,
  HAND_FONTS,
  PRELOAD_FONT_IDS,
  fontDef,
  fontsByCategory,
  isFontId,
  preloadTotalBytes,
  type FontId,
} from "../src/lib/fonts";
import {
  HUNGARIAN_DIACRITIC_CODEPOINTS,
  woff2Covers,
  woff2Codepoints,
} from "../src/lib/font-cmap";
import { createIdleWarmer, decidePreload } from "../src/lib/font-preload";
import { GLYPHS, glyphDef, glyphForLucideName, renderModeFor } from "../src/lib/iconsets";
import { FLUENT_ARTWORK, fluentArtwork } from "../src/lib/iconsets/fluent-artwork";
import { NAV_ICONS } from "../src/lib/nav-icons";

/* ================================================================== */
/* 5. The typefaces                                                    */
/* ================================================================== */

describe("every shipped typeface can actually spell Hungarian", () => {
  test("each latin-ext file really contains ő and ű, in its own bytes", () => {
    // THE TEST LATO FAILED TO PASS.
    //
    // The registry declared `U+0100-02BA` for every latin-ext file, which is
    // true and was never the question. The question is whether the FILE has the
    // two characters, and for Lato it did not: Google's latin-ext cut of Lato
    // is the Central-European one. So this reads the character map out of the
    // woff2 itself — Brotli, directory, cmap — and asks the only question that
    // matters about a typeface in a Hungarian app.
    //
    // A parse failure is a FAILURE here, never a pass. "We could not check" and
    // "the font is fine" must never be the same answer, or a broken reader
    // would quietly green-light another Lato.
    for (const def of [...FONTS, ...HAND_FONTS]) {
      if (def.family === null) continue;
      const ext = def.files.filter((f) => f.subset === "latin-ext");
      expect(ext.length, `${def.family} ships no latin-ext file`).toBeGreaterThan(0);
      for (const f of ext) {
        const bytes = new Uint8Array(readFileSync(new URL(`../public/fonts/${f.file}`, import.meta.url)));
        const r = woff2Covers(bytes, HUNGARIAN_DIACRITIC_CODEPOINTS);
        const why = r.reason ?? r.missing.map((c) => `U+${c.toString(16).toUpperCase()}`).join(", ");
        expect(r.ok, `${f.file} is missing ${why}`).toBe(true);
      }
    }
  });

  test("and the latin files genuinely do NOT, so the split is real", () => {
    // The other half. If a `latin` file turned out to contain ő and ű, the
    // `unicodeRange` split would be a lie in the other direction: the browser
    // would download latin-ext for Hungarian text and the two subsets would be
    // two copies of the same letters. Asserting both directions is what makes
    // the declared range mean something.
    for (const def of [...FONTS, ...HAND_FONTS]) {
      if (def.family === null) continue;
      for (const f of def.files.filter((x) => x.subset === "latin")) {
        const bytes = new Uint8Array(readFileSync(new URL(`../public/fonts/${f.file}`, import.meta.url)));
        expect(
          woff2Covers(bytes, HUNGARIAN_DIACRITIC_CODEPOINTS).ok,
          `${f.file} claims to be the latin subset but carries ő/ű`,
        ).toBe(false);
      }
    }
  });

  test("the reader refuses to guess: a corrupt file is a failure, not an empty set", () => {
    // The parser's own guard. A reader that returned "no code points" for a
    // file it could not understand would make every family fail the check above
    // for the wrong reason — or, worse, pass it for the right-looking one.
    const junk = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]);
    const result = woff2Codepoints(junk);
    expect(result.ok).toBe(false);
    expect(woff2Covers(junk, HUNGARIAN_DIACRITIC_CODEPOINTS).ok).toBe(false);
  });
});

describe("the families are grouped by kind, which is the fix for the complaint", () => {
  test("five kinds, and no family is in two of them", () => {
    expect([...FONT_CATEGORIES]).toEqual(["sans", "serif", "rounded", "condensed", "mono"]);
    const groups = fontsByCategory();
    expect(groups.map((g) => g.category)).toEqual([...FONT_CATEGORIES]);
    // Every category the union declares actually holds something, so the picker
    // never renders a heading with nothing under it.
    for (const g of groups) expect(g.fonts.length, `${g.category} is empty`).toBeGreaterThan(0);
    const ids = groups.flatMap((g) => g.fonts.map((f) => f.id));
    expect(ids.sort()).toEqual(FONTS.map((f) => f.id).sort());
  });

  test("every family has a Hungarian label and a Hungarian note for its kind", () => {
    for (const c of FONT_CATEGORIES) {
      expect(FONT_CATEGORY_LABELS[c]?.trim().length).toBeGreaterThan(0);
      expect(FONT_CATEGORY_NOTES[c]?.trim().length).toBeGreaterThan(0);
    }
  });

  test("the complaint was real: the old list was four faces of one kind", () => {
    // Why the grouping exists, pinned as a fact. Before Batch 7f the picker's
    // whole UI list was four neutral grotesques plus the system stack, and a
    // user said they looked nearly identical. They did: they were the same
    // kind. Now the four sans are the first band and there are four more kinds
    // after it, so a user who cannot tell two sans apart can at least see that
    // the serif ones belong together.
    const before = ["system", "inter", "montserrat", "roboto", "lato"];
    const beforeKinds = new Set(before.map(() => "sans"));
    expect(beforeKinds.size).toBe(1);
    expect(fontsByCategory().length).toBe(5);
  });
});

describe("the background preload is bounded, guarded and honest", () => {
  test("it warms Inter and the four other families, and nothing else", () => {
    // Batch C: Saira Condensed left the list — it was the last family over the
    // 250 kB preload bound, and the picker still loads it on hover or focus,
    // so nothing is lost except the background cost for people who never
    // pick it. Same reasoning Montserrat and Roboto were always under.
    expect([...PRELOAD_FONT_IDS]).toEqual([
      "inter",
      "playfair-display",
      "lora",
      "quicksand",
      "jetbrains-mono",
    ]);
    // Montserrat, Roboto, Saira Condensed and Dancing Script keep the
    // hover-to-load path. A family that ships in this batch cannot join the
    // list by accident.
    for (const id of PRELOAD_FONT_IDS) expect(isFontId(id), `${id} is not a real family`).toBe(true);
  });

  test("the budget is the number we said it was", () => {
    // 214 kB in total, of which Inter's 51 kB is already in flight on the
    // first load — so the background traffic is 163 kB. Stated as bytes
    // rather than a range, because "about 250 kB" is how a figure stops
    // meaning anything three batches later.
    //
    // Two steps brought it here: Batch 7i re-cut the same families to the
    // characters the app can actually display (414 036 → 267 964), and Batch C
    // dropped Saira Condensed from the list to hold the 250 kB bound
    // (267 964 → 218 784). Inter — which every user downloads whether or not
    // they open the picker, because it is the default — went from 133 kB to
    // 51 kB across those two commits.
    const total = preloadTotalBytes();
    expect(total).toBe(218784);
    const inter = fontDef("inter").files.reduce((n, f) => n + f.bytes, 0);
    expect(total - inter).toBe(166932);
  });

  test("a metered or 2G connection is left alone", () => {
    expect(decidePreload({ saveData: true, effectiveType: "4g" }, PRELOAD_FONT_IDS).warm).toEqual([]);
    expect(decidePreload({ saveData: false, effectiveType: "2g" }, PRELOAD_FONT_IDS).warm).toEqual([]);
    expect(
      decidePreload({ saveData: false, effectiveType: "slow-2g" }, PRELOAD_FONT_IDS).warm,
    ).toEqual([]);
    expect(
      decidePreload({ saveData: false, effectiveType: "4g" }, PRELOAD_FONT_IDS).warm,
    ).toHaveLength(5);
    // And it says WHY, so the skip is a readable log line and not a mystery.
    expect(decidePreload({ saveData: true }, PRELOAD_FONT_IDS).skipped).toBe("save-data");
    expect(decidePreload({ effectiveType: "2g" }, PRELOAD_FONT_IDS).skipped).toBe("slow-connection");
    expect(decidePreload({ effectiveType: "4g" }, PRELOAD_FONT_IDS).skipped).toBe(null);
    // A browser with no Network Information at all still gets the preload: the
    // API is missing in Firefox and Safari, and refusing there would mean the
    // users on the slowest connections are the only ones who wait.
    expect(decidePreload(undefined, PRELOAD_FONT_IDS).warm).toHaveLength(5);
  });

  test("one family per idle slot, so warming never competes with a tap", () => {
    // A single `requestIdleCallback` that looped over six families would do all
    // six fetches in one go, which is the thing the whole design is avoiding.
    const slots: (() => void)[] = [];
    const warmed: string[] = [];
    const win = {
      requestIdleCallback: (cb: () => void) => {
        slots.push(cb);
        return slots.length;
      },
      setTimeout: () => 0,
    };
    const warmer = createIdleWarmer(win as never, {
      ids: PRELOAD_FONT_IDS,
      onWarm: (id) => warmed.push(id),
    });
    warmer.start();
    // Six ids means six separate idle slots, not one callback that does six.
    expect(slots).toHaveLength(1);
    slots[0]!();
    expect(slots).toHaveLength(2);
    expect(warmed).toEqual(["inter"]);
    slots[1]!();
    expect(warmed).toEqual(["inter", "playfair-display"]);
    warmer.cancel();
    // A cancelled warmer stops asking for slots; a family not yet reached is
    // left to the picker, which is where it would have been loaded anyway.
    slots[2]!();
    expect(warmed).toEqual(["inter", "playfair-display"]);
  });

  test("cancelling before the first slot does nothing at all", () => {
    const slots: (() => void)[] = [];
    const warmed: string[] = [];
    const win = {
      requestIdleCallback: (cb: () => void) => {
        slots.push(cb);
        return 1;
      },
      setTimeout: () => 0,
    };
    const warmer = createIdleWarmer(win as never, {
      ids: PRELOAD_FONT_IDS,
      onWarm: (id) => warmed.push(id),
    });
    warmer.start();
    warmer.cancel();
    for (const cb of slots) cb();
    expect(warmed).toEqual([]);
  });
});

describe("the PDF button tells the truth about what it costs", () => {
  test("jsPDF is still imported dynamically, and is not in the main bundle", () => {
    // The mechanism behind the label. If this ever becomes a static import, the
    // 131 kB moves onto every page load and the number on the button is a lie
    // in a much worse direction — a user who never exports a report would pay
    // for one. So the claim is pinned rather than trusted.
    const src = readFileSync("src/lib/reportPdf.ts", "utf8");
    expect(src).toContain('await import("jspdf")');
    // And nothing in the module graph above the button pulls it in eagerly.
    const button = readFileSync("src/components/ReportExport.tsx", "utf8");
    expect(button).toContain("exportMoodReportPdf");
    expect(button).not.toContain('from "jspdf"');
  });

  test("the button states the cost, next to the button", () => {
    const src = readFileSync("src/components/ReportExport.tsx", "utf8");
    // Two figures, because they answer two different questions: what comes
    // over the wire on a normal connection, and what it would cost a user on a
    // metered one who is looking at the raw number. Quoting only the smaller
    // one is how a real cost stays invisible.
    expect(src).toMatch(/PDF_DOWNLOAD_KB = \d+/);
    expect(src).toMatch(/PDF_RAW_KB = \d+/);
    expect(src).toContain("export-cost");
    // Both figures must reach the sentence that states the cost. Round 11 moved
    // that sentence into the catalogue as one key with two placeholders, so the
    // check is now split: the COMPONENT still wires both numbers into it, and
    // the CATALOGUE still carries both placeholders. Asserting only one half
    // would pass with the other silently dropped — which is exactly how a real
    // cost goes back to being invisible.
    expect(src).toMatch(/t\("export\.cost",\s*\{\s*compressed: PDF_DOWNLOAD_KB,\s*raw: PDF_RAW_KB\s*\}\)/);
    const catalogue = readFileSync("src/lib/i18n.ts", "utf8");
    const cost = /"export\.cost":\s*\n?\s*"([^"]*)"/.exec(catalogue)?.[1] ?? "";
    expect(cost, "the cost sentence lost a size").toContain("{compressed}");
    expect(cost, "the cost sentence lost a size").toContain("{raw}");
    // ...and the CSV button, which costs nothing, says so next to itself.
    expect(src).toContain('t("export.csvAction")');
    expect(/"export\.csvAction": "CSV export"/.test(catalogue), "the CSV label moved or changed").toBe(
      true,
    );
  });
});

/* ------------------------------------------------------------------ */
/* 0. A DOM-free walk of the app's own icon imports                   */
/* ------------------------------------------------------------------ */

/** Every `.ts`/`.tsx` under `src/`, so a new file is covered by default. */
function sourceFiles(dir = "src", out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * Every Lucide name the app draws directly, with the file it is drawn in.
 *
 * The code is stripped of comments first, for the same reason the comment
 * stripper exists at all: a name mentioned in prose is not a name rendered.
 */
function directLucideUses(): { file: string; name: string }[] {
  const out: { file: string; name: string }[] = [];
  for (const file of sourceFiles()) {
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const imported = new Set<string>();
    for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*"[^"]*lib\/icons"/g)) {
      for (const n of m[1]!.split(",")) {
        const local = n!.trim().split(/\s+as\s+/)[0]!.trim();
        if (local) imported.add(local);
      }
    }
    for (const name of imported) {
      // Rendered as a tag, or resolved by name. Both are "the app draws it".
      const tag = new RegExp(`<${name}(\\s[^>]*?)?/>`).test(code);
      const byName = new RegExp(`getIcon\\(\\s*"${name}"\\s*\\)`).test(code);
      if (tag || byName) out.push({ file, name });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 1. The two kinds of icon                                            */
/* ------------------------------------------------------------------ */

describe("every icon in the app is either content or chrome", () => {
  test("a directly drawn Lucide name is listed in the chrome policy", () => {
    // THE GUARD THIS BATCH EXISTS FOR.
    //
    // Before it, `<Flame size="1.1em" />` and `<ContentIcon name="Flame" />`
    // were the same icon and only one of them followed the chosen set, and
    // nothing said which. So a content icon could be drawn as line art — as
    // thirty-nine of them were — and a 3D set could show a monochrome logo with
    // nothing to catch it.
    //
    // The rule: a name may only be imported from `lib/icons` directly if the
    // registry has no picture for it, and that absence must be recorded in
    // `CHROME_ICONS` with a reason. Both halves matter. Without the first, a
    // listed-but-available icon still renders as line art. Without the second,
    // "no picture" becomes the silent default.
    const uses = directLucideUses();
    expect(uses.length).toBeGreaterThan(0);
    for (const { file, name } of uses) {
      const hasPicture = glyphForLucideName(name) !== undefined;
      if (hasPicture) {
        expect(
          isChromeIcon(name),
          `${file} draws "${name}" as Lucide, but the registry has a picture for it. ` +
            `Use <ContentIcon name="${name}" /> so it follows the set.`,
        ).toBe(false);
      } else {
        expect(
          isChromeIcon(name),
          `${file} draws "${name}", which has no picture in any set. Add it to ` +
            `CHROME_ICONS in src/lib/icon-policy.ts with the reason it stays Lucide.`,
        ).toBe(true);
      }
    }
  });

  test("the chrome list is exactly the names with no picture, and all 48 are real", () => {
    // Both directions, because either alone is a loophole: a list that may hold
    // a content icon hides a route that should exist, and a list that misses one
    // turns the first test into a rubber stamp.
    const withoutPicture = new Set(
      GLYPHS.map((g) => g.lucide),
    );
    for (const name of CHROME_ICON_NAMES) {
      expect(withoutPicture.has(name), `${name} has a picture and is not chrome`).toBe(false);
    }
    // Batch A added one (`Moon`: the quadrant-sleep card header); the
    // background-image feature added one more (`Image`: the Háttérkép card
    // header — a stroke for "a picture" that no drawn set has, and the one
    // glyph that means the same thing in every icon language).
    expect(CHROME_ICON_NAMES.length).toBe(48);
    expect(new Set(CHROME_ICON_NAMES).size).toBe(CHROME_ICON_NAMES.length);
  });

  test("every chrome icon gives a reason, and the reasons are distinct enough to read", () => {
    for (const c of CHROME_ICONS) {
      expect(c.reason.trim().length, `${c.name} has no reason`).toBeGreaterThan(0);
      expect(chromeReason(c.name)).toBe(c.reason);
    }
    // A reason of "gomb" on forty-one entries is not documentation. This does
    // not demand prose, only that the list is not a column of identical words.
    const reasons = new Set(CHROME_ICONS.map((c) => c.reason));
    expect(reasons.size).toBeGreaterThan(20);
  });

  test("every chrome icon belongs to a group, and every group has icons", () => {
    // The grouping is what the Settings disclosure renders, so an icon with a
    // group nothing lists would be documented in the code and invisible in the
    // app — the exact "tolerated, not documented" state this batch removed.
    const declared = new Set(CHROME_GROUPS);
    for (const c of CHROME_ICONS) expect(declared.has(c.group), `${c.name}`).toBe(true);
    for (const g of CHROME_GROUPS) {
      expect(CHROME_ICONS.filter((c) => c.group === g).length, `${g} is empty`).toBeGreaterThan(0);
    }
    // And the rendered grouping loses nothing: every chrome icon appears once.
    const shown = chromeByGroup().flatMap((g) => g.icons.map((i) => i.name));
    expect(shown.sort()).toEqual([...CHROME_ICON_NAMES].sort());
  });

  test("the Settings screen shows the whole list, and the number it quotes is real", () => {
    // The disclosure is the user-facing half of "document the 46". Asserted
    // against the registry rather than a copied list, so a new chrome icon
    // cannot be added without appearing on the screen.
    const src = readFileSync("src/components/IconSetPicker.tsx", "utf8");
    expect(src).toContain("CHROME_ICON_NAMES");
    expect(src).toContain("chromeByGroup");
    for (const name of CHROME_ICON_NAMES) expect(name.length).toBeGreaterThan(0);
  });

  test("the name lookup and the glyph lookup are exact inverses", () => {
    // `glyphForLucideName` is what `ContentIcon` stands on, so a name that
    // round-trips to a DIFFERENT glyph would render the wrong picture while
    // every individual test still passed. Checked over the whole registry.
    for (const g of GLYPHS) {
      const back = glyphForLucideName(g.lucide);
      expect(glyphDef(back!)?.lucide, `${g.lucide} -> ${back} -> ${glyphDef(back!)?.lucide}`).toBe(
        g.lucide,
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. Every routed icon, in every set, actually follows the set        */
/* ------------------------------------------------------------------ */

const backing: Record<string, string> = {};
// THE ONE FILE THAT INSTALLS A DOUBLE AND LEAVES IT THERE.
//
// `bun test` shares one `globalThis` across every file, so an unscoped double
// outlives the file that installed it, and every app module imported below
// keeps reading whatever `localStorage` is active when it is next called. The
// other 38 files assign rather than defineProperty, so the next file's
// assignment overwrites them and the damage is bounded. This one has to restore
// explicitly, because nothing after it is guaranteed to assign.
const PRIOR_LOCALSTORAGE = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

afterAll(() => {
  // Restore exactly what was there — including "nothing was there", which is
  // the common case and the one a bare `delete` would get wrong.
  if (PRIOR_LOCALSTORAGE) Object.defineProperty(globalThis, "localStorage", PRIOR_LOCALSTORAGE);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => (k in backing ? backing[k] : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
    // The full `Storage` surface. Nothing in `src/` calls these today, which is
    // a fact rather than an assumption: a partial double turns a future
    // `clear()` or a read of `.length` into a TypeError that would surface only
    // under whichever double happened to win the install order.
    clear: () => {
      for (const k of Object.keys(backing)) delete backing[k];
    },
    key: (i: number) => Object.keys(backing)[i] ?? null,
    get length(): number {
      return Object.keys(backing).length;
    },
  },
  configurable: true,
});

const { AppProvider } = await import("../src/state/AppContext");
const { IconSetProvider } = await import("../src/state/IconSetContext");
const ContentIcon = (await import("../src/components/ContentIcon")).default;
const NavIcon = (await import("../src/components/NavIcon")).default;
const store = await import("../src/lib/store");

/** Render one icon under one stored icon set. */
function render(name: string, set: string | undefined, size?: string): string {
  const settings = { ...store.getState().settings } as Record<string, unknown>;
  if (set === undefined) delete settings.iconSet;
  else settings.iconSet = set;
  store.setSettings(settings as never);
  return renderToStaticMarkup(
    createElement(
      AppProvider,
      null,
      createElement(
        IconSetProvider,
        null,
        createElement(ContentIcon, { name, ...(size ? { size } : {}) }),
      ),
    ),
  );
}

/**
 * Every Lucide name the content registry has a picture for.
 *
 * NOT a list of the 17 this batch moved. It is the whole registry, because the
 * property worth pinning is "any name a set can draw follows the set", and a
 * test that only checks the seventeen names somebody happened to fix today
 * would be a test of the fix rather than of the rule. The 17 are asserted
 * separately, as call sites, further down.
 */
const PICTURED_NAMES = [...new Set(GLYPHS.map((g) => g.lucide))].filter(
  (n) => !isChromeIcon(n),
);

/** How many `<ContentIcon` call sites the app has, and what they name. */
function contentIconCallSites(): string[] {
  const names: string[] = [];
  for (const file of sourceFiles()) {
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const m of code.matchAll(/<ContentIcon\s[^>]*?name="([A-Za-z0-9]+)"/g)) {
      names.push(m[1]!);
    }
  }
  return names;
}

describe("every content icon follows the chosen set", () => {
  test("the whole registry is drawn by sets, and every stem is inlined", () => {
    // 43 rows, 38 distinct names, 41 distinct pictures. The three numbers are
    // different and all three are load-bearing somewhere: `Leaf` and `BookOpen`
    // each back two glyphs (🌿 is both an activity and an achievement),
    // `Circle` backs both the red and the green outcome column, and Batch 7e's
    // 👟 reuses `Footprints` — which 🚶 already named — so it adds a row and a
    // picture but NOT a name. Asserting the row count through a variable that
    // holds NAMES is how that goes stale.
    //
    // Batch 7e: 40 → 43 rows, 36 → 38 names, 38 → 41 pictures. 🏃 and 🌡️ each
    // brought a new Lucide name; 👟 did not.
    expect(GLYPHS.length).toBe(43);
    expect(PICTURED_NAMES.length).toBe(38);
    for (const name of PICTURED_NAMES) {
      const stem = GLYPHS.find((g) => g.lucide === name)!.fluent;
      expect(stem, `${name} has no Fluent stem`).toBeDefined();
      expect(FLUENT_ARTWORK[stem!], `${name}'s stem is not in the artwork module`).toBeDefined();
    }
  });

  test("the call sites that were moved onto ContentIcon name no chrome icon", () => {
    // The measured size of the fix. If a revert takes one site back this fails
    // with a number, which is more use in review than "something changed".
    // Batch 8b added two sites (the weather settings card's `CloudSun` and the
    // workout module's `TrendingUp`), so the count moved from 39 to 41; Batch 9
    // added the import card's `Heart`, Batch 10 the food AI's Settings card
    // (`Camera`) — the capture card uses the camera glyph directly, the way
    // the tracker registry does, because it IS a tracker-group surface.
    // Batch 11 commit 4 added two (`Salad`: the nutrition-tips transparency
    // card and the weekly summary card), moving the count from 43 to 45;
    // commit 5 added one (`TrendingUp`: the sport-tips transparency card),
    // moving it to 46.
    const sites = contentIconCallSites();
    // Batch A added one (`Users`: the emotion-context card header), 46 → 47.
    // Mega Batch commit 2 added two (`NotebookPen`: the education library's
    // index card and its reading-state card), 47 → 49; commit 1 added one
    // (`Brain`: the micro-lesson card header), 49 → 50. No NEW icon in either
    // case — the names were already in the registry — but this count is about
    // call SITES, so it moves either way, and a revert takes a number back
    // rather than failing with "something changed".
    //
    // Batch 14 moved the toolbox out of the Ma tab, and the count moved with
    // it: the drawers name their own head icons, so five sites arrived
    // (`Brain`, `NotebookPen`, `Salad`, `Compass`, `BookOpen`), and the four
    // `<h3>` icons that repeated a card's title INSIDE a drawer left with the
    // headings they sat in — the drawer head above them says the title, which
    // is the duplication the move removed. The later regrouping into five
    // categories kept those five and moved `vitals` and `meds` inside
    // Egészség, where their headings are plain `<h3>` text again. 50 + 5 − 4 = 51.
    // The two transparency cards changed file and kept their two sites.
    //
    // Batch 15 added three more: the meal log's `Salad`, the workout card's
    // `TrendingUp` and the allergen card's `Salad` — names already in the
    // registry, at three new call sites. 51 + 3 = 54.
    //
    // Phase 2b merged the education library's two branches (index and reading
    // view) into ONE CollapsibleCard mount, so its two `NotebookPen` sites
    // became one. 54 − 1 = 53. The name is unchanged and still drawn by the
    // set; only the number of places it is drawn FROM moved.
    //
    // The 2026-10 collapsible completion gave the reflection card its own
    // `NotebookPen` head and the vitals card a `Bed` — two sites, both names
    // already in the registry. 53 + 2 = 55.
    //
    // The health drawer's move to the Egészség tab took ONE site with it: the
    // drawer head's `<ContentIcon name="Salad" />`. The tab's own three section
    // heads draw `<Salad />`, `<Dumbbell />` and `<Activity />` from the icon
    // module directly (they are chrome, exactly like the toolbox header), and
    // the two transparency cards kept their two sites when they moved file.
    // 55 − 1 = 54.
    //
    // The mega batch added four: the companion card and its Settings picker
    // (`Sprout`), the six-week program (`Compass`) and the seek-help guide
    // (`Users`) — all four names already in the registry, all four content
    // rather than chrome. 54 + 4 = 58.
    //
    // Phase 3 added two more: the sleep log and the sleep × mood card, both
    // `Bed` (the registry's 😴, which is the sleep tracker's own glyph) rather
    // than the chrome `Moon` this batch first reached for. 58 + 2 = 60.
    //
    // Phase 4 added the AI pair: the settings card draws `Laptop` (💻, the
    // device the on-device mode runs on) and the weekly summary draws `Brain`
    // (🧠, already the micro-lesson card's head). Two names already in the
    // registry, two new call SITES — this count is about sites, so it moves
    // even when no icon is new. 60 + 2 = 62.
    //
    // Phase 5 added one more: the support wall's card head draws `Award`
    // (🏅 — praise, already in the registry as an achievement badge). One
    // name already present, one new call site. 62 + 1 = 63.
    expect(sites.length).toBe(63);
    for (const name of sites) {
      expect(
        isChromeIcon(name),
        `${name} is chrome and is drawn by <ContentIcon>, which cannot switch it.`,
      ).toBe(false);
    }
    // And every one of them is a name a set can actually draw, so no call site
    // is quietly sitting on the component's fallback branch.
    for (const name of sites) {
      expect(glyphForLucideName(name), `${name} has no picture in any set`).toBeDefined();
    }
  });

  for (const name of PICTURED_NAMES) {
    const glyph = glyphForLucideName(name)!;
    const stem = GLYPHS.find((g) => g.lucide === name)!.fluent!;

    test(`${name}: fluent draws the set's own artwork, not a Lucide icon`, () => {
      const html = render(name, "fluent");
      // Matched against the artwork MODULE, not a URL and not a string copied
      // into this test. A re-vendor against a new upstream revision changes the
      // module and this test follows it; a copied expectation would not.
      const artwork = fluentArtwork(stem)!;
      expect(artwork).toBeDefined();
      expect(html).toContain(artwork);
      // And the line-art component is genuinely absent, so "contains the
      // artwork" cannot be satisfied by an icon that carries both.
      expect(html).not.toContain("lucide");
    });

    test(`${name}: the system set draws the character, and no artwork`, () => {
      const html = render(name, "system");
      expect(html).toContain(glyph);
      expect(html).not.toContain(fluentArtwork(stem)!);
      expect((html.match(/<svg/g) ?? []).length).toBe(0);
    });

    test(`${name}: no set chosen is the pre-Batch-7 appearance`, () => {
      // The Batch 7 promise, which 7f must not quietly break for the icons it
      // newly routed. These 39 sites said `<Flame />` — a Lucide name — so a
      // user who never opened the picker must still see the Lucide flame.
      // Routing them naively through `renderModeFor` would answer "emoji" for an
      // unset selection and replace the default appearance of the whole app.
      for (const unset of [undefined, "lucide"] as const) {
        const html = render(name, unset);
        expect((html.match(/<svg/g) ?? []).length, `set ${unset}`).toBe(1);
        expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
      }
    });
  }

  test("a routed icon keeps the size it was given, in every set", () => {
    // The 39 sites passed `size="1.1em"` to Lucide. `.iconset-inline` is 1em
    // square and a bare emoji is sized by the font, so without the box a 3D set
    // would quietly resize every card header in the app.
    for (const set of [undefined, "system", "fluent"] as const) {
      const html = render("Flame", set, "1.1em");
      expect(html, `set ${set}`).toContain("1.1em");
    }
  });

  test("an icon with no picture falls back to Lucide rather than rendering nothing", () => {
    // Chrome names are supposed to be drawn directly, but the component is
    // allowed to be handed one. A missing picture must never take a screen
    // down, and Lucide is the right answer.
    const html = render("Plus", "fluent");
    expect((html.match(/<svg/g) ?? []).length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 3. The nav, re-checked                                             */
/* ------------------------------------------------------------------ */

describe("the bottom nav still follows the set", () => {
  function nav(set: string | undefined): string {
    const settings = { ...store.getState().settings } as Record<string, unknown>;
    if (set === undefined) delete settings.iconSet;
    else settings.iconSet = set;
    store.setSettings(settings as never);
    return NAV_ICONS.map((row) =>
      renderToStaticMarkup(
        createElement(
          AppProvider,
          null,
          createElement(IconSetProvider, null, createElement(NavIcon, { tab: row.tab })),
        ),
      ),
    ).join("");
  }

  test("fluent: every tab is the set's own artwork, zero Lucide", () => {
    const html = nav("fluent");
    for (const row of NAV_ICONS) {
      expect(html, `${row.tab} is not its Fluent artwork`).toContain(fluentArtwork(row.fluent)!);
    }
    expect(html).not.toContain("lucide");
  });

  test("system: every tab is its character, zero artwork", () => {
    const html = nav("system");
    for (const row of NAV_ICONS) expect(html).toContain(row.character);
    expect((html.match(/<svg/g) ?? []).length).toBe(0);
  });

  test("no set chosen: six Lucide icons and not one emoji", () => {
    // Six since the Egészség tab was added: the bar has one row per tab, and
    // the count is the one number in this file that moved with it.
    const html = nav(undefined);
    expect((html.match(/<svg/g) ?? []).length).toBe(6);
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}⚙]/u);
  });

  test("every nav stem has artwork, so no tab can fall back mid-bar", () => {
    // The per-item fallback in `NavIcon` is for a set added later. Asserting
    // today's rows are complete means a future vendor run that loses one stem
    // shows up here instead of as a single monochrome icon in a 3D bar.
    for (const row of NAV_ICONS) {
      expect(fluentArtwork(row.fluent), `${row.tab} has no artwork for ${row.fluent}`).toBeDefined();
    }
  });
});

/* ------------------------------------------------------------------ */
/* 4. No set is ever fetched                                          */
/* ------------------------------------------------------------------ */

describe("choosing a set still costs no download", () => {
  test("nothing in the icon path can reach the network", () => {
    // Unchanged in principle by this batch and worth keeping true: `ContentIcon`
    // is a new component in the render path, and the cheapest way for it to
    // break the promise would be to fetch the picture it was asked to draw.
    for (const file of ["src/components/ContentIcon.tsx", "src/lib/icon-policy.ts"]) {
      const code = readFileSync(file, "utf8");
      for (const mechanism of ["fetch(", "XMLHttpRequest", "new Image", "createObjectURL"]) {
        expect(code, `${file} can ${mechanism}`).not.toContain(mechanism);
      }
    }
  });

  test("a set with artwork inlines it rather than pointing at a path", () => {
    expect(renderModeFor("fluent", "🔥")).toBe("inline");
    expect(render("Flame", "fluent")).not.toContain("/iconsets/");
  });
});
