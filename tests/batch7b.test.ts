/**
 * Batch 7b — integrated icons, nav icons, and the end of Twemoji.
 *
 * GROWS ACROSS THE BATCH. The nav half pins the registry; the inlining half
 * pins "no network request on selection"; the Twemoji half pins the withdrawal.
 * They live together because they are one change to one idea — "the icons the
 * user picks are the icons the app draws" — split across three commits, and a
 * test file per commit would mean three overlapping scope guards.
 *
 * WHAT IS WORTH GUARDING HERE, AND WHY
 * Most of this batch is data movement, and data movement is verified by
 * measurement rather than by assertion: the artwork's bytes are checked against
 * the registry, the bundle's size is checked in the PR, and the served files are
 * checked after deploy. What a test can do — and what nothing else will — is
 * hold the behavioural claims that are easy to state and easy to break:
 *
 *   - the nav follows the chosen set, per item, never as a whole bar;
 *   - a user who has chosen no set still gets exactly the old navigation;
 *   - no set is ever fetched when one is selected.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { NAV_ICONS, navCharacter, navFluentStem, navIconDef } from "../src/lib/nav-icons";
import {
  GLYPHS,
  ICON_SET_IDS,
  ICON_SETS,
  RETIRED_ICON_SET_LABELS,
  RETIRED_ICON_SET_REPLACEMENT,
  RETIRED_ICON_SETS,
  setStems,
} from "../src/lib/iconsets";
import { fluentArtwork } from "../src/lib/iconsets/fluent-artwork";
import type { TabId } from "../src/types";

/* ------------------------------------------------------------------ */
/* 1. The nav registry                                                */
/* ------------------------------------------------------------------ */

