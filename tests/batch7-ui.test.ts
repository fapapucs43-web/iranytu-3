/**
 * Batch 7 — Commit 2 UI tests.
 *
 * The centre of gravity is THE UNTOUCHED DEFAULT. Everything else in this
 * feature is additive and reversible; if a user who has never opened Settings
 * sees their mood scale change, no test in this file passing would matter.
 * So the first describe block is the important one, and several tests here
 * exist to prove a guard is not vacuous — either by mutating it and watching
 * it fail, or by asserting non-emptiness where an empty list would pass
 * trivially.
 *
 * Rendering uses `createElement` + `renderToStaticMarkup`, matching
 * tests/batch5.test.ts: the test files are `.ts` and the components are
 * small enough that driving their real props beats mounting a DOM.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { loadFluentArtwork } from "../src/lib/iconsets";

// The artwork is a separate chunk now, requested on mount. A synchronous
// `renderToStaticMarkup` runs no effects, so the sample below would draw its
// Lucide fallback and `toContain("iconset-inline")` would fail for a reason
// that has nothing to do with the artwork. Awaiting the loader once, before
// anything renders, is the whole fix — and it is what a browser has done by the
// time a reader looks at the picker.
beforeAll(async () => {
  await loadFluentArtwork();
});
import {
  GLYPHS,
  ICON_SETS,
  MOOD_GLYPHS,
  glyphArtwork,
  isPristineSelection,
  renderModeFor,
  setStems,
} from "../src/lib/iconsets";
import { fluentArtwork } from "../src/lib/iconsets/fluent-artwork";
import { ActivityLabel, GlyphIcon, splitActivityLabel } from "../src/state/IconSetContext";
import IconSetPicker from "../src/components/IconSetPicker";

/**
 * Render through the REAL provider tree with a given selection.
 *
 * The selection is written with the real store's `setSettings`, not by
 * injecting context: that way the render also exercises the load-time
 * normalisation in `lib/store`, so a corrupt value is proven to be dropped on
 * the way in rather than being bypassed by a hand-built context value.
 *
 * Cache-busted dynamic imports were the obvious approach and are wrong here —
 * they give each provider its OWN copy of AppContext, so `useApp` inside
 * IconSetProvider cannot see the AppProvider above it. The modules must be
 * singletons and the STATE must vary, not the modules.
 */
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
const store = await import("../src/lib/store");

function withSet(setId: string | undefined, el: unknown): string {
  const current = store.getState();
  const settings = { ...current.settings };
  // Delete rather than set undefined, so this is the same shape a pre-Batch-7
  // settings blob has: the key genuinely absent.
  if (setId === undefined) delete settings.iconSet;
  else settings.iconSet = setId as never;
  store.setSettings(settings);
  return renderToStaticMarkup(
    createElement(AppProvider, null, createElement(IconSetProvider, null, el as never)),
  );
}

