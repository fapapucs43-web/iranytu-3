/**
 * Batch 8 (P13) — the typography swap.
 *
 * WHAT THIS FILE IS FOR
 * Batch 5's tests still own the invariants that did not change: self-hosting,
 * no CDN, latin+latin-ext, lazy loading, the store round-trip. This file owns
 * the ones that are new, and the ones a reviewer would otherwise have to take
 * on trust:
 *
 *   1. The swap actually happened — the two withdrawn families are gone from
 *      every layer, not just from the picker.
 *   2. The untouched default is STILL free. Batch 8 added four families and
 *      changed the default's label to "Ajánlott"; the load-bearing claim is
 *      that a user who never opens the picker still downloads zero font bytes
 *      and sees the same face they always saw.
 *   3. Dancing Script reaches the user's notes and NOTHING else. This is a
 *      scope guarantee about which elements name a CSS property, and a scope
 *      guarantee is exactly the kind of thing that decays silently.
 *   4. A retired family is moved to its successor rather than thrown away.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  DEFAULT_FONT,
  DEFAULT_HAND_FONT,
  FONTS,
  HAND_FONTS,
  RETIRED_FONTS,
  RETIRED_FONT_REASONS,
  RETIRED_FONT_REPLACEMENT,
  SYSTEM_FONT_STACK,
  fontDef,
  fontStack,
  fontWeightKb,
  handFontDef,
  handStack,
  handWeightKb,
  isFontId,
  isHandFontId,
  normalizeFontFamily,
  normalizeHandFont,
  handPreloadHref,
  handFaceDescriptors,
  preloadHref,
} from "../src/lib/fonts";
import { DEFAULT_SETTINGS } from "../src/types";
import { t } from "../src/lib/i18n";
// The one list of "this family is not Google's to fetch": Lato is cut from the
// upstream TrueType by `scripts/subset-ui-fonts.ts`, which pins its own upstream
// by URL, size and SHA-256. Imported rather than re-typed, so the vendoring
// script, the subsetter and these guards cannot disagree about which files the
// vendor script is allowed to be silent about.
import { UPSTREAM_TTF, stemOf } from "../scripts/subset-ui-fonts";

/** Registry files the vendoring script does not fetch, and why. */
const SUBSETTER_OWNED = (): string[] =>
  [...FONTS, ...HAND_FONTS]
    .flatMap((f) => f.files.map((x) => x.file))
    .filter((file) => stemOf(file) !== null);

/* ------------------------------------------------------------------ */
/* 1. The swap happened                                              */
/* ------------------------------------------------------------------ */

/** Recursive file walk, so a guard cannot pass by only seeing `src/*.ts`. */
function walkFiles(dir: URL, visit: (path: URL, name: string) => void): void {
  for (const name of readdirSync(dir.pathname)) {
    const full = new URL(name + (name.includes(".") ? "" : "/"), dir);
    if (name.includes(".")) visit(full, name);
    else if (existsSync(full.pathname)) walkFiles(full, visit);
  }
}

/** Every text source file under a directory, as `{ path, text }`. */
function sourceFiles(root: string, exts: RegExp): { path: URL; name: string; text: string }[] {
  const out: { path: URL; name: string; text: string }[] = [];
  walkFiles(new URL(root, import.meta.url), (path, name) => {
    if (!exts.test(name)) return;
    out.push({ path, name, text: readFileSync(path, "utf8") });
  });
  return out;
}

/**
 * A `<link>`-shaped stub. `fonts-runtime` sets rel/as/type/crossOrigin/href and
 * a data attribute, so the stub has to answer all of them — a shim that is too
 * small fails with `link.setAttribute is not a function`, which reads like a
 * code bug rather than a test-harness one.
 */
type FakeLink = {
  tag: string;
  attrs: Record<string, string>;
  href: string;
  rel?: string;
  as?: string;
  type?: string;
  crossOrigin?: string;
  setAttribute: (k: string, v: string) => void;
};

function makeLink(tag: string): FakeLink {
  const el: FakeLink = {
    tag,
    attrs: {},
    href: "",
    setAttribute(k: string, v: string) {
      el.attrs[k] = v;
    },
  };
  return el;
}

/**
 * Install a document shim, hand back what a test needs to inspect, and always
 * take it away again.
 *
 * The teardown is the point, not the tidy-up. `bun test` runs every file in one
 * process, so a `globalThis.document` left behind by one test makes Batch 5's
 * "applying the font stack without a DOM is a no-op" fail — for a reason that
 * has nothing to do with the code under test. Every caller must `restore()`.
 */