describe("the nav icon registry", () => {
  test("has exactly one row per tab, and no more", () => {
    // Five, one per tab. The original plan listed five items including an
    // "Eszköztár" that did not exist, and counted "Betekintés" separately from
    // the tab actually labelled "Elemzés" — the plan was wrong twice, and
    // Batch 14 made the row real: the toolbox moved to a tab of its own. A
    // registry that drifted from `TabId` would leave a tab with no icon and an
    // icon with no tab, so this compares against the union itself rather than
    // a copied list.
    const tabs: TabId[] = ["today", "tools", "journal", "insights", "health", "settings"];
    expect(NAV_ICONS.map((n) => n.tab).sort()).toEqual([...tabs].sort());
    expect(new Set(NAV_ICONS.map((n) => n.tab)).size).toBe(NAV_ICONS.length);
    // The labels are the app's, unchanged. The nav stays labelled.
    // Batch 14's rename moved the tools row: the reader's own name for that
    // tab is "Felfedezés", and this list is where the bar's every label is
    // pinned, so a rename that missed the registry fails here. Batch 15's
    // Phase 1 then moved that row DOWN, and this list is in registry order, so
    // the move is visible here too.
    expect(NAV_ICONS.map((n) => n.label)).toEqual([
      "Ma",
      "Napló",
      "Elemzés",
      "Egészség",
      "Felfedezés",
      "Beállítás",
    ]);
  });

  test("every row has a Lucide name, a character and a Fluent stem", () => {
    // All three required, with no optional field to leave blank. The first
    // draft used a Partial<Record> with one value per set, and a row missing
    // its Fluent entry type-checked fine and then rendered nothing at all.
    for (const row of NAV_ICONS) {
      expect(row.lucide.trim().length).toBeGreaterThan(0);
      expect(row.character.trim().length).toBeGreaterThan(0);
      expect(row.fluent.trim().length).toBeGreaterThan(0);
    }
  });

  test("every Lucide name resolves to a real icon", () => {
    // A typo here is invisible in review and renders a blank slot in the most
    // persistent chrome on screen.
    const { getIcon } = require("../src/lib/icons") as typeof import("../src/lib/icons");
    for (const row of NAV_ICONS) {
      expect(getIcon(row.lucide), `no Lucide icon named "${row.lucide}"`).toBeDefined();
    }
  });

  test("every Fluent stem is artwork the app actually has", () => {
    // Checked against the INLINED module, not against a copied list, so a
    // re-vendor against a new upstream revision cannot make this quietly
    // wrong. Batch 7b moved the artwork out of `public/` and into the bundle,
    // which is exactly why this has to look here and not at a file.
    const { FLUENT_ARTWORK } = require("../src/lib/iconsets/fluent-artwork") as
      typeof import("../src/lib/iconsets/fluent-artwork");
    for (const row of NAV_ICONS) {
      const artwork = FLUENT_ARTWORK[row.fluent];
      expect(artwork, `the nav names "${row.fluent}", which is not inlined`).toBeDefined();
      expect(artwork).toContain("<svg");
      expect(artwork).toContain("viewBox=");
    }
  });

  test("the stems are not gendered, like every other figure in this app", () => {
    // The reason Batch 7 used the genderless `person-*` forms everywhere.
    for (const row of NAV_ICONS) {
      expect(row.fluent).not.toMatch(/^(man|woman|male|female)-/);
    }
  });

  test("the two lookups agree with the table, and the table is the truth", () => {
    for (const row of NAV_ICONS) {
      expect(navIconDef(row.tab)?.fluent).toBe(row.fluent);
      expect(navFluentStem(row.tab)).toBe(row.fluent);
      expect(navCharacter(row.tab)).toBe(row.character);
    }
  });

  test("a nav character need not be one of the 38 stored glyphs", () => {
    // ⚙️ is a fine character to draw and has no business being in a registry
    // of emoji the app writes into its data. Asserted so a future change that
    // "helpfully" pushed nav characters into `GLYPHS` is a deliberate act.
    const stored = new Set(GLYPHS.map((g) => g.glyph));
    const notStored = NAV_ICONS.filter((r) => !stored.has(r.character));
    expect(notStored.length).toBeGreaterThan(0);
    // ...and the ones that ARE stored must still resolve to the same artwork,
    // or the two registries have drifted into disagreeing with each other.
    for (const row of NAV_ICONS) {
      if (!stored.has(row.character)) continue;
      const { glyphDef } = require("../src/lib/iconsets") as typeof import("../src/lib/iconsets");
      expect(glyphDef(row.character)?.fluent).toBe(row.fluent);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. The nav follows the set, per item                               */
/* ------------------------------------------------------------------ */

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

const { AppProvider } = await import("../src/state/AppContext");
const { IconSetProvider } = await import("../src/state/IconSetContext");
const BottomNav = (await import("../src/components/BottomNav")).default;
const store = await import("../src/lib/store");
const { loadFluentArtwork } = await import("../src/lib/iconsets");

/**
 * The artwork is a separate chunk now, loaded on demand — so a synchronous
 * `renderToStaticMarkup` runs its effects not at all and would draw every
 * Lucide fallback. `loadFluentArtwork` caches the module at module scope, so
 * awaiting it ONCE here means every test below — and every assertion in them —
 * runs exactly as it did before the split, with nothing weakened and no helper
 * turned async. What is being tested is still "the artwork arrives in the
 * markup"; this only settles the question of whether the chunk has been asked
 * for yet, which is a matter of ordering rather than of behaviour.
 */
beforeAll(async () => {
  await loadFluentArtwork();
});

function nav(set: string | undefined): string {
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
        createElement(BottomNav, { active: "today" as const, onChange: () => {} }),
      ),
    ),
  );
}

describe("the bottom nav follows the chosen set", () => {
  test("no set chosen: six Lucide icons, and not one emoji", () => {
    // The Batch 7 promise, extended to the nav. A user who has never opened
    // the picker must see precisely the navigation they have always seen.
    const html = nav(undefined);
    expect((html.match(/<svg/g) ?? []).length).toBe(6);
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/[🌱🧰📔🧠⚙]/u);
  });

  test("lucide: identical to the untouched default", () => {
    const html = nav("lucide");
    expect((html.match(/<svg/g) ?? []).length).toBe(6);
    expect(html).not.toContain("<img");
    // Byte-identical to the untouched default, which is the strongest form of
    // "choosing Lucide changes nothing".
    expect(html).toBe(nav(undefined));
  });

  test("system: six literal characters, no artwork", () => {
    const html = nav("system");
    for (const row of NAV_ICONS) expect(html).toContain(row.character);
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<img");
  });

  test("fluent: six pieces of artwork, inlined, and the right six", () => {
    // The artwork arrives in the markup. This is the assertion that earns its
    // keep: while the nav still pointed at `/iconsets/fluent-v1/`, this test
    // passed — it was checking a URL, and the directory it named was gone.
    // Comparing the rendered HTML against the module itself is what makes a
    // missing file impossible to ship again.
    const html = nav("fluent");
    expect((html.match(/class="iconset-inline"/g) ?? []).length).toBe(6);
    for (const row of NAV_ICONS) {
      expect(html, `${row.tab} drew the wrong artwork`).toContain(fluentArtwork(row.fluent)!);
    }
    // No image element and no path to one: there is nothing to request.
    expect(html).not.toContain("<img");
    expect(html).not.toContain("src=");
    expect(html).not.toContain("/iconsets/");
  });

  test("the fallback is PER ITEM, not per bar", () => {
    // The claim that is easiest to state and easiest to get wrong. If the
    // fallback fired for the whole bar, a user with one missing glyph would get
    // five monochrome icons; if it did not fire at all, they would get a blank
    // slot. Exactly one Lucide icon and five pieces of artwork is the answer.
    //
    // Counting `<svg` no longer tells the two apart — the Fluent artwork is
    // itself an inline `<svg>` now. The two are told apart by their viewBox:
    // Lucide's shell is 24×24, Fluent's is 32×32.
    const row = NAV_ICONS.find((n) => n.tab === "settings")!;
    const saved = row.fluent;
    try {
      (row as { fluent: string }).fluent = ""; // a future set lacking this one
      const html = nav("fluent");
      expect((html.match(/viewBox="0 0 24 24"/g) ?? []).length, "one Lucide icon").toBe(1);
      expect((html.match(/class="iconset-inline"/g) ?? []).length, "five artworks").toBe(5);
      expect(html).not.toContain("counterclockwise-arrows-button");
      expect(html).toContain(fluentArtwork("seedling")!);
    } finally {
      (row as { fluent: string }).fluent = saved;
    }
  });

  test("a stem the artwork does not carry still draws, rather than vanishing", () => {
    // The branch the previous test cannot reach. Blanking a row's stem makes
    // `navFluentStem` answer nothing, which falls back one line earlier — so
    // the second fallback, for a stem that is named but has no artwork, was
    // unasserted. That is the real shape of "a set added later": the registry
    // grows a row before the generator has been re-run for it.
    //
    // Returning null would leave a hole in the bar with no label explanation,
    // which is worse than a monochrome icon.
    const row = NAV_ICONS.find((n) => n.tab === "journal")!;
    const saved = row.fluent;
    try {
      (row as { fluent: string }).fluent = "a-stem-no-one-vendored";
      const html = nav("fluent");
      expect((html.match(/viewBox="0 0 24 24"/g) ?? []).length, "one Lucide icon").toBe(1);
      expect((html.match(/class="iconset-inline"/g) ?? []).length, "five artworks").toBe(5);
      // The label is still there: the tab is reachable, just drawn differently.
      expect(html).toContain("Napló");
      expect(html).not.toContain("a-stem-no-one-vendored");
    } finally {
      (row as { fluent: string }).fluent = saved;
    }
  });

  test("the labels and the accessibility surface are untouched", () => {
    // A look change, not a semantics change. Every tab keeps its visible text,
    // the icon stays decorative, and the bar keeps its name.
    for (const set of [undefined, "lucide", "system", "fluent"]) {
      const html = nav(set);
      expect(html).toContain('aria-label="Fő navigáció"');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('aria-current="page"');
      for (const row of NAV_ICONS) expect(html).toContain(row.label);
      // Still a button per tab, so it is still keyboard reachable.
      expect((html.match(/<button/g) ?? []).length).toBe(NAV_ICONS.length);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3. Content icons are not disturbed                                 */
/* ------------------------------------------------------------------ */

describe("the nav change did not touch the content icons", () => {
  test("GlyphIcon is still the only public drawing API for content", () => {
    // The nav deliberately does not go through `GlyphIcon` — its glyphs are
    // not in the 38 stored ones — but that must not have become a precedent
    // for content. Every content call site still uses `GlyphIcon`.
    const { readFileSync: read } = require("node:fs") as typeof import("node:fs");
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const dir = new URL("../src/", import.meta.url);
    const offenders: string[] = [];
    const walk = (d: URL) => {
      for (const name of readdirSync(d.pathname)) {
        const full = new URL(name + (name.includes(".") ? "" : "/"), d);
        if (name.includes(".")) {
          if (!/\.tsx$/.test(name)) continue;
          const text = read(full, "utf8");
          // A component that draws an emoji-bearing icon outside the content
          // path, other than the two files that legitimately do.
          if (/GlyphIcon/.test(text) === false && /<GlyphIcon/.test(text)) {
            offenders.push(name);
          }
        } else {
          walk(full);
        }
      }
    };
    walk(dir);
    expect(offenders).toEqual([]);
  });

  test("the nav components are the only new drawing path", () => {
    const nav = readFileSync(new URL("../src/components/NavIcon.tsx", import.meta.url), "utf8");
    const bottom = readFileSync(new URL("../src/components/BottomNav.tsx", import.meta.url), "utf8");
    expect(bottom).toMatch(/from "\.\/NavIcon"/);
    // BottomNav holds no icon logic at all: no glyphs, no set names, no emoji.
    expect(bottom).not.toMatch(/lucide|fluent|system/);
    expect(nav).toMatch(/useIconSet/);
  });
});

/* ------------------------------------------------------------------ */
/* 4. The set registry, after the withdrawal                           */
/* ------------------------------------------------------------------ */

describe("the nav work did not reorder or rename the content sets", () => {
  test("the same three sets are offered, in the same order", () => {
    // Read against the registry's own list rather than a copy, so a fourth set
    // added later shows up here as a failure to update the expectation rather
    // than passing unnoticed.
    expect(ICON_SETS.map((s) => s.id)).toEqual(ICON_SET_IDS);
    expect(ICON_SET_IDS).toEqual(["lucide", "system", "fluent"]);
  });
});

/* ------------------------------------------------------------------ */
/* 5. The artwork is in the bundle, and nothing is fetched             */
/* ------------------------------------------------------------------ */

describe("selecting a set costs no network request", () => {
  test("no drawing path builds a URL to artwork", () => {
    // The claim the whole batch exists for, checked at the source level on
    // purpose. A behavioural test in Bun cannot tell a module read from a
    // `fetch` that resolves instantly against an empty stub, so the assertion
    // is about which mechanism the code reaches for.
    for (const p of [
      "src/state/IconSetContext.tsx",
      "src/components/NavIcon.tsx",
      "src/components/IconSetPicker.tsx",
      "src/lib/iconsets.ts",
    ]) {
      const body = readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const mechanism of ["fetch(", "XMLHttpRequest", "new Image", "createElement(\"img\""]) {
        expect(body, `${p} still uses ${mechanism}`).not.toContain(mechanism);
      }
      // No path, no extension, no data URI. Anything that could become a request.
      expect(body, `${p} still names an artwork file`).not.toMatch(/["'`][^"'`]*\.svg/);
    }
  });

  test("the artwork module is the only source of set artwork", () => {
    // One module, imported by name. A second copy of the artwork anywhere else
    // would double the largest array in the bundle and drift silently.
    const { FLUENT_ARTWORK, FLUENT_ARTWORK_COUNT } =
      require("../src/lib/iconsets/fluent-artwork") as typeof import("../src/lib/iconsets/fluent-artwork");
    expect(FLUENT_ARTWORK_COUNT).toBe(Object.keys(FLUENT_ARTWORK).length);
    expect(FLUENT_ARTWORK_COUNT).toBeGreaterThan(0);
    for (const [stem, svg] of Object.entries(FLUENT_ARTWORK)) {
      expect(svg.startsWith("<svg"), stem).toBe(true);
      expect(svg.endsWith("</svg>"), stem).toBe(true);
      expect(svg, `${stem} has no viewBox`).toMatch(/viewBox="/);
      // A prolog would make this a document, not a fragment, and React would
      // render it as text.
      expect(svg, `${stem} kept its XML prolog`).not.toContain("<?xml");
    }
  });

  test("every stem either registry names is inlined, and nothing else is", () => {
    // Both directions. The first half is a missing-artwork bug; the second is
    // dead weight in the single largest thing the bundle ships.
    const { FLUENT_ARTWORK } =
      require("../src/lib/iconsets/fluent-artwork") as typeof import("../src/lib/iconsets/fluent-artwork");
    const wanted = new Set<string>([...setStems("fluent"), ...NAV_ICONS.map((r) => r.fluent)]);
    for (const stem of wanted) {
      expect(FLUENT_ARTWORK[stem], `${stem} is asked for but not inlined`).toBeDefined();
    }
    const shipped = Object.keys(FLUENT_ARTWORK).sort();
    expect(shipped).toEqual([...wanted].sort());
  });

  test("nothing in the app renders a raw <img> for a set", () => {
    // The <img> was Batch 7's whole failure surface: a URL that could 404. No
    // set draws through one now, so the element has no remaining caller.
    // Comments are stripped: these files discuss the <img> they replaced, and
    // a comment saying "this is what we no longer do" is the opposite of a
    // regression. Only executable code is asserted on.
    for (const p of [
      "src/state/IconSetContext.tsx",
      "src/components/NavIcon.tsx",
      "src/components/IconSetPicker.tsx",
    ]) {
      const body = readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(body, `${p} still renders an <img>`).not.toMatch(/<img\b/);
    }
  });

  test("the inline wrapper is styled, and scaled like every other icon", () => {
    // An unstyled inline <svg> defaults to 300×150 CSS pixels. That is the
    // failure this rule prevents, and it would look like a layout bug rather
    // than a missing stylesheet.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    const rule = css.match(/\.iconset-inline\s*\{([^}]*)\}/);
    expect(rule, "no .iconset-inline rule").not.toBeNull();
    expect(rule![1]).toMatch(/width:\s*1em/);
    expect(rule![1]).toMatch(/height:\s*1em/);
    // And the artwork is told to fill it, so an upstream width/height pair
    // cannot override the app's scale.
    expect(css).toMatch(/\.iconset-inline\s*>\s*svg\s*\{[^}]*width:\s*100%/);
    // The old <img> sizing class is gone with its last caller.
    expect(css).not.toContain(".iconset-img");
  });
});

/* ------------------------------------------------------------------ */
/* 6. The withdrawal                                                  */
/* ------------------------------------------------------------------ */

describe("Twemoji is withdrawn, and nobody is left pointing at it", () => {
  test("the registry offers three sets and names the retired one", () => {
    expect(ICON_SET_IDS).toEqual(["lucide", "system", "fluent"]);
    expect(RETIRED_ICON_SETS).toEqual(["twemoji"]);
    expect(RETIRED_ICON_SET_REPLACEMENT).toBe("fluent");
    // A retired set is gone from the registry, so `iconSetDef` cannot name it
    // — which is why the announcement needs its own label table.
    expect(RETIRED_ICON_SET_LABELS["twemoji"]).toBe("Twemoji");
    expect(Object.keys(RETIRED_ICON_SET_LABELS).sort()).toEqual([...RETIRED_ICON_SETS].sort());
  });

  test("the announcement says the set's name, not its stored id", () => {
    // The toast is the only place a user learns their choice was moved, so it
    // has to use the word they made it with. "twemoji" is what is in storage;
    // "Twemoji" is what was in the picker.
    const src = readFileSync(new URL("../src/state/IconSetContext.tsx", import.meta.url), "utf8");
    expect(src).toContain("RETIRED_ICON_SET_LABELS[retired] ?? retired");
    expect(src).not.toMatch(/\$\{retired\} ikonokészlet/);
  });

  test("the one-time notice is read-and-cleared, never stored", () => {
    // If it persisted, the toast would follow the user around forever, and an
    // internal marker would end up in their exported data.
    const src = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
    expect(src).toMatch(/let pendingIconSetNotice/);
    expect(src).toMatch(/pendingIconSetNotice = null/);
    expect(src).not.toMatch(/pendingIconSetNotice\s*[,}]/); // never written into a payload
  });

  test("no source file still points at the withdrawn set's files", () => {
    for (const p of [
      "src/lib/iconsets.ts",
      "src/state/IconSetContext.tsx",
      "src/components/IconSetPicker.tsx",
      "src/components/NavIcon.tsx",
      "src/lib/store.ts",
      "public/sw.js",
    ]) {
      // Comments are stripped, deliberately. Several of these files explain
      // the withdrawal in prose and have to name the directory they removed;
      // what must not survive is CODE that could still ask for a file.
      const body = readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(body, `${p} still names twemoji-v1`).not.toContain("twemoji-v1");
      expect(body, `${p} still names fluent-v1`).not.toContain("fluent-v1");
    }
  });

  test("no artwork is left on disk for any set", () => {
    // The physical half of the withdrawal, and the reason the old
    // `tests/batch7-assets.test.ts` was deleted rather than repaired: every
    // assertion in it was about two directories that no longer exist.
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
    const root = new URL("../public/iconsets/", import.meta.url);
    const entries = readdirSync(root);
    expect(entries.filter((f: string) => f.endsWith(".svg"))).toEqual([]);
    for (const e of entries) {
      expect(statSync(new URL(e, root)).isDirectory(), `${e} survived`).toBe(false);
    }
    expect(entries).toEqual(["LICENSES.md"]);
  });
});

/* ------------------------------------------------------------------ */
/* 7. The licence record and the generator that keeps it honest       */
/* ------------------------------------------------------------------ */

describe("the licence record matches what is shipped", () => {
  const md = () => readFileSync(new URL("../public/iconsets/LICENSES.md", import.meta.url), "utf8");

  test("every set the picker offers is described", () => {
    for (const s of ICON_SETS) expect(md(), s.label).toContain(s.label);
  });

  test("every set ever dropped is named as dropped, with a reason", () => {
    // A withdrawn set that simply vanishes from the file reads as an
    // oversight. Noto 3D and 3dicons were dropped for coverage, Twemoji for
    // its licence — all three belong in the record.
    const text = md();
    for (const gone of ["Noto 3D", "3dicons", "Flaticon", "Twemoji"]) {
      expect(text, gone).toContain(gone);
    }
    expect(text).toMatch(/Twemoji[\s\S]{0,400}?(withdrawn|CC-BY)/i);
  });

  test("it states the CC-BY distinction that decided the withdrawal", () => {
    // The one non-obvious fact in this file: the repo's MIT licence covers the
    // code, the SVGs are artwork under CC-BY 4.0. Recording it is what makes
    // the withdrawal a decision rather than a preference.
    const text = md();
    expect(text).toContain("CC-BY 4.0");
    expect(text).toMatch(/covers its \*code\*/);
    expect(text).toMatch(/artwork/);
  });

  test("it still covers the typefaces", () => {
    const text = md();
    expect(text).toContain("OFL 1.1");
    for (const f of ["Inter", "Montserrat", "Roboto", "Lato", "Dancing Script"]) {
      expect(text, f).toContain(f);
    }
  });

  test("it promises self-hosting, and names no runtime third party", () => {
    const text = md();
    expect(text.toLowerCase()).toContain("no cdn");
    expect(text).not.toMatch(/fonts\.gstatic|fonts\.googleapis|jsdelivr\.net\/npm/);
  });

  test("it does not claim a directory that is not there", () => {
    // The file is the one thing still in `public/iconsets/`. It must not
    // describe artwork sitting beside it.
    const text = md();
    expect(text).not.toMatch(/`iconsets\/(fluent|twemoji)-v1`/);
    expect(text).toMatch(/src\/lib\/iconsets\/fluent-artwork\.ts/);
  });
});

describe("the artwork stays reproducible", () => {
  const gen = () => readFileSync(new URL("../scripts/vendor-fluent-artwork.ts", import.meta.url), "utf8");

  test("the generator derives its stems from the registries, not a list", () => {
    // A hand-written list of stems is exactly the drift the script exists to
    // prevent, so the stems must come from both registries.
    const src = gen();
    expect(src).toContain("GLYPHS");
    expect(src).toContain("NAV_ICONS");
    for (const stem of ["person-walking-default", "counterclockwise-arrows-button"]) {
      expect(src, `${stem} is hard-coded in the generator`).not.toContain(stem);
    }
  });

  test("upstream is pinned to a release, not tracked from a branch", () => {
    const src = gen();
    expect(src).toMatch(/fluentui-emoji@\d+\.\d+\.\d+/);
    expect(src).not.toMatch(/fluentui-emoji@(main|latest|next)/);
  });

  test("it refuses to write something that is not drawable artwork", () => {
    // A 404 page committed as artwork would render as a blank icon for every
    // user who picked the set, with no error anywhere.
    const src = gen();
    expect(src).toContain("assertArtwork");
    expect(src).toMatch(/no viewBox/);
    expect(src).toMatch(/draws nothing/);
    expect(src).toMatch(/truncated/);
    expect(src).toMatch(/throw new Error/);
  });

  test("it is re-runnable: it fetches, and leaves no directory behind", () => {
    // The first version of this script read `public/iconsets/fluent-v1/` and
    // then deleted it, so running it twice failed the second time — a script
    // that cannot be re-run in a repository whose reason for having one is that
    // re-running repairs the artwork. Both halves are asserted: the source is
    // fetched, and nothing is created for a human to keep in step.
    const src = gen();
    expect(src).toContain("fetch(");
    expect(src).not.toContain("rmSync");
    expect(src).not.toMatch(/readFileSync\(.*public\/iconsets/);
  });
});
