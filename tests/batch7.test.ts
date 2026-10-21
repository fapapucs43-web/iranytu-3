/**
 * Batch 7 (P12) — icon set registry tests.
 *
 * The registry is the part of this feature that decides whether it is safe.
 * Three failure modes are worth a test each, and all three are silent:
 *
 *   1. A set that cannot draw one of the 29 glyphs would render a WRONG
 *      picture rather than nothing. Substituting `star` for 🌱 changes the
 *      meaning of stored data.
 *   2. Fluent's figures are gender- and skin-toned. A set that draws every
 *      activity as a man is not acceptable for this app, and nothing about
 *      that would look like a bug — it would just look like art.
 *   3. `DEFAULT_ACTIVITIES` keeps the emoji inside the label string, and
 *      `correlationGrid` matches on that exact string. Touching those strings
 *      zeroes every existing user's correlation history without any error.
 *
 * So: the mapping is asserted to be total, the Fluent names are asserted
 * genderless, and the stored data is asserted byte-identical to what Batch 5
 * left behind.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  ACTIVITY_GLYPHS,
  DEFAULT_ICON_SET,
  GLYPHS,
  ICON_SET_IDS,
  ICON_SETS,
  MOOD_GLYPHS,
  RETIRED_ICON_SET_LABELS,
  RETIRED_ICON_SET_REPLACEMENT,
  RETIRED_ICON_SETS,
  coerceIconSetId,
  glyphArtwork,
  glyphDef,
  iconSetDef,
  isIconSetId,
  licenceEntries,
  setAssets,
  setDownloadBytes,
  setStems,
} from "../src/lib/iconsets";
import { ICONS, getIcon } from "../src/lib/icons";
import { loadFluentArtwork } from "../src/lib/iconsets";
import { NAV_ICONS } from "../src/lib/nav-icons";

// `glyphArtwork` is a synchronous lookup over a chunk that is now fetched on
// demand, so it answers undefined until the loader has run — and `bun test`
// shares one module registry across every file in a run, which means whether it
// has run depends on which file went first. That is why this await exists and
// why `tests/lib/artwork-split.test.ts` fails if a test file asserts artwork
// without one: the alternative is a green suite locally and a red one in CI,
// ordered differently, for no reason anyone can see.
beforeAll(async () => {
  await loadFluentArtwork();
});

/** The emoji as it stood BEFORE Batch 7. Frozen on purpose. */
const PRE_BATCH_7_ACTIVITIES = [
  "🚶 Mozgás",
  "👥 Társaság",
  "🧘 Relaxáció",
  "💻 Munka",
  "🏠 Otthon",
  "📚 Tanulás",
  "🎵 Zene",
  "🌿 Természet",
] as const;