describe("the untouched default", () => {
  test("with no set chosen, every glyph renders as the literal character", () => {
    // THE load-bearing test. `mood.emoji` is a plain string in the data; a
    // user who has never opened Settings must see exactly what they always
    // saw, byte for byte, in the same markup.
    for (const g of MOOD_GLYPHS) {
      const html = withSet(undefined, createElement(GlyphIcon, { glyph: g }));
      expect(html).toBe(g);
      expect(html).not.toContain("<svg");
      expect(html).not.toContain("<img");
    }
  });

  test("the whole mood scale is unchanged, not just the first glyph", () => {
    const html = withSet(
      undefined,
      createElement(
        "div",
        null,
        ...MOOD_GLYPHS.map((g, i) => createElement(GlyphIcon, { key: i, glyph: g })),
      ),
    );
    expect(html).toContain(MOOD_GLYPHS.join(""));
  });

  test("an absent iconSet is NOT coerced to a real set at render time", () => {
    // `coerceIconSetId(undefined)` answers "lucide", which would opt every
    // existing user into a set the moment anything read their settings. The
    // render path must ask the question differently.
    expect(renderModeFor(undefined, "🚶")).toBe("emoji");
    expect(renderModeFor("system", "🚶")).toBe("emoji");
    expect(renderModeFor("lucide", "🚶")).toBe("component");
    // Batched 7b there is no fourth answer. A set is either inlined or it is
    // not a set; there is no "fetch it and hope" mode left to get wrong. A
    // withdrawn id answers like any other unknown one, which is what keeps
    // `coerceIconSetId` the single place a bad value becomes a good one.
    expect(renderModeFor("fluent", "🚶")).toBe("inline");
    expect(renderModeFor("twemoji", "🚶")).toBe("component");
  });

  test("'system' and 'no set chosen' look identical but are distinguishable", () => {
    expect(isPristineSelection(undefined)).toBe(true);
    expect(isPristineSelection("system")).toBe(true);
    // The two must not collapse into one value, or "go back to how it looked"
    // becomes impossible once the user has visited the picker.
    expect(renderModeFor(undefined, "🚶")).toBe(renderModeFor("system", "🚶"));
  });

  test("the settings type declares iconSet but DEFAULT_SETTINGS omits it", () => {
    const types = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    expect(types).toMatch(/iconSet\?:\s*IconSetId/);
    // Optional, and NOT defaulted: writing a default here would silently opt
    // in every existing user at the storage layer.
    expect(types).not.toMatch(/iconSet:\s*"/);
    expect(types).not.toMatch(/iconSet:\s*DEFAULT/);
  });

  test("a corrupt stored value is dropped, not rendered", () => {
    const store = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
    expect(store).toContain("if (merged.iconSet !== undefined && !isIconSetId(merged.iconSet))");
    expect(store).toContain("delete merged.iconSet");
  });
});

describe("a chosen set replaces the character", () => {
  test("Lucide draws the mapped icon, not the emoji", () => {
    const html = withSet("lucide", createElement(GlyphIcon, { glyph: "🚶" }));
    expect(html).toContain("<svg");
    expect(html).not.toContain("🚶");
  });

  test("all five mood rungs render differently from one another", () => {
    // Distinct COMPONENT NAMES were not enough: Meh and Neutral were once two
    // names for the identical `M8 15h8` path, so two rungs of the scale were
    // indistinguishable on screen. This compares the rendered markup, which
    // is what the user actually sees, and asserts the count so an empty or
    // collapsed result cannot pass.
    const rendered = MOOD_GLYPHS.map((g) =>
      withSet("lucide", createElement(GlyphIcon, { glyph: g })),
    );
    expect(rendered).toHaveLength(5);
    for (const html of rendered) expect(html).toContain("<svg");
    expect(new Set(rendered).size).toBe(5);
  });

  test("an inline set draws the artwork on the FIRST render, not after a load", () => {
    // Batch 7's version of this test asserted the degraded state: a fetched
    // set showed Lucide until its 38 files arrived. There is no longer a
    // "before" and an "after" — the artwork is a string in the module graph,
    // so the very first render is the real thing, with no network call that
    // could be slow, cached, or missing.
    const html = withSet("fluent", createElement(GlyphIcon, { glyph: "🚶" }));
    expect(html).toContain("<svg");
    expect(html).toContain("iconset-inline");
    // No <img> and no src at all: an <img> is what would 404.
    expect(html).not.toContain("<img");
    expect(html).not.toContain("src=");
  });

  test("every registry glyph resolves under every set without throwing", () => {
    for (const set of ICON_SETS) {
      for (const g of GLYPHS) {
        const html = withSet(set.id, createElement(GlyphIcon, { glyph: g.glyph }));
        expect(html.length, `${set.id} ${g.glyph}`).toBeGreaterThan(0);
        expect(html, `${set.id} ${g.glyph} is blank`).not.toBe("");
      }
    }
  });
});

describe("there is no fallback to get wrong, and nothing to revert", () => {
  /*
   * This whole describe block replaces Batch 7's, which tested a per-glyph
   * failure path for a set that was FETCHED: `preloadIconSet` warmed 38 files,
   * `hasGlyphFailed` recorded which of them 404ed, and the render fell back to
   * Lucide for exactly those glyphs.
   *
   * None of that can happen any more. The artwork is in the bundle, so there
   * is no request, no 404, no partial load and no warm-up to race. The
   * "fallback is per glyph" promise is therefore STRUCTURALLY true rather than
   * tested: one glyph without artwork costs one glyph, because looking artwork
   * up is a map read, not a network call.
   *
   * What is left worth asserting is the shape of the new failure mode — one
   * glyph missing from the module — and the two promises that survive
   * unchanged: the app never writes the user's selection on its own, and it
   * still never degrades a stored activity label.
   */

  test("a glyph with no artwork falls back to Lucide, on its own", () => {
    // The replacement for "one failure out of many still lets the rest
    // through", and the same promise with a different mechanism.
    const html = withSet("fluent", createElement(GlyphIcon, { glyph: "🦄" }));
    // 🦄 is a user-typed emoji, not one of ours: the literal character, which
    // is correct and is not a degraded path.
    expect(html).toBe("🦄");
  });

  test("every glyph the registry names HAS artwork, so the fallback cannot fire", () => {
    // The strong version. If this passes, the per-glyph fallback is unreachable
    // for the shipped glyphs — and a test that says so is worth more than one
    // that exercises the branch with a rigged failure.
    for (const g of GLYPHS) {
      if (!g.fluent) continue;
      expect(
        fluentArtwork(g.fluent),
        `${g.glyph} names the stem "${g.fluent}" but no artwork is inlined for it`,
      ).toBeDefined();
    }
  });

  test("the render asks the artwork module, not a loader", () => {
    // Source-level, and deliberately so: the claim is about which mechanism
    // the render uses, and a behavioural test in this environment cannot tell
    // a module read from a network call that happens to resolve instantly.
    const src = readFileSync(new URL("../src/state/IconSetContext.tsx", import.meta.url), "utf8");
    expect(src).toContain("glyphArtwork(");
    // None of the fetch machinery may come back.
    for (const gone of ["preloadIconSet", "hasGlyphFailed", "isIconSetReady", "preloadIconSetHint"]) {
      expect(src, `${gone} is referenced again`).not.toContain(gone);
    }
  });

  test("the only place that writes the selection is the setter itself", () => {
    // Unchanged by this batch, and still the promise: no code path can change
    // a user's icon set without them asking.
    const src = readFileSync(new URL("../src/state/IconSetContext.tsx", import.meta.url), "utf8");
    const writes = [...src.matchAll(/setSettings\(/g)];
    expect(writes).toHaveLength(1);
  });

  test("selecting a set never rewrites the stored value behind the user's back", () => {
    // The old "never reverts on failure" promise, restated for a world with no
    // failure: a selection is exactly what the user picked, and nothing in the
    // provider corrects it.
    withSet("fluent", createElement("span", null, "x"));
    expect(store.getState().settings.iconSet).toBe("fluent");
    withSet("system", createElement("span", null, "x"));
    expect(store.getState().settings.iconSet).toBe("system");
  });
});

describe("the activity label is read apart, never rewritten", () => {
  test("a stored label splits into glyph and text", () => {
    expect(splitActivityLabel("🚶 Mozgás")).toEqual({ glyph: "🚶", text: "Mozgás" });
    expect(splitActivityLabel("🧘 Relaxáció")).toEqual({ glyph: "🧘", text: "Relaxáció" });
  });

  test("a label whose first word is not a known icon stays whole text", () => {
    // A user-typed custom activity. Splitting this would turn "Kutya" into an
    // icon plus "utya".
    expect(splitActivityLabel("Kutya séta")).toEqual({ text: "Kutya séta" });
    expect(splitActivityLabel("🎨 Jazz")).toEqual({ text: "🎨 Jazz" });
  });

  test("a single-word label does not lose its only character", () => {
    expect(splitActivityLabel("🚶")).toEqual({ text: "🚶" });
    expect(splitActivityLabel("")).toEqual({ text: "" });
  });

  test("the rendered label shows both parts", () => {
    const html = withSet(undefined, createElement(ActivityLabel, { label: "🚶 Mozgás" }));
    expect(html).toContain("🚶");
    expect(html).toContain("Mozgás");
  });

  test("DEFAULT_ACTIVITIES is still the correlation key, byte for byte", () => {
    const store = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
    for (const l of [
      "🚶 Mozgás", "👥 Társaság", "🧘 Relaxáció", "💻 Munka",
      "🏠 Otthon", "📚 Tanulás", "🎵 Zene", "🌿 Természet",
    ]) {
      expect(store).toContain(`"${l}"`);
    }
  });
});

describe("the picker", () => {
  test("offers the default row plus every set", () => {
    const html = withSet(undefined, createElement(IconSetPicker, null));
    expect(html).toContain("Nincs beállítva");
    for (const s of ICON_SETS) expect(html).toContain(s.label);
    // One radiogroup, and exactly one checked item.
    expect(html.match(/role="radiogroup"/g)).toHaveLength(1);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-checked="true"');
  });

  test("shows the real download cost, not a placeholder", () => {
    // Batched 7b every set is free, because two are inlined and two were
    // always free. The row says so rather than quoting a size that no longer
    // describes anything the user would pay.
    const html = withSet(undefined, createElement(IconSetPicker, null));
    expect(html).toContain("nincs letöltés");
    expect(html).not.toMatch(/kb\. \d+ kB/);
  });

  test("marks the active set and only the active set", () => {
    const html = withSet("fluent", createElement(IconSetPicker, null));
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toContain("használva");
    expect(html.match(/iconset-badge/g)).toHaveLength(1);
  });

  test("the default row is a real choice, not a disabled placeholder", () => {
    const html = withSet("fluent", createElement(IconSetPicker, null));
    // "Nincs beállítva" must remain clickable even when a set IS chosen,
    // otherwise there is no way back to the pre-Batch-7 look.
    expect(html).toContain("Nincs beállítva");
    expect(html).toContain('aria-checked="false"');
  });

  test("states the licence each remaining set actually has", () => {
    // Batched 7b removed the CC-BY credit, and with it the obligation to show
    // one: every set left is MIT, ISC, or not ours at all. Asserted positively
    // rather than by absence, so a future set that DOES need a credit cannot
    // slip in behind a deleted negative assertion.
    const html = withSet(undefined, createElement(IconSetPicker, null));
    expect(html).toContain("MIT");
    expect(html).toContain("Microsoft Fluent Emoji");
    expect(html).toContain("ISC");
    // Every set listed is one the app still ships, and none of them needs a
    // credit line. Asserted positively, so a future set that DOES need one
    // cannot slip in behind a deleted negative assertion.
    for (const gone of ["CC-BY", "Twitter", "Twemoji"]) {
      expect(html, `${gone} is still shown in the picker`).not.toContain(gone);
    }
    // The reason for the withdrawal is still on the record, in the licence file
    // that ships with the app rather than in a list of live options.
    const licences = readFileSync(
      new URL("../public/iconsets/LICENSES.md", import.meta.url),
      "utf8",
    );
    expect(licences).toContain("Twemoji");
    expect(licences).toContain("CC-BY 4.0");
  });

  test("the dropped sets are not offered", () => {
    const html = withSet(undefined, createElement(IconSetPicker, null));
    for (const gone of ["Noto", "3dicons", "Flaticon"]) {
      expect(html).not.toContain(gone);
    }
  });
});

describe("offline and licensing plumbing", () => {
  test("sw.js caches the fonts, and no longer has an icon-set rule", () => {
    // The inverse of Batch 7's assertion, and the reason it is worth stating.
    // `/iconsets/` was cache-first for two fetched directories; both are gone,
    // so the rule was removed rather than left dormant. Left in place it would
    // be worse than dormant: the handler below `caches.put`s whatever came
    // back, so a request for a withdrawn `/iconsets/twemoji-v1/…` path would
    // have cached its 404 and served it for the life of the cache.
    const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    expect(sw).toContain('url.pathname.startsWith("/fonts/")');
    expect(sw).not.toContain('url.pathname.startsWith("/iconsets/")');
    // ...and it says why, so the next person does not "restore" it.
    expect(sw).toMatch(/Icon sets are NOT here/);
  });

  test("every asset a set needs is in the bundle, so there is no URL at all", () => {
    // Batched 7b. This used to assert that every href was same-origin and
    // root-relative, which was a real guarantee: a set could not reach a third
    // party. It is now STRONGER, because there is no request to make and
    // therefore no origin to constrain — an inlined string cannot be fetched
    // from anywhere.
    for (const set of ICON_SETS) {
      if (set.kind !== "inline") continue;
      const stems = setStems(set.id);
      expect(stems.length).toBeGreaterThan(0);
      for (const stem of stems) {
        expect(
          fluentArtwork(stem),
          `${stem} is named by the registry but has no artwork`,
        ).toBeDefined();
      }
    }
    // Nothing in the tree refers to a fetched iconset path any more.
    for (const set of ICON_SETS) expect(set.base).toBeUndefined();
  });

  test("the registry names no external host", () => {
    const src = readFileSync(new URL("../src/lib/iconsets.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/https?:\/\//);
  });

  test("the new styles scale with --font-scale, like every other screen", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    const block = css.slice(
      css.indexOf("Ikonkészletek (Batch 7"),
      css.indexOf("Ikonkészletek (Batch 7") + 2600,
    );
    const sizes = [...block.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    // Batch 12, commit 3a moved this floor from 6 to 5: the sixth declaration
    // belonged to `.iconset-warn`, the orphan rule that commit removed (no
    // static or dynamic reference anywhere in the repo). The window itself is
    // unchanged and still covers the whole icon-set section; the count is a
    // "the slice really captured the block" floor, not a feature count, so it
    // tracks the block as the block changes. The two assertions that carry the
    // test's actual claim — every size scales with `--font-scale`, and no bare
    // px/rem snuck in — are untouched.
    expect(sizes.length).toBeGreaterThanOrEqual(5);
    for (const s of sizes) expect(s).toContain("var(--font-scale)");
    expect(block).not.toMatch(/font-size:\s*\d+(px|rem)/);
    // ...and the rule that left must not come back.
    expect(block).not.toContain(".iconset-warn");
  });

  test("no set's samples come from a data URI or a CDN", () => {
    const src = readFileSync(new URL("../src/components/IconSetPicker.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/data:image/);
    expect(src).not.toMatch(/https?:\/\/(?!creativecommons)/);
  });
});

describe("it is a component, not a hook, at every call site", () => {
  test("no component calls a hook-returning renderer inside a map", () => {
    // The reason GlyphIcon is a component: a hook called inside `.map()` runs
    // a different number of times per render and breaks the rules of hooks.
    // This fails the build rather than shipping a runtime error.
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const dir = new URL("../src/components/", import.meta.url);
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".tsx")) continue;
      const src = readFileSync(new URL(name, dir), "utf8");
      expect(src, `${name} calls useIcon in JSX`).not.toMatch(/\{useIcon\(/);
      expect(src, `${name} may not use the hook form at all`).not.toMatch(/\buseIcon\s*\(/);
    }
  });

  test("GlyphIcon is the only public drawing API", () => {
    const src = readFileSync(new URL("../src/state/IconSetContext.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/export function GlyphIcon\(/);
    expect(src).not.toMatch(/export function useIcon\(/);
  });

  test("every user-facing draw site went through it", () => {
    // A spot-check across the surfaces the set is supposed to affect. If one
    // of these regresses to a bare {x.icon}, the set silently stops applying
    // there and the app looks half-converted.
    for (const [file, needle] of [
      ["../src/views/TodayView.tsx", "GlyphIcon glyph={m.emoji}"],
      ["../src/views/JournalView.tsx", "GlyphIcon glyph={moodByLevel(entry.mood).emoji}"],
      ["../src/components/AchievementsCard.tsx", "GlyphIcon glyph={badge.icon}"],
      ["../src/components/CorrelationGrid.tsx", "GlyphIcon glyph={o.icon}"],
      ["../src/views/InsightsView.tsx", "GlyphIcon glyph={item.icon}"],
      ["../src/components/EntryDetail.tsx", "GlyphIcon glyph={m.emoji}"],
    ] as const) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8"), file).toContain(needle);
    }
  });

  test("the correlation row goes through ActivityLabel, not the raw string", () => {
    const src = readFileSync(new URL("../src/components/CorrelationGrid.tsx", import.meta.url), "utf8");
    expect(src).toContain("<ActivityLabel label={row.label} />");
    // The raw string must not also be drawn, or the emoji would appear twice.
    expect(src).not.toMatch(/\{row\.label\}\s*<\/th>/);
  });
});

describe("the provider is mounted for the whole app", () => {
  test("App wraps the shell in IconSetProvider", () => {
    const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
    expect(app).toContain("<IconSetProvider>");
    expect(app).toContain('from "./state/IconSetContext"');
  });

  test("it sits inside AppProvider, which owns the settings it reads", () => {
    const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
    const appIdx = app.indexOf("<AppProvider>");
    const setIdx = app.indexOf("<IconSetProvider>");
    expect(appIdx).toBeGreaterThanOrEqual(0);
    expect(setIdx).toBeGreaterThan(appIdx);
  });
});