function installDocument(): {
  links: FakeLink[];
  properties: Record<string, string>;
  restore: () => void;
} {
  const links: FakeLink[] = [];
  const properties: Record<string, string> = {};
  const g = globalThis as unknown as { document?: unknown };
  const had = "document" in g;
  g.document = {
    head: {
      appendChild: (el: FakeLink) => {
        links.push(el);
      },
    },
    documentElement: {
      style: {
        setProperty: (k: string, v: string) => {
          properties[k] = v;
        },
      },
    },
    querySelector: () => null,
    createElement: (tag: string): FakeLink => makeLink(tag),
  };
  return {
    links,
    properties,
    restore: () => {
      if (had) g.document = undefined;
      else delete g.document;
    },
  };
}

describe("Manrope and Plus Jakarta Sans are fully withdrawn", () => {
  test("neither is selectable any more", () => {
    for (const gone of RETIRED_FONTS) {
      expect(isFontId(gone)).toBe(false);
      expect(FONTS.some((f) => f.id === gone)).toBe(false);
      expect(HAND_FONTS.some((f) => f.id === gone)).toBe(false);
    }
  });

  test("no binary and no licence text survives on disk", () => {
    // A withdrawn family that is still in `public/` is dead weight in every
    // deploy, and worse: it is still a downloadable copy of a font the app no
    // longer offers, sitting in the app's own privacy promise.
    const dir = new URL("../public/fonts/", import.meta.url);
    const onDisk = readdirSync(dir.pathname);
    for (const name of onDisk) {
      for (const gone of ["manrope", "jakarta"]) {
        expect(name.toLowerCase().includes(gone)).toBe(false);
      }
    }
    // And the directory is exactly the registry plus nothing. Derived, so a
    // family added last is covered without a hand-kept list to forget — which
    // is how Lato's licence survived in that list for one batch after the
    // family itself was withdrawn, and how the withdrawal was caught.
    const wanted = new Set([
      ...[...FONTS, ...HAND_FONTS].flatMap((d) => d.files.map((f) => f.file)),
      ...[...FONTS, ...HAND_FONTS]
        .filter((d) => d.family !== null)
        .map((d) => `OFL-${d.family!.toLowerCase().replace(/ /g, "-")}.txt`),
    ]);
    expect(new Set(onDisk)).toEqual(wanted);
  });

  test("the retired list is exactly the two withdrawn families", () => {
    // NOT `for (const gone of RETIRED_FONTS)`. An emptied list would make that
    // loop vacuously pass while `normalizeFontFamily("manrope")` quietly
    // started resetting the setting to the system stack — the exact regression
    // this file exists to catch, passing green.
    //
    // Lato WAS on this list from Batch 7f to Batch 12, and it is the case that
    // makes the list a question rather than a verdict: it was retired for a
    // reason that turned out to be fixable (the shipped file could not render ő
    // or ű), and it went back into the picker the moment the subsetter could cut
    // it from the upstream TrueType. The two families still here are retired
    // because a different direction was chosen, not because anything was wrong
    // with the files.
    expect(RETIRED_FONTS).toEqual(["manrope", "plus-jakarta-sans"]);
    // And every retired id has something to say, because the toast that explains
    // the move is the only place the user finds out.
    for (const id of RETIRED_FONTS) {
      expect(RETIRED_FONT_REASONS[id], `${id} has no explanation`).toBeTruthy();
    }
  });

  test("no source file still names them outside the retirement notes", () => {
    // The legitimate mentions are documentation of the migration: the list of
    // retired ids, the reasons the announcement quotes, and the context that
    // explains why `normalizeFontFamily` is not a plain validity check. Since
    // the i18n round 16 finish, the announcement's copy itself lives in the
    // catalogue under `font.retiredReason.*`, so `i18n.ts` joins the notes —
    // as KEYS, not as a face any picker could render as available.
    // Everything else — a comment claiming a family is offered, a stale hint
    // string — is a lie a user would read in the picker.
    const hits = sourceFiles("../src/", /\.(ts|tsx|css)$/).filter((f) =>
      /manrope|plus-jakarta|Plus Jakarta/i.test(f.text),
    );
    expect(hits.map((f) => f.name).sort()).toEqual(["FontContext.tsx", "fonts.ts", "i18n.ts"].sort());
    // And in each, the mention is a comment, an id list, a key in the reasons
    // map, or the catalogue key that now carries the announcement — never a
    // label the picker could render as an available face.
    for (const file of hits) {
      for (const line of file.text.split("\n")) {
        if (!/manrope|plus-jakarta|Plus Jakarta/i.test(line)) continue;
        const trimmed = line.trim();
        const isComment =
          trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/**");
        const isIdList = /"(manrope|plus-jakarta-sans)"/.test(line);
        const isReasonKey = /^\s*(manrope|"plus-jakarta-sans"):/.test(line);
        const isRetiredReasonKey = /^"font\.retiredReason\.(manrope|plusJakartaSans)":/.test(
          trimmed,
        );
        expect(
          isComment || isIdList || isReasonKey || isRetiredReasonKey,
          `${file.name}: ${trimmed}`,
        ).toBe(true);
      }
    }
  });

  test("Lato is BACK, and it is back verified rather than trusted", () => {
    // The inverse of the test this replaces. For four batches the assertion was
    // that nothing named Lato survived in `public/fonts/`; since Batch 12 the
    // interesting question is the opposite one — that the family is offered AND
    // that its binaries can spell Hungarian, which is the whole reason it was
    // withdrawn the first time.
    //
    // The withdrawal was not a verdict about the typeface. It was a fact about a
    // file: Google's `latin-ext` of Lato is the Central-European cut and omits ő
    // and ű. `scripts/subset-ui-fonts.ts` now cuts the family from the upstream
    // TrueType, pinned by URL, byte count and SHA-256, and refuses to write a
    // `latin-ext` that cannot spell őűŐŰ.
    const dir = new URL("../public/fonts/", import.meta.url);
    const onDisk = readdirSync(dir.pathname).filter((n) => n.toLowerCase().includes("lato"));
    expect(onDisk.sort()).toEqual([
      "OFL-lato.txt",
      "lato-400-latin-ext.woff2",
      "lato-400-latin.woff2",
      "lato-700-latin-ext.woff2",
      "lato-700-latin.woff2",
    ]);
    expect(isFontId("lato")).toBe(true);
    expect(fontDef("lato").family).toBe("Lato");
    // A user who had Lato stored before the withdrawal gets the family back with
    // no migration and no announcement: `isFontId` is asked before the retired
    // list, and `lato` is no longer on that list either.
    expect(normalizeFontFamily("lato")).toBe("lato");
    expect(RETIRED_FONT_REPLACEMENT).toBe("inter");
  });
});

/* ------------------------------------------------------------------ */
/* 2. The new families, and the untouched default                     */
/* ------------------------------------------------------------------ */

describe("the replacement families are really there", () => {
  test("every UI family plus the system stack, in category order", () => {
    // Revised in Batch 7f: Lato was withdrawn and five families added, one for
    // each of the five kinds. The ORDER is the assertion worth having — it is
    // the order the picker renders, and it is what makes "four sans look alike"
    // visible as a fact about the first band rather than a feeling.
    //
    // Batch 12 puts Lato back, in the sans band and last in it, which makes that
    // band five faces rather than four. The claim the order carries — that the
    // picker groups by kind — is unchanged; the count in the comment above is
    // the thing that moved.
    expect(FONTS.map((f) => f.id)).toEqual([
      "system",
      "inter",
      "montserrat",
      "roboto",
      "lato",
      "playfair-display",
      "lora",
      "quicksand",
      "saira-condensed",
      "jetbrains-mono",
    ]);
  });

  test("every one of them covers ő and ű, the two letters latin-ext exists for", () => {
    // The picker sample is only a real test if the faces behind it can render
    // the diacritics. Declared in the unicode-range, and — the part that
    // catches a wrong subset — asserted per file, not per family.
    for (const f of [...FONTS, ...HAND_FONTS]) {
      if (f.family === null) continue;
      for (const file of f.files) {
        if (file.subset === "latin-ext") {
          expect(file.unicodeRange).toContain("U+0100-02BA");
        } else {
          expect(file.unicodeRange).not.toContain("U+0100-02BA");
        }
      }
    }
  });

  test("every family ships both subsets, and both are non-trivial in size", () => {
    // A 0-byte or stub subset would render ő in a fallback face and no test
    // that only reads the registry would notice.
    for (const f of [...FONTS, ...HAND_FONTS]) {
      if (f.family === null) continue;
      for (const file of f.files) {
        const path = new URL(file.file, new URL("../public/fonts/", import.meta.url));
        expect(existsSync(path.pathname)).toBe(true);
        const bytes = readFileSync(path.pathname);
        expect(bytes.length).toBeGreaterThan(1000);
        expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
        // The size the picker shows must be the real size.
        expect(file.bytes).toBe(bytes.length);
      }
    }
  });
});

describe("the default is Inter, and the cost is written down", () => {
  test("the stored default is Inter, not the system stack", () => {
    // Batch 8 chose `system` so untouched users downloaded nothing. Batch 7b
    // reversed that deliberately: the app now ships its own typeface instead of
    // inheriting whatever the OS picked, which is why it looked different on
    // every device. The reversal is asserted here so it cannot be undone by
    // accident — and the price is asserted with it, because "free" and
    // "130 kB" cannot both be the description of the same default.
    expect(DEFAULT_FONT).toBe("inter");
    expect(DEFAULT_SETTINGS.fontFamily).toBe("inter");
    expect(fontWeightKb(DEFAULT_FONT)).toBeGreaterThan(0);
    // The system stack survives as a real option, just not the default one.
    expect(FONTS.some((f) => f.id === "system")).toBe(true);
    expect(fontStack("system")).toBe(SYSTEM_FONT_STACK);
  });

  test("a stored `system` is moved to Inter once, on purpose", () => {
    // The one-time refresh. `system` used to BE the default, so a stored
    // `system` almost always means "never chose" rather than "chose this and
    // wants to keep it". A user who genuinely prefers it picks Rendszer again,
    // and that choice is then kept like any other.
    expect(normalizeFontFamily("system")).toBe("inter");
    // ...and it is a rewrite, not a removal: the id stays valid, so the picker
    // can still offer it.
    expect(isFontId("system")).toBe(true);
  });

  test("Inter is recommended, and only Inter", () => {
    const recommended = FONTS.filter((f) => f.recommended);
    expect(recommended.map((f) => f.id)).toEqual(["inter"]);
    // The badge must not say "default" anywhere. It is a suggestion, and the
    // storage layer does not agree with the word.
    const picker = readFileSync(
      new URL("../src/components/FontPicker.tsx", import.meta.url),
      "utf8",
    );
    // Round 12 moved the badge text into the catalogue too, so the word is
    // read from there and the wiring is asserted separately.
    expect(t("font.recommended")).toBe("Ajánlott");
    expect(picker).toContain('t("font.recommended")');
    expect(picker).not.toContain("Alapértelmezett");
    expect(picker).not.toContain(" alapértelmezett");
  });

  test("nothing in the shipped HTML preloads a font", () => {
    // The other half of "zero bytes by default": even a hint would be bytes.
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).not.toContain("preload");
    expect(html).not.toContain(".woff2");
  });

  test("the whole payload stays inside the lazy-loading bound", () => {
    // Sanity bound, not a budget — the point is that "we only download the one
    // you pick" stays true now that there are five families rather than three.
    const all = [...FONTS, ...HAND_FONTS].reduce((n, f) => n + handWeightKbSafe(f), 0);
    expect(all).toBeLessThan(512);
    expect(all).toBeGreaterThan(0);
  });
});

function handWeightKbSafe(f: { id: string; family: string | null }): number {
  if (f.family === null) return 0;
  return f.id in FONTS.map((x) => x.id)
    ? fontWeightKb(f.id)
    : handWeightKb(f.id as never);
}

/* ------------------------------------------------------------------ */
/* 3. Dancing Script reaches the notes and nothing else                */
/* ------------------------------------------------------------------ */

describe("Dancing Script is scoped to the user's own words", () => {
  test("it is not a UI font at all — structurally, not by convention", () => {
    expect(isFontId("dancing-script")).toBe(false);
    expect(FONTS.some((f) => f.id === "dancing-script")).toBe(false);
    // So `settings.fontFamily` cannot even hold it, which is stronger than any
    // rule at a call site.
    expect(isHandFontId("dancing-script")).toBe(true);
    expect(isHandFontId("lato")).toBe(false);
  });

  test("only the note elements name --hand-font", () => {
    // The whole scope guarantee is this: one class, and no others. If a later
    // batch adds a second, this test is the thing that has to be updated on
    // purpose rather than by accident.
    //
    // Comments are stripped first: a rule whose body merely MENTIONS the
    // property in prose is not a rule that uses it, and the comment attached
    // to `.journal-note` would otherwise be counted as its own selector.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const users: string[] = [];
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (body.includes("var(--hand-font)")) users.push(selector.trim());
    }
    expect(users).toEqual([".journal-note"]);
  });

  test("exactly the three note surfaces carry the class", () => {
    // Two textareas in JSX (today-note, edit-note) plus `.detail-note`, which
    // the stylesheet applies to the rendered note. Counting every mention in
    // `src` is what proves there is no fourth.
    const mentions = sourceFiles("../src/", /\.(ts|tsx|css)$/).filter((f) =>
      f.text.includes("journal-note"),
    );
    const total = mentions.reduce((n, f) => n + (f.text.match(/journal-note/g) ?? []).length, 0);
    // 2 classNames + the `.journal-note` rule and its comments in the CSS.
    expect(total).toBeGreaterThanOrEqual(2);
    const jsx = sourceFiles("../src/", /\.(tsx)$/).reduce(
      (n, f) => n + (f.text.match(/journal-note/g) ?? []).length,
      0,
    );
    expect(jsx).toBe(2);
  });

  test("no button, label or nav element opts in", () => {
    // Counted across the WHOLE of `src`, not against a hand-picked list. The
    // concrete failure this exists to prevent: `.text-area` is shared by
    // twelve form fields including the PIN pad, so tagging that class instead
    // of adding one would put a script face in the lock screen. Enumerating
    // the files to check is exactly the list that drifts; counting every
    // occurrence in the tree is not.
    const opted = sourceFiles("../src/", /\.(ts|tsx)$/).filter((f) =>
      f.text.includes("journal-note"),
    );
    // The two note textareas. `.detail-note` is applied by class from the
    // stylesheet, so it is not a JSX mention.
    expect(opted.map((f) => f.name).sort()).toEqual(["EntryDetail.tsx", "TodayView.tsx"]);
    for (const file of opted) {
      const count = (file.text.match(/journal-note/g) ?? []).length;
      expect(count, `${file.name} opts in ${count} times`).toBe(1);
    }
  });

  test("the rendered note keeps the label text intact", () => {
    // Trivially true today, and worth pinning: splitting a face off must never
    // come near the data.
    expect(handStack("dancing-script")).toContain("Dancing Script");
    expect(handStack("none")).toBeNull();
  });
});

describe("handwriting is off by default and costs nothing", () => {
  test("the stored default is `none`, with no binaries and no bytes", () => {
    expect(DEFAULT_HAND_FONT).toBe("none");
    expect(DEFAULT_SETTINGS.handFont).toBeUndefined();
    expect(handWeightKb("none")).toBe(0);
    expect(handPreloadHref("none")).toBeNull();
    expect(handFaceDescriptors("none")).toEqual([]);
  });

  test("with handwriting off, the notes take the selected UI family", () => {
    // Not the system stack: a user who chose Montserrat and left handwriting
    // off must still see their notes in Montserrat. Getting this wrong is a
    // silent, invisible bug, so it is worth a test rather than a comment.
    const { applyHandStack } = require("../src/lib/fonts-runtime") as typeof import("../src/lib/fonts-runtime");
    const doc = installDocument();
    try {
      applyHandStack("none", "montserrat");
      expect(doc.properties["--hand-font"]).toBe(fontStack("montserrat"));
      applyHandStack("dancing-script", "montserrat");
      expect(doc.properties["--hand-font"]).toContain("Dancing Script");
      // Going back to off must restore the UI face, not leave a stale script.
      applyHandStack("none", "montserrat");
      expect(doc.properties["--hand-font"]).toBe(fontStack("montserrat"));
    } finally {
      doc.restore();
    }
  });
});


describe("a retired family is moved to its successor, not discarded", () => {
  test("the successor is Inter", () => {
    expect(RETIRED_FONT_REPLACEMENT).toBe("inter");
  });

  test("each retired id normalises to Inter", () => {
    for (const gone of RETIRED_FONTS) {
      expect(normalizeFontFamily(gone)).toBe("inter");
      expect(isFontId(normalizeFontFamily(gone))).toBe(true);
    }
  });

  test("genuinely junk falls to the default", () => {
    // The distinction that matters: a value that was NEVER a family is junk
    // and takes the default; a value that WAS a family is honoured. Since
    // Batch 7b the default costs bytes, so this is no longer the free
    // outcome — it is the boring one, which is the point.
    for (const junk of ["comic-sans-ms", "", "INTER", "Inter ", 42, null, undefined, {}]) {
      expect(normalizeFontFamily(junk)).toBe(DEFAULT_FONT);
      expect(isFontId(normalizeFontFamily(junk))).toBe(true);
    }
  });

  test("a live id is never rewritten, except the one documented exception", () => {
    for (const f of FONTS) {
      if (f.id === "system") continue; // the Batch 7b one-time refresh
      expect(normalizeFontFamily(f.id)).toBe(f.id);
    }
    // And the exception is exactly one id, named, not "whatever we decided".
    expect(FONTS.filter((f) => normalizeFontFamily(f.id) !== f.id).map((f) => f.id)).toEqual([
      "system",
    ]);
  });

  test("a corrupt handFont is dropped, not defaulted into a download", () => {
    // `handFont` has no retired ids, so absent and invalid are the same thing:
    // handwriting off. Writing "none" explicitly would be harmless but would
    // mean a user's settings blob changes the first time anything touched it.
    for (const junk of ["dancing", "cursive", 7, null, {}]) {
      expect(normalizeHandFont(junk)).toBe("none");
      expect(handWeightKb(normalizeHandFont(junk))).toBe(0);
    }
    expect(normalizeHandFont("dancing-script")).toBe("dancing-script");
  });
});

/* ------------------------------------------------------------------ */
/* 5. The sample text                                                */
/* ------------------------------------------------------------------ */

describe("the picker sample", () => {
  const picker = readFileSync(
    new URL("../src/components/FontPicker.tsx", import.meta.url),
    "utf8",
  );
  // Round 12 moved the sample into the catalogue, so the guard reads the
  // resolved value rather than a regex over the source. That is strictly
  // stronger: it checks the sentence the reader is actually shown, and the
  // wiring test below is what ties it back to the picker.
  const sample = t("font.sample");

  test("is short", () => {
    expect(sample.length).toBeGreaterThan(0);
    expect(sample.length).toBeLessThanOrEqual(30);
  });

  test("carries BOTH ő and ű, the letters the latin-ext subset exists for", () => {
    // Both, not one. The previous sample, "Árvíztűrő tükörfúrógép", got this
    // right; the suggestion that replaced it, "Így őrzöm a naplóm.", did not —
    // it has ő and no ű, so it would have proved half the subset.
    expect(sample).toContain("ő");
    expect(sample).toContain("ű");
  });

  test("is not a pangram", () => {
    // The point of dropping the pangram: it is a linguistics artefact, not
    // something anyone writes, and its letter frequencies are unlike real
    // text — the opposite of what someone is judging when picking a face.
    expect(sample).not.toBe("Árvíztűrő tükörfúrógép");
    expect(sample).toMatch(/[a-záéíóöőúüű]/i);
    // Not every letter of the alphabet appearing.
    const letters = new Set(sample.toLowerCase().replace(/[^a-záéíóöőúüű]/gi, ""));
    expect(letters.size).toBeLessThan(20);
  });

  test("is a real Hungarian sentence, not a fragment", () => {
    expect(sample.endsWith(".")).toBe(true);
    expect(sample.split(" ").length).toBeGreaterThanOrEqual(4);
  });

  test("the picker previews the sample the catalogue holds", () => {
    // The wiring half of the move: the value above is only what the reader
    // sees if the picker's constants come from the catalogue and the hand
    // preview reuses the same sentence rather than repeating it.
    expect(picker).toContain('const SAMPLE = t("font.sample")');
    expect(picker).toContain('const SAMPLE_BOLD = t("font.sampleBold")');
    expect(picker).toContain("const HAND_SAMPLE = SAMPLE;");
  });

  test("the picker previews the face the notes would actually take", () => {
    // The "off" row has to show the UI family, or the handwriting control
    // would claim a face the notes do not get.
    expect(picker).toContain("f.stack ?? fontIdStack(fontId)");
  });
});

/* ------------------------------------------------------------------ */
/* 5b. The two groups stay two groups                                */
/* ------------------------------------------------------------------ */

describe("the script face is only ever offered in the handwriting group", () => {
  const render = (): string => {
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
    const FontPicker = (
      require("../src/components/FontPicker") as typeof import("../src/components/FontPicker")
    ).default;
    const { AppProvider } = require("../src/state/AppContext") as
      typeof import("../src/state/AppContext");
    const { FontProvider } = require("../src/state/FontContext") as
      typeof import("../src/state/FontContext");
    return renderToStaticMarkup(
      createElement(
        AppProvider,
        null,
        createElement(FontProvider, null, createElement(FontPicker, null)),
      ),
    );
  };

  test("Dancing Script appears in the handwriting group, not the UI one", () => {
    // The strongest available form of "a script face cannot be a UI font":
    // whatever the types say, the rendered picker puts the label in exactly one
    // of its two radiogroups, and it is the second one.
    const html = render();
    const uiStart = html.indexOf('aria-label="Betűtípus kiválasztása"');
    const handStart = html.indexOf('aria-label="Kézírásos betűtípus"');
    expect(uiStart).toBeGreaterThan(-1);
    expect(handStart).toBeGreaterThan(uiStart);
    const uiGroup = html.slice(uiStart, handStart);
    const handGroup = html.slice(handStart);
    expect(handGroup).toContain("Dancing Script");
    expect(uiGroup).not.toContain("Dancing Script");
    for (const f of FONTS) expect(uiGroup).toContain(f.label);
  });

  test("the UI group has exactly one radio per UI family", () => {
    const html = render();
    const uiGroup = html.slice(
      html.indexOf('aria-label="Betűtípus kiválasztása"'),
      html.indexOf('aria-label="Kézírásos betűtípus"'),
    );
    expect((uiGroup.match(/role="radio"/g) ?? []).length).toBe(FONTS.length);
    const handGroup = html.slice(html.indexOf('aria-label="Kézírásos betűtípus"'));
    expect((handGroup.match(/role="radio"/g) ?? []).length).toBe(HAND_FONTS.length);
  });
});

/* ------------------------------------------------------------------ */
/* 6. The picker renders                                              */
/* ------------------------------------------------------------------ */

describe("the picker", () => {
  test("offers every UI family and both handwriting options", () => {
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
    const pickerModule = require("../src/components/FontPicker") as
      typeof import("../src/components/FontPicker");
    const FontPicker = pickerModule.default;
    const { AppProvider } = require("../src/state/AppContext") as
      typeof import("../src/state/AppContext");
    const { FontProvider } = require("../src/state/FontContext") as
      typeof import("../src/state/FontContext");

    const html = renderToStaticMarkup(
      createElement(
        AppProvider,
        null,
        createElement(FontProvider, null, createElement(FontPicker, null)),
      ),
    );
    for (const f of [...FONTS, ...HAND_FONTS]) {
      expect(html).toContain(f.label);
    }
    // Two groups, because they are two different questions.
    expect(html).toContain('aria-label="Betűtípus kiválasztása"');
    expect(html).toContain('aria-label="Kézírásos betűtípus"');
    // The system option still claims zero.
    expect(html).toContain("nincs letöltés");
    // And the self-hosting promise is still stated.
    expect(html).toContain("nem");
  });

  test("handFontDef falls back to `none` for anything unknown", () => {
    expect(handFontDef("cursive").id).toBe("none");
    expect(handFontDef(undefined).id).toBe("none");
  });
});

/* ------------------------------------------------------------------ */
/* 7. Nothing regressed on the load path                              */
/* ------------------------------------------------------------------ */

describe("the two preloads stay independent", () => {
  test("each family hints its own single latin 400 file", () => {
    // One shared hint slot would mean whichever link landed first suppressed
    // the other, so a user who picks Montserrat AND handwriting would get one
    // of the two hinted at random.
    for (const f of FONTS) {
      const href = preloadHref(f.id);
      if (href) expect(href).toContain("latin");
    }
    expect(handPreloadHref("dancing-script")).toBe("/fonts/dancing-script-latin.woff2");
    expect(handPreloadHref("none")).toBeNull();
  });

  test("Saira Condensed hints Regular, not Bold", () => {
    expect(preloadHref("saira-condensed")).toBe("/fonts/saira-condensed-400-latin.woff2");
  });

  test("the runtime is inert without a DOM", () => {
    const { loadFont, loadHandFont, resetFontCache } =
      require("../src/lib/fonts-runtime") as typeof import("../src/lib/fonts-runtime");
    resetFontCache();
    return Promise.all([loadFont("system"), loadHandFont("none")]).then(() => {
      resetFontCache();
    });
  });

  test("each family gets its OWN preload hint, in its own slot", () => {
    // One shared slot would mean whichever `<link>` landed first suppressed the
    // other — a user who picks Montserrat AND handwriting would get one of the
    // two hinted at random, which is invisible until they are on a slow
    // connection. Asserted by running the real functions, so a rename of the
    // slot string is fine but a collapse to one slot is not.
    const { preloadFont, preloadHandFont } =
      require("../src/lib/fonts-runtime") as typeof import("../src/lib/fonts-runtime");
    const doc = installDocument();
    try {
      preloadFont("montserrat");
      preloadHandFont("dancing-script");
      expect(doc.links).toHaveLength(2);
      expect(doc.links.map((l) => l.attrs["data-font-preload"])).toEqual(["app", "hand"]);
      expect(doc.links[0]!.href).toBe("/fonts/montserrat-latin.woff2");
      expect(doc.links[1]!.href).toBe("/fonts/dancing-script-latin.woff2");
    } finally {
      doc.restore();
    }
  });
});

describe("still self-hosted", () => {
  test("no source file references an external font origin", () => {
    const offenders: string[] = [];
    // Comments are stripped first. `lib/fonts.ts` NAMES fonts.googleapis.com in
    // the paragraph explaining why it is never called, and Batch 5 has a test
    // requiring exactly that rationale to be documented where the decision is
    // made. Stripping prose and scanning CODE is what makes the two consistent
    // instead of contradictory.
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const check = (name: string, text: string) => {
      if (/fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny|jsdelivr|unpkg|cdnjs/i.test(strip(text))) {
        offenders.push(name);
      }
    };
    const roots = ["../src/", "../public/"];
    for (const root of roots) {
      for (const file of sourceFiles(root, /\.(ts|tsx|css|html|js)$/)) {
        check(file.name, file.text);
      }
    }
    check("index.html", readFileSync(new URL("../index.html", import.meta.url), "utf8"));
    expect(offenders).toEqual([]);
  });

  test("the service worker still caches /fonts/ cache-first", () => {
    // The rule is a path prefix, so it already covers the new files; Batch 8
    // changes no sw.js behaviour. Asserting it here means a future edit that
    // breaks offline fonts has to be deliberate.
    const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    expect(sw).toContain('url.pathname.startsWith("/fonts/")');
  });
});

/* ------------------------------------------------------------------ */
/* 9. The registry and the directory agree                             */
/* ------------------------------------------------------------------ */

describe("the vendoring script and the registry agree", () => {
  const script = readFileSync(
    new URL("../scripts/vendor-fonts.ts", import.meta.url),
    "utf8",
  );

  test("every binary the registry asks for has a pinned source", () => {
    // Two owners, and this test is what keeps them both honest. A Google-subset
    // file has to be named in this script's SOURCES table, because that is where
    // its URL lives. A file cut from an upstream TrueType is named HERE INSTEAD —
    // in the subsetter's `UPSTREAM_TTF`, pinned by URL, byte count and SHA-256 —
    // so "not in SOURCES" is a decision with a name attached rather than a gap.
    const subsetterOwned = SUBSETTER_OWNED();
    for (const f of [...FONTS, ...HAND_FONTS]) {
      for (const file of f.files) {
        if (stemOf(file.file)) {
          expect(Object.keys(UPSTREAM_TTF), `${file.file} is cut from an unlisted upstream`).toContain(
            stemOf(file.file),
          );
          continue;
        }
        expect(script).toContain(`"${file.file}"`);
      }
    }
    // ...and the two sets do not overlap, so no file has two owners or none.
    expect(subsetterOwned.length).toBeGreaterThan(0);
    for (const file of subsetterOwned) {
      expect(script, `${file} is both vendored and cut from upstream`).not.toContain(`"${file}":`);
    }
  });

  test("the script sources exactly the registry, no more and no less", () => {
    // A stale key in SOURCES is a file the script would happily re-download on
    // every run, and then leave in the directory for ever — a withdrawn
    // family's binaries creeping back one `bun scripts/vendor-fonts.ts` at a
    // time. The registry is the truth; the script must not know a filename the
    // registry does not ask for.
    //
    // Scoped to the SOURCES table rather than counting every woff2 key in the
    // file. Batch 7i added a second table — `UPSTREAM_BYTES`, the size each
    // Google download must be, which is a different fact from the size the
    // registry serves — and a whole-file count reported 40 where the registry
    // asked for 20. The check was right and the extraction was too blunt.
    const table = script.slice(
      script.indexOf("const SOURCES"),
      script.indexOf("\n};", script.indexOf("const SOURCES")),
    );
    const sources = table.match(/^  "([^"]+\.woff2)":/gm) ?? [];
    expect(sources.length).toBeGreaterThan(0);
    const wanted = new Set(
      [...FONTS, ...HAND_FONTS].flatMap((f) => f.files.map((x) => x.file)),
    );
    for (const line of sources) {
      const file = line.match(/"([^"]+\.woff2)"/)![1];
      expect(wanted.has(file), `scripts/vendor-fonts.ts sources ${file}, which no registry entry asks for`).toBe(true);
    }
    // Twenty Google-subsets plus, since Batch 12, the Lato files this script
    // deliberately does not fetch — they are cut from the upstream TrueType by
    // the subsetter, which owns their pin. The count is derived from the same
    // `stemOf` the script uses, so adding a family in either place moves it.
    expect(sources.length).toBe(wanted.size - SUBSETTER_OWNED().length);
  });

  test("every upstream size is pinned, and each one is a fact about the fetch", () => {
    // Batch 7i split two numbers that used to be one. `UPSTREAM_BYTES` is what
    // the download must be; `FontFile.bytes` is what the app serves, which
    // since then is a CUT of the download. A file with no pinned upstream size
    // would be fetched and only checked for woff2 magic; a stale entry would
    // name a file the registry no longer asks for. Both are silent otherwise.
    const start = script.indexOf("const UPSTREAM_BYTES");
    expect(start, "the upstream size table is gone").toBeGreaterThan(-1);
    const table = script.slice(start, script.indexOf("\n};", start));
    const pinned = table.match(/^  "([^"]+\.woff2)":\s*(\d+),/gm) ?? [];
    const wanted = [...FONTS, ...HAND_FONTS].flatMap((f) => f.files.map((x) => x.file));
    const servedBytes = (file: string): number =>
      [...FONTS, ...HAND_FONTS].flatMap((f) => f.files).find((f) => f.file === file)!.bytes;
    // Every file this script fetches is pinned here; every file it does not
    // fetch is pinned in the subsetter's `UPSTREAM_TTF`, with a URL and a
    // SHA-256 as well as a size. Both halves are checked, so "not fetched here"
    // never quietly becomes "not pinned anywhere".
    expect(pinned.length).toBe(wanted.length - SUBSETTER_OWNED().length);
    for (const line of pinned) {
      const [, file, bytes] = line.match(/"([^"]+\.woff2)":\s*(\d+),/)!;
      expect(wanted, `${file} is pinned upstream but no registry entry asks for it`).toContain(file);
      // The pin is a real size, and it is not the size now served: if the two
      // ever match again the subsetting has silently stopped happening.
      expect(Number(bytes)).toBeGreaterThan(1000);
      expect(Number(bytes), `${file} is the same size upstream and served — not cut`).toBeGreaterThan(
        servedBytes(file),
      );
    }
    for (const file of SUBSETTER_OWNED()) {
      const stem = stemOf(file)!;
      const upstream = UPSTREAM_TTF[stem]!;
      expect(upstream.bytes, `${file}: no pinned upstream size`).toBeGreaterThan(1000);
      expect(
        upstream.bytes,
        `${file} is the same size upstream and served — not cut`,
      ).toBeGreaterThan(servedBytes(file));
      // The pin that makes this family safe to offer at all.
      expect(upstream.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(upstream.url).toContain("Lato");
    }
  });

  test("no source in the script is for a file the registry dropped", () => {
    // Otherwise a withdrawn family could be re-fetched by a re-run, which is
    // how a "removed" family comes back.
    for (const gone of ["manrope", "jakarta"]) {
      expect(script.toLowerCase().includes(gone)).toBe(false);
    }
  });

  test("it verifies woff2 rather than trusting a 200", () => {
    // A 200 that is actually an error page, written into the app, 404s at
    // runtime and offline.
    expect(script).toContain("wOF2");
    expect(script).toContain("res.ok");
  });
});