describe("the set list", () => {
  test("Lucide is the default, so an untouched user sees no change", () => {
    expect(DEFAULT_ICON_SET).toBe("lucide");
    expect(ICON_SETS[0]!.id).toBe("lucide");
  });

  test("there are exactly three sets, and every one we ever cut is absent", () => {
    // Noto 3D and 3dicons were dropped in Batch 7: 7.5 MB, and 8 of 29 glyphs
    // missing (including 🚶 and 🧘, both DEFAULT_ACTIVITIES); 3dicons is an
    // object set with no 🧘 💧 🩺 🚶 at all. A menu entry that falls back on
    // half its glyphs is worse than no entry. Twemoji was withdrawn in
    // Batch 7b, because its graphics are CC-BY 4.0.
    expect(ICON_SET_IDS).toEqual(["lucide", "system", "fluent"]);
    for (const gone of ["noto", "3dicons", "twemoji", "noto-3d"]) {
      expect(ICON_SET_IDS).not.toContain(gone);
    }
  });

  test("the two zero-download sets really cost nothing", () => {
    for (const id of ["lucide", "system"] as const) {
      expect(iconSetDef(id).downloads).toBe(false);
      expect(setDownloadBytes(id)).toBe(0);
    }
  });

  test("no set downloads anything, and that is stated, not implied", () => {
    // Batch 7's 500 kB budget guarded two fetched sets. It is now a claim with
    // no exception: nothing in this registry is fetched, on selection or ever.
    // Asserted over every set rather than skipped when `downloads` is false,
    // because a `continue` here would pass for a set that did download.
    for (const s of ICON_SETS) {
      expect(s.downloads, `${s.id} claims a download`).toBe(false);
      expect(setDownloadBytes(s.id), `${s.id} quotes a cost`).toBe(0);
    }
  });

  test("the picker shows a real cost, not a placeholder", () => {
    for (const s of ICON_SETS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
      if (s.downloads) expect(s.downloadLabel).toMatch(/kb\./);
      else expect(s.downloadLabel).toBe("nincs letöltés");
    }
  });

  test("no set declares a path, because there is nothing to fetch from one", () => {
    // `base` is gone from the type. Asserted as a source check as well as a
    // type check, so a reintroduced path field fails here rather than passing
    // because the compiler agrees it is optional.
    const src = readFileSync(new URL("../src/lib/iconsets.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toContain("base?:");
    // Absolute paths only: the registry imports "./iconsets/fluent-artwork",
    // which is a module path and not a request for a file.
    expect(src).not.toMatch(/["'`]\/iconsets\//);
  });
});

describe("the glyph map is total", () => {
  test("every glyph has a Lucide icon that actually exists", () => {
    for (const g of GLYPHS) {
      expect(getIcon(g.lucide), `${g.glyph} → ${g.lucide}`).not.toBeNull();
    }
  });

  test("the artwork set can draw every glyph", () => {
    // The whole point of dropping Noto and 3dicons. A gap here is a wrong
    // picture at render time, so it must be a failing test, never a fallback.
    for (const g of GLYPHS) {
      const svg = glyphArtwork("fluent", g.glyph);
      expect(svg, `fluent cannot draw ${g.glyph}`).toBeDefined();
      // Real artwork, not an empty string that would render as nothing.
      expect(svg!.startsWith("<svg"), `fluent ${g.glyph} is not an <svg>`).toBe(true);
    }
  });

  test("EVERY glyph names its Fluent file, not just the objects", () => {
    // Added after the five mood faces shipped without a `fluent` field. The
    // href assertion above caught it, but only by accident of ordering; this
    // states the invariant directly — a missing name is a missing asset.
    for (const g of GLYPHS) {
      expect(g.fluent, `${g.glyph} has no Fluent filename`).toBeTruthy();
      expect(g.fluent).toMatch(/^[a-z0-9-]+$/);
    }
  });

  test("the artwork set is keyed by its own name, not by the emoji", () => {
    // Fluent has English slugs; the nav's ⚙️ has no entry in GLYPHS at all and
    // still has artwork. That is why the seam takes a stem.
    expect(glyphArtwork("fluent", "🚶")).toContain("<svg");
    expect(setStems("fluent")).toContain("person-walking-default");
  });

  test("the two free sets resolve to no artwork at all", () => {
    // Not "artwork from a CDN" and not "artwork as a data URI" — none. This is
    // what makes Lucide and the system set degenerate cases of the same seam.
    expect(glyphArtwork("lucide", "🚶")).toBeUndefined();
    expect(glyphArtwork("system", "🚶")).toBeUndefined();
    expect(setAssets("lucide")).toEqual([]);
    expect(setAssets("system")).toEqual([]);
  });

  test("a glyph the app does not draw resolves to nothing", () => {
    // A user-typed custom emoji. Returning the literal character is correct
    // behaviour, not a fallback — so the map simply has no entry.
    expect(glyphDef("🦄")).toBeUndefined();
    expect(glyphArtwork("fluent", "🦄")).toBeUndefined();
  });

  test("the asset list is deduplicated", () => {
    // GLYPHS repeats 🌿 and 📚; the inlined module must not carry them twice.
    for (const id of ICON_SET_IDS) {
      const stems = setStems(id);
      expect(new Set(stems).size, `${id} repeats a stem`).toBe(stems.length);
      const glyphs = setAssets(id).map((a) => a.glyph);
      expect(new Set(glyphs).size, `${id} repeats a glyph`).toBe(glyphs.length);
    }
  });

  test("codepoints carry NO variation selector, because upstream had none", () => {
    // This test originally asserted the opposite and was wrong. Verified
    // against the upstream repository: `1f3d4-fe0f` and `2b06-fe0f` both
    // return 404, while the bare codepoints return 200 and render the same
    // glyph. A stem with a selector on it is a 404, not a faithful filename.
    for (const g of GLYPHS) {
      expect(g.codepoints, `${g.glyph} stem`).toMatch(/^[0-9a-f]+$/);
    }
    expect(glyphDef("🏔️")!.codepoints).toBe("1f3d4");
    expect(glyphDef("⬆️")!.codepoints).toBe("2b06");
  });

  test("the correlation outcome columns are in the map, not just activities", () => {
    // Found by audit, not by design: these are the grid's COLUMN headers, so a
    // column that changed its picture would change what the table appears to
    // be measuring.
    const grid = readFileSync(new URL("../src/lib/correlationGrid.ts", import.meta.url), "utf8");
    for (const m of grid.matchAll(/icon: "(.+?)"/g)) {
      expect(glyphDef(m[1]!), `${m[1]} is a grid column with no mapping`).toBeDefined();
    }
  });

  test("the insight bullets in analysis.ts are in the map too", () => {
    const analysis = readFileSync(new URL("../src/lib/analysis.ts", import.meta.url), "utf8");
    for (const m of analysis.matchAll(/icon: "(.+?)"/g)) {
      expect(glyphDef(m[1]!), `${m[1]} is an insight bullet with no mapping`).toBeDefined();
    }
  });

  test("the map is complete for every data module, by audit not by memory", () => {
    // The inventory that matters: any emoji a src/lib module attaches to a
    // field named `icon` or `emoji` must resolve. This is the test that
    // would have caught the 7 glyphs the hand-written list missed.
    for (const p of ["src/lib/correlationGrid.ts", "src/lib/analysis.ts", "src/lib/mood.ts", "src/lib/trackers.ts", "src/lib/habits.ts"]) {
      const src = readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
      for (const m of src.matchAll(/(?:icon|emoji): "([^"]+)"/g)) {
        expect(glyphDef(m[1]!), `${p}: ${m[1]}`).toBeDefined();
      }
    }
  });
});

describe("Fluent's figures are genderless", () => {
  test("no entry depicts a person as a man or a woman", () => {
    // 27 of the 29 have no human figure. The two that do (🧘 Relaxáció,
    // 🚶 Mozgás) use the `person-` form. A map edit that reintroduces
    // `man-` here would be a content decision, not a typo, so it fails loudly.
    for (const g of GLYPHS) {
      if (!g.fluent) continue;
      expect(g.fluent, `${g.glyph} uses a gendered figure`).not.toMatch(
        /^(man|woman|male|female)-/,
      );
    }
  });

  test("the two figures resolve to the neutral `person-` names", () => {
    expect(glyphDef("🚶")!.fluent).toBe("person-walking-default");
    expect(glyphDef("🧘")!.fluent).toBe("person-in-lotus-position-default");
  });

  test("figures use the default skin tone, not a light one", () => {
    for (const g of GLYPHS) {
      if (!g.fluent || !g.fluent.startsWith("person-")) continue;
      expect(g.fluent).toMatch(/-(default|medium|medium-dark|medium-light|dark|light)$/);
    }
  });
});

describe("the mood scale stays legible", () => {
  test("its five rungs map to five DIFFERENT icons", () => {
    // Sharing one icon across two rungs would collapse the top of the scale,
    // and the scale is the thing a user calibrates their feelings against.
    const names = MOOD_GLYPHS.map((g) => glyphDef(g)!.lucide);
    expect(new Set(names).size).toBe(5);
  });

  test("the five rungs are the ones the scale has always used", () => {
    expect(MOOD_GLYPHS).toEqual(["😖", "😕", "😐", "🙂", "😄"]);
    const mood = readFileSync(new URL("../src/lib/mood.ts", import.meta.url), "utf8");
    for (const g of MOOD_GLYPHS) expect(mood).toContain(`emoji: "${g}"`);
  });

  test("the achievement badges are unchanged", () => {
    const ach = readFileSync(new URL("../src/lib/achievements.ts", import.meta.url), "utf8");
    for (const g of ["🧭", "🔥", "🌿", "🏔️", "📓", "📚", "🏆", "📸", "🎬", "🙏", "🧠", "💧"]) {
      expect(ach).toContain(g);
    }
  });
});

describe("the stored data is untouched", () => {
  test("DEFAULT_ACTIVITIES is byte-identical to before Batch 7", () => {
    // These strings are the correlation key. `correlationGrid` filters
    // `e.activities.includes(row.label)`, so a reformat here silently
    // zeroes every existing user's history.
    const store = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
    for (const label of PRE_BATCH_7_ACTIVITIES) {
      expect(store, `"${label}" changed`).toContain(`"${label}"`);
    }
  });

  test("the activity glyphs are a prefix of those labels, not a new field", () => {
    for (let i = 0; i < PRE_BATCH_7_ACTIVITIES.length; i++) {
      expect(PRE_BATCH_7_ACTIVITIES[i]!.startsWith(ACTIVITY_GLYPHS[i]!)).toBe(true);
    }
  });

  test("no Batch 7 file rewrites an activity label into {icon,label}", () => {
    // The refactor that must never happen. Checked as source text because the
    // failure is a change in what the DATA looks like, not in what renders.
    // Comments are stripped first: the registry's doc comment names
    // DEFAULT_ACTIVITIES precisely to explain why it must not be touched.
    for (const p of ["src/lib/iconsets.ts", "src/lib/icons.tsx"]) {
      const src = readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(src).not.toMatch(/\{\s*icon\s*:\s*"/);
      expect(src).not.toContain("DEFAULT_ACTIVITIES");
    }
  });
});

describe("selection is validated on read", () => {
  test("a known id is kept", () => {
    for (const id of ICON_SET_IDS) {
      expect(isIconSetId(id)).toBe(true);
      expect(coerceIconSetId(id)).toBe(id);
    }
  });

  test("a corrupt or hostile value falls back to Lucide", () => {
    for (const bad of [null, undefined, "", "noto", 42, {}, [], "toString", "__proto__"]) {
      expect(coerceIconSetId(bad)).toBe("lucide");
    }
  });

  test("no prototype key can be read as a set", () => {
    expect(isIconSetId("constructor")).toBe(false);
    expect(isIconSetId("hasOwnProperty")).toBe(false);
  });
});

describe("licences are stated", () => {
  test("every set names a licence, a source and a plain-words note", () => {
    for (const s of ICON_SETS) {
      expect(s.licence).toMatch(/^(ISC|n\/a|MIT|CC-BY-4\.0)$/);
      expect(s.source.length).toBeGreaterThan(3);
      expect(s.licenceNote.length).toBeGreaterThan(10);
    }
  });

  test("no set the app still offers is CC-BY", () => {
    // The reason Twemoji was withdrawn. Asserted as a property of the whole
    // registry rather than as the absence of one id, so a set added later
    // under a copyleft licence fails here instead of shipping unnoticed.
    for (const s of ICON_SETS) {
      expect(s.licence, `${s.label} is ${s.licence}`).not.toBe("CC-BY-4.0");
    }
    expect(RETIRED_ICON_SETS).toEqual(["twemoji"]);
    expect(RETIRED_ICON_SET_REPLACEMENT).toBe("fluent");
    // A withdrawn set keeps the name the user chose it by, so the one-time
    // toast can say "Twemoji" rather than the stored id.
    expect(RETIRED_ICON_SET_LABELS["twemoji"]).toBe("Twemoji");
  });

  test("Fluent is MIT and the system set is correctly marked as not ours", () => {
    expect(iconSetDef("fluent").licence).toBe("MIT");
    expect(iconSetDef("fluent").licenceNote).not.toMatch(/CC-BY/);
    expect(iconSetDef("system").licence).toBe("n/a");
  });

  test("the licences screen lists every set and marks the active one", () => {
    for (const id of ICON_SET_IDS) {
      const rows = licenceEntries(id);
      expect(rows).toHaveLength(ICON_SETS.length);
      expect(rows.find((r) => r.setId === id)!.used, id).toBe(true);
      expect(rows.filter((r) => r.used), id).toHaveLength(1);
    }
    // Every entry must be self-describing, because it is the only place a
    // reader learns what they are shipping.
    for (const r of licenceEntries(undefined)) expect(r.licenceNote.length).toBeGreaterThan(10);
  });
});

describe("no external requests", () => {
  test("no set points at a CDN", () => {
    // Same reasoning as the fonts: the app promises nothing leaves the device,
    // and a third-party host would see which IP opened a mood journal.
    for (const p of ["src/lib/iconsets.ts"]) {
      const src = readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
      const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(body).not.toMatch(/https?:\/\//);
    }
  });

  test("no set names a file, a directory or a URL of any kind", () => {
    // Stronger than the same-origin check Batch 7 made: with the artwork
    // inlined there is no request to be same-origin ABOUT. Comments are
    // stripped so the registry is free to discuss `/iconsets/` in prose.
    const body = readFileSync(new URL("../src/lib/iconsets.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(body).not.toMatch(/["'`]\/iconsets\//);
    expect(body).not.toMatch(/\.svg/);
    expect(body).not.toMatch(/data:image/);
  });
});

describe("Batch 7 touches a known, enumerated set of files and nothing else", () => {
  /** Batch 7's own files. Any sibling batch's guard reads this list. */
  const BATCH_7_FILES = [
    // Commit 1 — the registry and the vendored icon paths.
    "src/lib/iconsets.ts",
    "src/lib/icons.tsx",
    "tests/batch7.test.ts",
    // Commit 2 — the provider, the picker, and the call sites.
    "src/state/IconSetContext.tsx",
    "src/components/IconSetPicker.tsx",
    "src/views/TodayView.tsx",
    "src/views/JournalView.tsx",
    "src/views/InsightsView.tsx",
    "src/views/SettingsView.tsx",
    "src/components/EntryDetail.tsx",
    "src/components/AchievementsCard.tsx",
    "src/components/CorrelationGrid.tsx",
    "src/components/TrackerInputs.tsx",
    "src/components/HabitStreaks.tsx",
    "src/components/OnboardingFlow.tsx",
    "src/components/CustomActivityManager.tsx",
    "src/components/CustomTrackerManager.tsx",
    "src/components/ui/ui.tsx",
    "src/lib/store.ts",
    "src/types.ts",
    "src/App.tsx",
    "src/styles.css",
    "public/sw.js",
    "tests/batch7-ui.test.ts",
    "tests/batch7-store.test.ts",
    "public/iconsets/LICENSES.md",
    // Batch 6's scoping guard is generalised to accept files a later batch
    // claims, so it has to change. Nothing else of that batch moves.
    "tests/batch6.test.ts",
    // Batch 8 (typography) edits four of Batch 7's own files — the two
    // registries' shared settings normalisation, the two pickers' host view,
    // `types.ts` and `styles.css` — so it has to claim them. This is the same
    // situation as Batch 6 above, and the same fix: name the file rather than
    // weaken the guard.
    "src/views/TodayView.tsx",
    "src/components/EntryDetail.tsx",
    "src/views/SettingsView.tsx",
    // Batch 8's own files. The four font modules it replaced or extended, the
    // picker it rewrote, the vendoring script that makes the swap reproducible,
    // and the test that pins the new behaviour. `public/fonts/*` is handled by
    // the pattern below, as `public/iconsets/*` is.
    "src/lib/fonts.ts",
    "src/lib/fonts-runtime.ts",
    "src/state/FontContext.tsx",
    "src/components/FontPicker.tsx",
    "src/lib/store.ts",
    "src/types.ts",
    "src/styles.css",
    "public/sw.js",
    "scripts/vendor-fonts.ts",
    "tests/batch5-typography.test.ts",
    "tests/batch8-typography.test.ts",
    "public/iconsets/LICENSES.md",
    // Batch 7b: the nav draws through the chosen icon set, so it gains a
    // registry and a component. The nav is the one chrome surface that follows
    // the set, and it needs its own registry because its glyphs (⚙️ above all)
    // are not among the 38 the content registry knows.
    "src/lib/nav-icons.ts",
    "src/components/NavIcon.tsx",
    "src/components/BottomNav.tsx",
    "tests/batch5.test.ts",
    "tests/batch7b.test.ts",
    // Batch 7b: the artwork moves into the bundle, so the generator and the
    // generated module appear. The batch's own test file is declared above,
    // in the commit that created it, rather than here.
    "scripts/vendor-fluent-artwork.ts",
    "src/lib/iconsets/fluent-artwork.ts",
    // Batch 7b WITHDREW four things. They are named here as removals, because
    // the guard below is computed from `git diff` and a deleted file still
    // shows up in it. Each line is a file this batch is allowed to have
    // removed, and the comment says why it went.
    //
    //   src/lib/iconset-runtime.ts  the fetch/warm/retry module. Unreachable
    //     once artwork is inlined: no set loads anything, so its 154 lines of
    //     warm-up, retry and per-glyph failure bookkeeping drive no path.
    //   scripts/vendor-iconsets.ts wrote both file-backed directories. Fluent
    //     is now generated into the module graph and Twemoji is withdrawn, so
    //     it has no source left to fetch from.
    //   tests/batch7-assets.test.ts tested the two directories being present.
    //   public/iconsets/{fluent,twemoji}-v1/ the files themselves, artwork
    //     now inlined and the CC-BY set withdrawn.
    //
    // The additive-only rule protects working features, not dead code. A
    // fallback path that can never fire is worse than no fallback path.
    "src/lib/iconset-runtime.ts",
    "scripts/vendor-iconsets.ts",
    "tests/batch7-assets.test.ts",
    "public/iconsets/fluent-v1/LICENSE.txt",
    "public/iconsets/fluent-v1/GRAPHICS-LICENCE.txt",
    "public/iconsets/twemoji-v1/LICENSE.txt",
    "public/iconsets/twemoji-v1/GRAPHICS-LICENCE.txt",
    // Batch 7c edits one assertion in a Batch 6 test. `tests/batch6-ui.test.ts`
    // guarded the entry CSV with `git diff --name-only main`, which assumes a
    // local branch called `main` — true in every developer's clone, false on
    // the detached merge ref `actions/checkout` produces, and therefore the
    // one test that went red the moment CI started running the suite at all.
    // It now pins the file's bytes instead, which needs no git at all and
    // cannot silently re-baseline as a branch moves. No app code and no Batch
    // 6 behaviour changed; the file is claimed here for the same reason Batch
    // 8 claimed the pickers' host view.
    "tests/batch6-ui.test.ts",
    // Batch 7d: the navigation can get out of the way while the reader
    // scrolls. It is three files because the feature is three questions —
    // "should it be visible" (pure, exhaustive tests), "what do we listen to"
    // (tested against a fake window), and "what does React do with the
    // answer" (ten lines, deliberately untested because a static render runs
    // no effects and a test of it would assert nothing). Same split the
    // typefaces already draw between `fonts.ts` and `fonts-runtime.ts`.
    "src/lib/navVisibility.ts",
    "tests/batch7d.test.ts",
    // ...and the other two halves of the same feature: the listener, and the
    // ten lines of React that consume it.
    "src/lib/navAutoHide.ts",
    "src/components/useAutoHideNav.ts",
    // Batch 7f, half one: the three things a user actually complained about.
    // It starts with the ICONS, because the diagnosis turned out to be that
    // the bottom nav was innocent and the other 39 call sites were not — so the
    // fix is a new drawing component and a policy that says which icons are
    // allowed to stay Lucide and why.
    "src/components/ContentIcon.tsx",
    "src/lib/icon-policy.ts",
    "tests/batch7f.test.ts",
    // ...and the nine chrome files whose icons turned out to be content. Every
    // one of them still draws some chrome — a magnifier, a lock, a clock — so
    // they keep their `lib/icons` import; what changed is the icons that DID
    // have a picture, and those now name themselves.
    "src/components/AppHeader.tsx",
    "src/components/AssessmentItemView.tsx",
    "src/components/AttachmentPicker.tsx",
    "src/components/CbtForm.tsx",
    "src/components/GratitudeJournal.tsx",
    "src/components/HabitStreaks.tsx",
    "src/components/YearInPixels.tsx",
    // ...and Batch 7f's own test edits. Three existing tests had to change, and
    // each for a reason that belongs in review rather than in a comment:
    //   tests/batch5.test.ts     its "chrome imports the registry" guard now
    //     accepts one level of delegation, because two chrome files stopped
    //     importing `lib/icons` at all once every icon in them became content.
    //   tests/batch6-ui.test.ts  its render helper now supplies the two
    //     providers the app always has, because the crisis notice's triangle
    //     became a set-aware icon and the block is rendered on its own here.
    //   src/state/IconSetContext.tsx
    //     `InlineArtwork` grew an optional `style`, so a routed icon can keep
    //     the box the Lucide one it replaced had. Optional, so every existing
    //     call site is unchanged.
    "tests/batch5.test.ts",
    "tests/batch6-ui.test.ts",
    // ...and the second half of Batch 7f, which is the other two complaints.
    // The families: five added, one withdrawn, and the byte-level check that
    // would have caught the withdrawn one while it was still shipped.
    "src/lib/font-cmap.ts",
    "src/lib/font-preload.ts",
    "src/types/node-zlib.d.ts",
    "src/components/ReportExport.tsx",
    // Two earlier typography tests are revised rather than replaced, because
    // the invariants they protect — one file per weight, an OFL text per family,
    // a bound on the total payload — are all still true and are now checked
    // against a registry twice the size.
    "tests/batch5-typography.test.ts",
    "tests/batch8-typography.test.ts",
    // Batch 7e: more trackers. Six files that earlier batches never touched
    // have to be named here, because the guard below diffs from the commit
    // that added `src/lib/iconsets.ts` and fails on ANY changed file missing
    // from this list. Naming them here is also what satisfies Batch 6's
    // `claimedByAnyBatch`, which reads this same list out of the working tree.
    "src/lib/trackers.ts",
    "src/lib/correlationGrid.ts",
    "src/lib/csv.ts",
    "tests/batch7e.test.ts",
    // ...and the two existing tests Batch 7e has to revise, each for a reason
    // that belongs in review: `tests/phase2.test.ts` pins the set of input
    // kinds and there are now six, and `tests/batch4.test.ts` gains round-trip
    // cases for the three new value kinds. The `weather` text case in the
    // latter is deliberately NOT touched — that value's shape is unchanged.
    "tests/phase2.test.ts",
    "tests/batch4.test.ts",
    // Six more of Batch 7e's files are already in this list and are not
    // repeated: `src/lib/iconsets.ts`, `src/lib/icons.tsx`,
    // `src/lib/iconsets/fluent-artwork.ts` (three new glyphs and one new
    // vendored Lucide path), `src/components/TrackerInputs.tsx`,
    // `src/components/CorrelationGrid.tsx`, `src/views/SettingsView.tsx`,
    // `src/types.ts` and `src/styles.css`.
    //
    // Batch 7g: the Year in Pixels card gets its missing stylesheet and a
    // readable month row. Two files here have never appeared in the list and
    // so have to be named. `src/lib/yearInPixels.ts` because the card needs
    // the month names and the cell dates; `tests/batch7g.test.ts` because a
    // batch's own test file is claimed like any other file, which Batch 7b
    // established for `tests/batch7b.test.ts`.
    //
    // `src/components/YearInPixels.tsx` and `src/styles.css` are already
    // listed (Batch 7f and Batch 8) and are deliberately not repeated. The
    // batch changes no data, no colour and no mood mapping; its one
    // non-additive edit is the card's title string, which the PR body says.
    "src/lib/yearInPixels.ts",
    "tests/batch7g.test.ts",
    //
    // Batch 7h: tracker values finally get READ. Batch 7e added eight
    // trackers and everything that stores, exports or correlates them was
    // already there — but nothing rendered one, so a step count was written
    // and never seen again. Two files here are new and so have to be named.
    //
    //   src/lib/trackerDisplay.ts  the display rules, in one DOM-free place,
    //     so the entry detail and the PDF cannot disagree about what a
    //     recorded value is or how it reads.
    //   tests/batch7h.test.ts      including the proof that the PDF no longer
    //     draws a character jsPDF's built-in font cannot encode — a defect
    //     that shipped in the report title before this batch.
    //
    // `src/components/EntryDetail.tsx` (Batch 8) is already listed.
    //
    // Two more are named here that no earlier batch ever claimed, and the
    // scoping guard is what proved it: Batch 7f touched the PDF's CALL SITE
    // (`src/components/ReportExport.tsx`) and left the generator itself
    // unclaimed, so this batch is the first to have to name it.
    //
    //   src/lib/reportPdf.ts        the generator. Batch 7h adds the tracker
    //     summary and the fold that stops it drawing a character its built-in
    //     font cannot encode — a defect that shipped in the report title.
    //   tests/batch6-pdf.test.ts    one assertion in Batch 6's own PDF test
    //     is corrected, because the fold legitimately changes what the
    //     generator draws: a band label containing `ő` used to reach the page
    //     as a control byte and a stray letter. Corrected to the folded
    //     spelling, not loosened.
    "src/lib/reportPdf.ts",
    "tests/batch6-pdf.test.ts",
    "src/lib/trackerDisplay.ts",
    "tests/batch7h.test.ts",
    //
    // Batch 7i stops the generator from having to fold a Hungarian letter to
    // spell it: it embeds a subsetted Noto Sans instead. The subset is DERIVED,
    // and the thing that derives it has to be in the repository, or the bytes
    // in `public/fonts/` are an artefact nobody can reproduce. It walks the
    // app's own modules for the character set, so it is claimed here for the
    // same reason `vendor-fonts.ts` is — a vendoring script that is not
    // reviewable is a vendoring script that drifts.
    //
    //   scripts/subset-pdf-font.ts  fetches pinned Noto Sans TTFs, refuses to
    //     write on a hash or magic mismatch, subsets to the walked character
    //     set plus a fixed Hungarian floor, and writes the two TTFs and the OFL
    //     text into `public/pdf-fonts/`.
    "scripts/subset-pdf-font.ts",
    //   src/lib/pdfFonts.ts  the "get it" half of the same change: a fetch of
    //     the two committed files on export, each one checked against the byte
    //     count and SHA-256 the vendoring script recorded, base64 for jsPDF.
    //     Kept separate from the generator because the verification has to be
    //     testable without a document, and because a loader that knows about
    //     jsPDF is a loader that will be asked to know about the next thing.
    "src/lib/pdfFonts.ts",
    //   tests/batch7i.test.ts  the proof, and the only file in the batch that
    //     has to run the generator in a SECOND process: two other test files
    //     call `mock.module("jspdf", …)`, Bun's module mocks are process-wide,
    //     and a test that wants the real jsPDF therefore has to want it in a
    //     process of its own. It is here for the same reason `batch7h` is.
    "tests/batch7i.test.ts",
    //   scripts/subset-ui-fonts.ts  the UI fonts' half of Batch 7i: it re-cuts
    //     every vendored woff2 to the characters the app can display, which is
    //     where the 660 kB becomes 415 kB, and it is the only reason Lato can
    //     ever come back — a Google subset that has already lost ő cannot be
    //     given one back by subsetting it.
    //   src/lib/font-cmap.ts  the woff2 reader, and the second thing this
    //     commit found: it read a transform length for `hmtx`, which the spec
    //     permits and which no writer in this repository's supply chain emits.
    "scripts/subset-ui-fonts.ts",
    "src/lib/font-cmap.ts",
    "tests/batch7i-ui-fonts.test.ts",
    //   tests/batch5-typography.test.ts, tests/batch7f.test.ts and
    //     tests/batch8-typography.test.ts  three files whose pinned numbers
    //     describe the old, uncut fonts: the payload bound, the preload budget
    //     and the vendoring script's source list, which grew a second table.
    "tests/batch5-typography.test.ts",
    "tests/batch7f.test.ts",
    "tests/batch8-typography.test.ts",
    // Batch 7k: the Year in Pixels grid moves from fourth to second in
    // InsightsView — the week's numbers are a glance, the year is the payoff,
    // and the card sat below two charts it does not depend on. A reorder is
    // one line of JSX and the whole claim.
    "src/views/InsightsView.tsx",
    // Batch 8b: two features, four files.
    //
    //   src/lib/weather.ts  the Open-Meteo module: opt-in, two-step consent,
    //     per-(location,day) cache, silent degradation. Native fetch, no deps.
    //   src/components/WeatherApiCard.tsx  the consent lives here, in Settings,
    //     not on the entry form.
    //   src/components/WorkoutPrograms.tsx  static content: four programs, no
    //     new logic beyond open/close, which Collapsible already has.
    //   tests/batch8b-weather.test.ts  the weather module's proof, against a
    //     stubbed fetch.
    "src/lib/weather.ts",
    "src/components/WeatherApiCard.tsx",
    "src/components/WorkoutPrograms.tsx",
    "tests/batch8b-weather.test.ts",
    // Batch C: the font promises pinned against each other — registry bytes vs
    // disk, Hungarian coverage per family and segment, the app's own sentence,
    // glyph resolution, the size bounds, and the pdf-fonts exclusion. One
    // behaviour change rides with it: Saira Condensed left the preload list to
    // hold the 250 kB bound, which tests/batch7f.test.ts re-pins.
    "tests/batch-C.test.ts",
    "src/lib/fonts.ts",
    "tests/batch7f.test.ts",
    // Batch 9: the smartwatch import. Parsers per source, one merge module
    // that enforces fill-existing-by-date, the settings card, and the test
    // file that pins both parsers and the merge semantics.
    "src/lib/healthImport/types.ts",
    "src/lib/healthImport/appleHealth.ts",
    "src/lib/healthImport/googleFit.ts",
    "src/lib/healthImport/merge.ts",
    "src/components/HealthImportCard.tsx",
    "src/types.ts",
    "tests/batch9.test.ts",
    // Batch 10: the food photo AI. The module (key storage, the one call,
    // range-checked parsing), its Settings consent card, the capture UI in
    // the Today toolbox, and the test file pinning all of it.
    "src/lib/foodAi.ts",
    "src/components/FoodAiSettingsCard.tsx",
    "src/components/FoodPhotoCapture.tsx",
    "src/views/TodayView.tsx",
    "src/views/SettingsView.tsx",
    "tests/batch10.test.ts",
    //
    // Batch 11: the UX premium refresh. Commit 1 adds the collapse-state
    // store (one `belso-iranytu:cardStates` key, lazy single read) and its
    // proof; the files it EDITS — ui.tsx, TrackerInputs, the four feature
    // cards, styles.css — are all already on this list from earlier batches.
    "src/lib/cardStates.ts",
    "tests/batch11-collapse.test.ts",
    // Batch 11, commit 2: the tabs' order — the pure normaliser lives in the
    // nav's own lib (navVisibility), and its proof is this file. types.ts,
    // BottomNav.tsx, navVisibility.ts, SettingsView.tsx, store.ts and
    // styles.css are all already on this list from earlier batches.
    "tests/batch11-tabs.test.ts",
    // Batch 11, commit 3: the CSS-polish pass recomputed the mood hexes for
    // WCAG AA over every theme background, which touches the palette in
    // lib/mood.ts (level 1 was already compliant and stays); its own proof is
    // batch11-polish, and the two palette-literal pins it adjusts live in
    // batch7g and phase3, both named here now that those files moved.
    "src/lib/mood.ts",
    "tests/batch11-polish.test.ts",
    "tests/phase3.test.ts",
    // Batch 11, commit 4: the nutrition tips — the pure rules module and its
    // proof. TodayView.tsx and SettingsView.tsx are already on this list.
    "src/lib/nutritionTips.ts",
    "tests/batch11-nutrition.test.ts",
    // Batch 11, commit 5: the sport tips — the pure rules module and its
    // proof. TodayView.tsx, SettingsView.tsx and WorkoutPrograms.tsx are
    // already on this list from earlier batches.
    "src/lib/sportTips.ts",
    "tests/batch11-sport.test.ts",
    //
    // Batch 12 (the final wrap-up batch), commit 3a: the CSS housekeeping.
    // `src/styles.css` is already on this list from Batch 7 — this batch only
    // deletes an orphan rule, merges a duplicated pair and adds the guard that
    // keeps the stylesheet honest, so the new file is the only claim.
    "tests/batch12-css.test.ts",
    //
    // Batch 12, commit 3b: the dead-export removals. `src/lib/iconsets.ts` is
    // already on this list from Batch 7; the other four modules are claimed
    // here for the same reason Batch 8 claimed the two pickers' host view —
    // a housekeeping batch that deletes a declaration still has to say which
    // files it opened, or the guard cannot tell a deliberate removal from an
    // accident. The proof is the new dead-export guard.
    "src/lib/dates.ts",
    "src/lib/font-cmap.ts",
    "src/lib/pwa.ts",
    "src/lib/yearInPixels.ts",
    "tests/batch12-dead-export.test.ts",
    //
    // Batch 12, commit 3c: the corrupt-theme repair. `src/lib/store.ts` is
    // already on this list; `src/lib/themes.ts` gains the name list and the
    // validator the store asks, and both new proof files are claimed.
    "src/lib/themes.ts",
    "tests/batch12-theme.test.ts",
    //
    // Batch 12, commit 4: Lato comes back. `src/lib/fonts.ts` and
    // `scripts/vendor-fonts.ts` are already on this list from Batch 8; the
    // subsetter gains two exports, and the vendored binaries are covered by
    // the `public/fonts/` pattern below rather than named one by one — which is
    // the same treatment the woff2 and OFL families already have.
    "scripts/subset-ui-fonts.ts",
    "tests/batch-C.test.ts",
    "tests/batch5-typography.test.ts",
    "tests/batch8-typography.test.ts",
    "tests/batch12-lato.test.ts",
    //
    // Batch 12, commit 5: the media-query module. `useAutoHideNav.ts` is
    // already on this list from Batch 7d; `ThemeContext.tsx` gains the
    // subscription and `themes.ts` (Batch 8) gains the shared reader, both of
    // which now go through the new module so the legacy listener spelling is
    // handled in one tested place rather than two untested ones.
    "src/lib/media.ts",
    "src/state/ThemeContext.tsx",
    "src/components/BreathingExercise.tsx",
    "tests/batch12-media.test.ts",
    //
    // Batch 13, commit 1: the character-map reader stops probing and starts
    // reading. The three files it edits are all already on this list —
    // `src/lib/font-cmap.ts` from Batch 7f and Batch 12's dead-export sweep,
    // `src/lib/themes.ts` from Batch 8 and Batch 12's corrupt-theme repair,
    // and `tests/batch7i-ui-fonts.test.ts` from Batch 7i — so only the new
    // proof is claimed here. It is a separate file rather than more assertions
    // in `batch7f` because it tests a PARSER against fonts it builds itself:
    // the format-12 and odd-`idRangeOffset` paths no committed file uses, and
    // the refusal path no real file can provoke, are the only way to reach
    // code that the twenty-four real files never execute.
    "tests/batch13-cmap.test.ts",
    //
    // Batch 13, commit 2: `color-scheme`. `src/lib/themes.ts` is already on
    // this list, and it is the ONLY file this commit edits in `src/` — which
    // is the point of the change rather than a detail of it. Four paths
    // repaint the document root and the line went into the one function all
    // four already call, so no provider, context or component was touched, and
    // `tests/batch13-color-scheme.test.ts` asserts that single-writer property
    // by walking `src/` for the property rather than trusting this sentence.
    "tests/batch13-color-scheme.test.ts",
    //
    // Batch 13, commit 3: the sixteen cards `docs/final-audit-v2.md` §6.1–6.2
    // named as collapsible-but-weren't. Six files, and the count is smaller than
    // the number of cards for a reason worth stating: Settings holds ELEVEN of
    // them in one view, and the other five each render their own `Card` inside
    // their own component, so the edit lands where the card already was rather
    // than wrapping five of them in a parent. `CorrelationGrid.tsx`,
    // `ReportExport.tsx` and `AchievementsCard.tsx` are already on this list
    // from Batches 7 and 7k; these two are not, and the guard is what proved
    // it. `tests/batch11-collapse.test.ts` has been on the list since Batch 11.
    "src/components/LagAnalysisCard.tsx",
    "src/components/MonthlyYearlyStats.tsx",
    //
    // Batch 13, commit 4: `docs/PROJECT-INVENTORY.md`. The guard above diffs
    // `src tests public scripts`, so the DOCUMENT itself never appears here —
    // but the file that checks it does, and a new test file that no batch
    // claims is exactly the kind of thing that later goes stale in silence.
    // Worth noting how it got claimed: the guard passes on an UNTRACKED
    // file, because `git diff` does not list one, so the omission would not
    // have been caught until after the commit that introduced it.
    "tests/batch13-inventory.test.ts",
    //
    // A Batch 3 file, and on this list for a Batch 13 reason: one assertion in
    // it compared `getDate()` — the day OF THE MONTH — for a dose that wraps
    // across midnight, so on the last day of a month it demanded `31` of a
    // correct `1`. It expired on a date nobody scheduled. The file is named
    // here because the guard above diffs the working tree against the Batch 7
    // base, so any file this branch has touched has to be accounted for —
    // which is the guard working, not the guard being wrong.
    "tests/batch3.test.ts",
    //
    // Batch 13, commit 5: `tests/full-system.test.ts` — the fifteen
    // end-to-end journeys. Claimed for the same reason as the three above,
    // and for one more: a 900-line test file that fakes `localStorage`,
    // `fetch`, `matchMedia` and `Notification` is the single largest thing
    // in the suite to drift away from the app, because it fakes so little
    // that nothing about it shouts when the module it exercises changes
    // shape. `src/lib/weather.ts` is already on this list from Batch 8b; the
    // geocode-miss fix below touched no new file.
    "tests/full-system.test.ts",
  ];

  test("the file list is stated here, where a later batch can find it", () => {
    // Batch 6's scoping guard asks "is this file claimed by any batch?" and
    // answers by looking for a test that NAMES the file. Without this literal
    // that question has no answer, and Batch 6 fails on Batch 7's own work.
    const src = readFileSync(new URL("./batch7.test.ts", import.meta.url), "utf8");
    for (const f of BATCH_7_FILES) expect(src).toContain(`"${f}"`);
  });

  test("the list is the truth: no Batch 7 file is outside it", () => {
    // Guards the guard. Scoped as "the base commit plus everything Batch 7 has
    // touched since", computed from the base and the working tree — NOT from
    // HEAD~1, which silently changes meaning as the batch grows a third commit
    // and would compare the wrong pair of trees.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const base = execSync(
      "git log --format=%H --diff-filter=A -- src/lib/iconsets.ts",
      { encoding: "utf8" },
    )
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean)
      .pop()!;
    // Premise check, before the guard judges anything: the guard diffs from
    // base^, so it needs a pre-batch tree of THIS project — src/index.tsx in
    // base^ (and a base^ to diff from at all: a depth-1 clone has neither).
    // This repository was IMPORTED (shipped as a ZIP, squashed into one
    // add-everything commit on top of an unrelated upload commit), so base^
    // predates src/ entirely and base..working-tree is the whole project, not
    // Batch 7's work. Guarding against that list would prove nothing, so the
    // guard stands down; on any normally-built history this block is inert.
    try {
      execSync(`git rev-parse --verify --quiet ${base}^`, {
        stdio: ["ignore", "ignore", "ignore"],
      });
      execSync(`git cat-file -e ${base}^:src/index.tsx`, {
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch {
      return;
    }
    const changed = execSync(
      `git diff --name-only ${base}^ -- src tests public scripts`,
      { encoding: "utf8" },
    )
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean);
    for (const f of changed) {
      // The 76 vendored SVGs WERE covered by a PATTERN rather than 76 lines of
      // list. Batch 7b deleted the directory they matched, so the pattern was
      // removed rather than left as a loophole: it can no longer match
      // anything, and a pattern that matches nothing hides a stray re-vendor.
      // "no icon-set artwork is left on disk" above is the check that replaced
      // it.
      // Same argument for the twelve vendored woff2 files and their five OFL
      // texts: they are re-derived from a pinned registry by
      // `bun scripts/vendor-fonts.ts`, and both the vendor script and
      // `tests/batch5-typography.test.ts` check them against
      // `src/lib/fonts.ts`. Enumerating filenames here would be a list
      // nobody maintains, and a re-vendor against a newer upstream revision
      // would fail the guard on work that is correct by construction.
      if (/^public\/fonts\/[A-Za-z0-9-]+\.woff2$/.test(f)) continue;
      // The PDF's subsetted TTFs and their licence are the second vendored
      // binary family in the repository, in their own directory, and the same
      // argument covers them: they are derived by
      // `bun scripts/subset-pdf-font.ts` from pinned upstream SHA-256s, so
      // naming each file here would be a list nobody maintains. The checks
      // that are NOT a list are the ones that matter — `tests/batch7i.test.ts`
      // pins the committed bytes, their sizes and their character map.
      //
      // They are NOT in `public/fonts/` and that is load-bearing: three tests
      // require that directory to hold exactly the UI registry, so a
      // withdrawn family's file cannot linger there by construction. Putting
      // them here instead is what keeps that guarantee true.
      if (/^public\/pdf-fonts\/[A-Za-z0-9.-]+$/.test(f)) continue;
      if (/^public\/fonts\/OFL-[a-z-]+\.txt$/.test(f)) continue;
      expect(BATCH_7_FILES, `${f} is not in the Batch 7 list`).toContain(f);
    }
  });

  test("no icon-set artwork is left on disk, and the licence file is", () => {
    // The pattern above skips `public/iconsets/<set>/<glyph>.svg`, and with
    // the artwork inlined that pattern can no longer match anything — which
    // would make it a loophole that hides a stray re-vendor. So the directory
    // is asserted empty of SVGs outright: after this batch, `public/iconsets/`
    // holds one file, the licence notice, and nothing that can be fetched.
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
    const root = new URL("../public/iconsets/", import.meta.url);
    const entries = readdirSync(root);
    for (const e of entries) {
      expect(statSync(new URL(e, root)).isDirectory(), `${e} is a directory`).toBe(false);
    }
    expect(entries.filter((f: string) => f.endsWith(".svg"))).toEqual([]);
    expect(entries).toContain("LICENSES.md");
  });

  test("the inlined module covers every stem the registry names", () => {
    // What replaced the on-disk check. The generator derives the module from
    // the two registries — the content glyphs and the nav rows, see `stemsFor`
    // in the vendor script — so this is the statement that the three still
    // agree, and the check that would fail if a glyph were added without
    // re-running `bun scripts/vendor-fluent-artwork.ts`.
    //
    // The nav rows joined the comparison in Batch 14: its Eszköztár row is the
    // first nav stem with no content glyph behind it (`briefcase`), and the
    // artwork it draws is the same artwork the nav asks for by stem.
    const { FLUENT_ARTWORK, fluentArtwork } =
      require("../src/lib/iconsets/fluent-artwork") as typeof import("../src/lib/iconsets/fluent-artwork");
    const stems = [...new Set([...setStems("fluent"), ...NAV_ICONS.map((row) => row.fluent)])];
    for (const stem of stems) {
      expect(fluentArtwork(stem), `${stem} has no artwork`).toBeDefined();
    }
    // And nothing in the module is unreachable from a registry, which would
    // be dead weight in the largest array in the bundle.
    expect(Object.keys(FLUENT_ARTWORK).sort()).toEqual([...stems].sort());
  });
});

describe("the new icons honour the set's contract", () => {
  test("every glyph icon is registered and reachable", () => {
    for (const g of GLYPHS) {
      expect(ICONS).toHaveProperty(g.lucide);
    }
  });

  test("the registry grew additively — nothing was removed", () => {
    // Batch 5 shipped 66. The new ones bring it to 83; the original 66 must
    // all still be there, since other screens resolve them by name.
    for (const name of [
      "Activity", "Award", "Brain", "Compass", "Flame", "Music", "PillIcon",
      "Smile", "Sprout", "Target", "Wind", "X", "Zap",
    ]) {
      expect(getIcon(name)).not.toBeNull();
    }
  });
});
