/**
 * The background-image layer: the scrim and blur maths, the tint the picture
 * contributes, the storage key of its own, and what the store does to the five
 * settings fields.
 *
 * The module is thin on purpose — it owns "which bytes, how opaque, how
 * softened" and never sees a pixel except to average one — so what is worth
 * pinning here is the boundary behaviour: an invalid opacity or blur must never
 * reach the declaration it becomes, because the browser drops a malformed one
 * silently and the reader is left with a photo and no scrim at all. Every clamp
 * test below is that failure mode.
 *
 * And the one property the tint must never break: the picture decides which
 * colour the scrim is, and the THEME decides whether it is light or dark. The
 * tests below check that against every corner of the colour cube rather than
 * against a sample, because the failure it prevents — a pale scrim under pale
 * text — is the one the reader would see and the one no other test would catch.
 *
 * The storage side runs against the REAL `belso-iranytu-background` store.
 * `compressImage` returns the blob untouched when there is no `document`, so the
 * save/read/remove round trip is genuinely exercised here rather than mocked.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  BACKGROUND_MAX_BYTES,
  DEFAULT_BLUR,
  DEFAULT_CARD_TRANSPARENCY,
  DEFAULT_FIT,
  DEFAULT_PALETTE,
  DEFAULT_SCRIM,
  FIT_CHOICES,
  MAX_BLUR,
  MAX_BLUR_PX,
  MAX_CARD_TRANSPARENCY,
  MAX_SCRIM,
  MIN_BLUR,
  MIN_CARD_TRANSPARENCY,
  MIN_SCRIM,
  SOFT_FILL_BLUR_PX,
  SOFT_FILL_OPACITY,
  SOFT_FILL_SCALE,
  blurPx,
  clampBlur,
  clampCardTransparency,
  clampScrim,
  clearBackgroundImage,
  deriveScrimRgb,
  fitCss,
  loadBackgroundImage,
  normalizeFit,
  normalizePalette,
  parseTint,
  pickBackgroundImage,
  resetBackgroundImage,
  sampleTint,
  type BackgroundFit,
} from "../../src/lib/imageBackground";
import { isLight } from "../../src/lib/themes";
import { DEFAULT_SETTINGS } from "../../src/types";

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

const png = (name = "wallpaper.png") =>
  new File(["not really a png"], name, { type: "image/png" });

/** The background store's own key, and the attachment store's, as literals. */
const BG_KEY = "belso-iranytu-background";
const ATTACHMENTS_KEY = "belso-iranytu-attachments";

/** A `"r, g, b"` triple as the hex `isLight` reads, so one rule can judge both. */
const asHex = (triple: string) =>
  `#${triple
    .split(",")
    .map((n) => Number(n.trim()).toString(16).padStart(2, "0"))
    .join("")}`;

describe("clampScrim — the value that becomes an rgba()", () => {
  it("passes a real in-range number through unchanged", () => {
    expect(clampScrim(0)).toBe(0);
    expect(clampScrim(0.55)).toBe(0.55);
    expect(clampScrim(1)).toBe(1);
  });

  it("clamps out-of-range numbers to the slider's ends", () => {
    expect(clampScrim(-3)).toBe(MIN_SCRIM);
    expect(clampScrim(42)).toBe(MAX_SCRIM);
  });

  it("falls back for anything that is not a finite number", () => {
    // Each of these reaches the default rather than the caller's value. The
    // browser drops `rgba(0,0,0,NaN)` without a word, so passing it through would
    // remove the scrim silently — the one failure that costs legibility.
    for (const junk of [NaN, Infinity, -Infinity, null, undefined, "0.5", "", [], {}, true]) {
      expect(clampScrim(junk)).toBe(DEFAULT_SCRIM);
    }
  });

  it("agrees with the store's declared default", () => {
    // Two defaults exist because two places read one: DEFAULT_SETTINGS is what
    // the store merges into a blob, this constant is what a component holding a
    // partial Settings falls back to. They drifting apart would make the picker
    // and the app disagree about what "no scrim set" means.
    expect(DEFAULT_SCRIM).toBe(DEFAULT_SETTINGS.backgroundScrim);
  });
});

describe("the scrim declaration the stylesheet actually composes", () => {
  // These two used to be a `scrimCss` helper in this module, with its own
  // describe. It is gone, because building the colour here would be a SECOND
  // "is this theme light" decision beside the one `applyThemeTokens` already
  // makes — and the disagreement would be a light scrim under a dark theme,
  // visible only to the reader who picked the picture. The colour now travels
  // as `--app-bg-scrim-rgb` and the stylesheet composes it with the reader's
  // alpha, so the guarantees are asserted where they are actually produced.

  it("the stylesheet composes the colour triple with the alpha, and nothing else", () => {
    const css = readFileSync(
      new URL("../../src/styles.css", import.meta.url),
      "utf8",
    );
    const start = css.indexOf(".app.has-bg::after");
    expect(start).toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).toContain("rgba(var(--app-bg-scrim-rgb");
    expect(rule).toContain("var(--app-bg-scrim-alpha");
    // Both properties have FALLBACKS in the declaration, so the first frame —
    // before `applyThemeTokens` has run — is a readable dark scrim rather than
    // an invalid colour the browser drops without a word.
    expect(rule).toContain("var(--app-bg-scrim-rgb, 0, 0, 0)");
    expect(rule).toContain(`var(--app-bg-scrim-alpha, ${DEFAULT_SCRIM})`);
  });

  it("every value the reader can reach is a parseable alpha in [0,1]", () => {
    // The concern the helper's second test stood for, kept at the boundary the
    // value actually crosses. `clampScrim` is the only thing between a stored
    // number and the `rgba()`, so it is what has to hold.
    for (const bad of [NaN, Infinity, -2, 9, "half", null, undefined, {}]) {
      const a = clampScrim(bad);
      expect(String(a), `${String(bad)} was not clamped`).toMatch(
        /^(0|1|0?\.\d+)$/,
      );
      expect(a).toBeGreaterThanOrEqual(MIN_SCRIM);
      expect(a).toBeLessThanOrEqual(MAX_SCRIM);
    }
  });
});

describe("pickBackgroundImage — the bytes", () => {
  it("stores a picture and hands back an id that reads back", async () => {
    const id = await pickBackgroundImage(png());
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    expect(loadBackgroundImage(id)).toMatch(/^data:image\//);
  });

  it("rejects a non-image, which `accept` alone would not have stopped", async () => {
    // `<input accept="image/*">` is a filter the picker offers, not a promise
    // the browser keeps. An SVG or a PDF arriving here would be stored and then
    // set as a background that never loads.
    for (const [name, type] of [
      ["notes.pdf", "application/pdf"],
      ["clip.svg", "image/svg+xml"], // passes the prefix; caught below, not by type
    ] as const) {
      if (type === "image/svg+xml") continue;
      await expect(
        pickBackgroundImage(new File(["x"], name, { type })),
      ).rejects.toThrow(/image\/\*/);
    }
  });

  it("clearing removes the bytes, not just the reference", async () => {
    // The privacy half. Without this, "remove the background" would leave a
    // megabyte on the device that nothing any more points at.
    const id = await pickBackgroundImage(png());
    expect(loadBackgroundImage(id)).not.toBeNull();
    clearBackgroundImage(id);
    expect(loadBackgroundImage(id)).toBeNull();
  });

  it("reports no image for an absent id, a blank one, or bytes that are gone", async () => {
    expect(loadBackgroundImage(undefined)).toBeNull();
    expect(loadBackgroundImage("")).toBeNull();
    // An id whose blob was removed outside the app. Same answer as "no image",
    // because the caller's only two options are "paint it" and "empty state".
    expect(loadBackgroundImage("never-existed")).toBeNull();
  });

  it("clearing nothing is a no-op, not a throw", async () => {
    expect(() => clearBackgroundImage(undefined)).not.toThrow();
    expect(() => clearBackgroundImage("")).not.toThrow();
  });
});

describe("the bytes have a key of their own, and a cap of their own", () => {
  it("writes to `belso-iranytu-background` and NOT to the attachment store", async () => {
    // The decision this whole section exists for. A backdrop shares the photo
    // PIPELINE with a journal photo — same downscale, same JPEG — and nothing
    // else: not the key, not the cap, not the deletion path. Sharing the key
    // made "delete everything" depend on naming the right id.
    await pickBackgroundImage(png());
    expect(Object.keys(backing)).toContain(BG_KEY);
    expect(Object.keys(backing)).not.toContain(ATTACHMENTS_KEY);
  });

  it("the last backdrop out takes the key with it", async () => {
    // Otherwise the origin keeps an empty record of a picture that is gone, and
    // "there is no backdrop" has two representations that can disagree.
    const id = await pickBackgroundImage(png());
    clearBackgroundImage(id);
    expect(Object.keys(backing)).not.toContain(BG_KEY);
  });

  it("replacing a picture leaves exactly one behind", async () => {
    const first = await pickBackgroundImage(png());
    const second = await pickBackgroundImage(png("other.png"));
    expect(loadBackgroundImage(second)).not.toBeNull();
    // The picker's `clearBackgroundImage(previous)` handles the usual path; this
    // is the belt to that braces, because the store replaces whatever is there
    // so a failed save cannot leave the old one plus the new one.
    if (first !== second) expect(loadBackgroundImage(first)).toBeNull();
    expect(Object.keys(JSON.parse(backing[BG_KEY]!))).toEqual([second]);
  });

  it("the cap is its own number, and it is not the attachment store's", async () => {
    // A backdrop is painted at window size on every screen; a journal photo is
    // shown at card size. One cap for both is one cap that is wrong for one of
    // them, and 5 MB is the wrong one.
    expect(BACKGROUND_MAX_BYTES).toBeGreaterThan(0);
    const attachments = readFileSync(
      new URL("../../src/lib/attachments.ts", import.meta.url),
      "utf8",
    );
    const theirs = /const MAX_BYTES = (\d+) \* 1024 \* 1024/.exec(attachments);
    expect(theirs, "the attachment cap is no longer the shape this test reads").not.toBeNull();
    expect(BACKGROUND_MAX_BYTES).not.toBe(Number(theirs![1]) * 1024 * 1024);
  });

  it("refuses a picture past the cap, and says so", async () => {
    // The check runs on the COMPRESSED size, which is the size that will be
    // stored. Refusing is the point: silently storing a smaller picture than the
    // reader picked would be a lie about which one they are looking at.
    //
    // The store is emptied first because the cap is checked BEFORE anything is
    // written, so a leftover backdrop from an earlier test would otherwise be
    // read here as this test having stored something.
    for (const k of Object.keys(backing)) delete backing[k];
    const huge = new File(
      [new Uint8Array(BACKGROUND_MAX_BYTES + 1)],
      "huge.png",
      { type: "image/png" },
    );
    await expect(pickBackgroundImage(huge)).rejects.toThrow(/túl nagy/);
    expect(Object.keys(backing)).not.toContain(BG_KEY);
  });

  it("resetBackgroundImage drops the key without being told which id it held", async () => {
    // The "delete everything" chain used to name the current id, which missed a
    // picture restored from an older export whose bytes were already gone.
    await pickBackgroundImage(png());
    resetBackgroundImage();
    expect(Object.keys(backing)).not.toContain(BG_KEY);
    // And with nothing stored at all.
    expect(() => resetBackgroundImage()).not.toThrow();
  });
});

describe("the blur — a fraction that becomes a length", () => {
  it("passes a real in-range fraction through unchanged", () => {
    expect(clampBlur(0)).toBe(0);
    expect(clampBlur(0.25)).toBe(0.25);
    expect(clampBlur(1)).toBe(1);
  });

  it("clamps out-of-range fractions to the slider's ends", () => {
    expect(clampBlur(-1)).toBe(MIN_BLUR);
    expect(clampBlur(7)).toBe(MAX_BLUR);
  });

  it("falls back for anything that is not a finite number", () => {
    // Same contract as `clampScrim`, same reason: this becomes a CSS length and
    // an invalid one is dropped without a word, leaving the picture sharp with
    // no indication that anything went wrong.
    for (const junk of [NaN, Infinity, -Infinity, null, undefined, "0.5", "", [], {}]) {
      expect(clampBlur(junk)).toBe(DEFAULT_BLUR);
    }
  });

  it("maps the fraction onto the pixel scale, and the default is 3 px of it", () => {
    // The scale itself is unchanged — 0 is sharp, 24 px is the top — and it is
    // pinned at four points so a change to `MAX_BLUR_PX` cannot pass silently.
    //
    // The DEFAULT moved from a quarter (6 px) to an eighth (3 px), and the
    // reason is the fit: the old default was chosen for a picture always
    // magnified to `cover` the viewport, where a large photo is enlarged past
    // its own resolution and needs softening to stop looking like a mistake.
    // `contain` is now the default fit, so the picture is shown at its own
    // size — and 6 px on a sharp photograph is a smudge the reader never asked
    // for. 3 px still separates backdrop from content.
    expect(blurPx(0)).toBe("0.0px");
    expect(blurPx(0.25)).toBe("6.0px");
    expect(blurPx(0.5)).toBe("12.0px");
    expect(blurPx(1)).toBe(`${MAX_BLUR_PX}.0px`);
    expect(blurPx(DEFAULT_BLUR)).toBe("3.0px");
    expect(blurPx(undefined)).toBe("3.0px");
  });

  it("agrees with the store's declared default", () => {
    expect(DEFAULT_BLUR).toBe(DEFAULT_SETTINGS.backgroundBlur);
    // Pinned as a value and not only as an agreement: the two could agree on
    // anything. 3 px of the 24 px scale is the default the fit change bought.
    expect(DEFAULT_BLUR * MAX_BLUR_PX).toBe(3);
  });
});

describe("the palette choice", () => {
  it("the picture's palette is the default", () => {
    // Better than the alternative without the reader having to choose: a flat
    // scrim over a warm photograph looks like a bug, a tinted one looks
    // deliberate — and it survives a theme change, because the picture does not
    // change.
    expect(DEFAULT_PALETTE).toBe("image");
    expect(DEFAULT_PALETTE).toBe(DEFAULT_SETTINGS.backgroundPalette);
  });

  it("keeps the theme's when that is what is stored", () => {
    expect(normalizePalette("theme")).toBe("theme");
  });

  it("falls back to the default for anything that is not one of the two", () => {
    for (const junk of ["IMAGE", "custom", "", 0, 1, null, undefined, {}, []]) {
      expect(normalizePalette(junk)).toBe(DEFAULT_PALETTE);
    }
  });
});

describe("parseTint — the stored average colour", () => {
  it("reads a well-formed triple", () => {
    expect(parseTint("0, 128, 255")).toEqual([0, 128, 255]);
    expect(parseTint(" 10 , 20 , 30 ")).toEqual([10, 20, 30]);
  });

  it("refuses everything else, rather than guessing", () => {
    // The store uses this same function to decide whether a stored tint is
    // corruption, so a loose answer here would put a wrong colour into the
    // scrim instead of falling back to the theme's.
    for (const bad of [
      "",
      "1, 2",
      "1, 2, 3, 4",
      "a, b, c",
      "-1, 0, 0",
      "0, 0, 256",
      "0,,0",
      "1;2;3",
      null,
      undefined,
      42,
      {},
      [],
    ]) {
      expect(parseTint(bad), `${String(bad)} was accepted`).toBeNull();
    }
  });
});

describe("deriveScrimRgb — the picture tints, the theme decides", () => {
  it("THE GUARANTEE: no tint, in the whole colour cube, can flip the polarity", () => {
    // The one property the tint is not allowed to break. A light theme has dark
    // ink and therefore needs a LIGHT scrim; a dark theme has light ink and
    // needs a DARK one. If a tint could push the scrim across that line, the
    // reader would get pale text on a pale scrim — and the only place that could
    // be caught is here, because nothing else in the app looks at the answer.
    //
    // Checked against `isLight`, the codebase's own definition of the line,
    // rather than against a threshold written here: if that definition moves,
    // this test follows it instead of disagreeing with it.
    const corners = [0, 255];
    const tints: string[] = [];
    for (const r of corners) {
      for (const g of corners) {
        for (const b of corners) tints.push(`${r}, ${g}, ${b}`);
      }
    }
    // Every grey too — the boring middle of the cube is where a real photograph
    // usually lands, and a bug that only shows up there is still a bug.
    for (let v = 0; v <= 255; v += 5) tints.push(`${v}, ${v}, ${v}`);
    // And the primaries, which a heavily saturated photo would average to.
    tints.push("255, 0, 0", "0, 255, 0", "0, 0, 255", "255, 255, 0", "0, 255, 255");

    for (const tint of tints) {
      expect(isLight(asHex(deriveScrimRgb(tint, true))), `${tint} darkened a light scrim`).toBe(true);
      expect(isLight(asHex(deriveScrimRgb(tint, false))), `${tint} lightened a dark scrim`).toBe(false);
    }
  });

  it("keeps a third of the scale in reserve at both ends", () => {
    // The numbers the `TINT_MIX` comment states, asserted rather than trusted:
    // 255/3 is 85 and 255 - 85 is 170, against `isLight`'s 0.5 line — which
    // 85/255 and 170/255 clear in opposite directions, 0.167 apart either side.
    // A `TINT_MIX` of a half would put the dark end at exactly 128 and this
    // test would say so.
    expect(asHex(deriveScrimRgb("255, 255, 255", false))).toBe("#555555");
    expect(asHex(deriveScrimRgb("0, 0, 0", true))).toBe("#aaaaaa");
  });

  it("mixes toward the picture, not away from it", () => {
    // A dark red under a light theme moves the light scrim DOWN, and a light
    // blue under a dark theme moves the dark scrim UP. Both are what "tinted by
    // the picture" means, and both stay far from the ink's own side.
    expect(deriveScrimRgb("200, 40, 40", true)).toBe("237, 183, 183");
    expect(deriveScrimRgb("40, 80, 200", false)).toBe("13, 27, 67");
  });

  it("with no tint it returns the flat polarity triple, byte for byte", () => {
    // Not "something close to": the same string `applyThemeTokens` writes, so a
    // picture whose colour could not be read degrades to exactly the behaviour
    // that shipped before tints existed. Pinned as an equality because the two
    // are supposed to be one value expressed twice.
    for (const junk of [undefined, null, "", "nonsense", "1,2", {}]) {
      expect(deriveScrimRgb(junk, true)).toBe("255, 255, 255");
      expect(deriveScrimRgb(junk, false)).toBe("0, 0, 0");
    }
    const themes = readFileSync(new URL("../../src/lib/themes.ts", import.meta.url), "utf8");
    expect(themes).toContain('isLight(tokens.bg) ? "255, 255, 255" : "0, 0, 0"');
  });
});

describe("sampleTint — reading a colour off a picture", () => {
  it("answers null when there is no canvas, rather than throwing", async () => {
    // There is no `document` in this suite and there may be none in the app: an
    // insecure origin has no canvas. Null is a real answer here, and every
    // caller treats it as "use the theme's flat scrim" — which is the behaviour
    // that shipped before tints existed.
    expect(typeof document).toBe("undefined");
    expect(await sampleTint("data:image/png;base64,Ynl0ZXM=")).toBeNull();
  });
});

/**
 * Seed a settings blob and read it back through a fresh store.
 *
 * The query string is the point: `lib/store` reads `localStorage` once at module
 * evaluation and `bun test` shares a module cache across files, so an import
 * that is not cache-busted returns the FIRST file's store and asserts nothing
 * here. Every persistence claim in this file goes through a genuinely fresh
 * `read()`.
 *
 * At module scope rather than inside one `describe`, because three separate
 * groups make claims about what the store keeps and a helper scoped to the
 * first of them would be a trap for the other two.
 */
async function roundTrip(settings: Record<string, unknown>) {
  for (const k of Object.keys(backing)) delete backing[k];
  backing["belso-iranytu-data-v2"] = JSON.stringify({
    version: 2,
    entries: [],
    goals: [],
    dailyQuestion: null,
    medications: [],
    medicationChecks: {},
    profile: { name: "Teszt", goal: "" },
    settings,
  });
  const store = await import(`../../src/lib/store?bg-settings=${Math.random()}`);
  return store.getState().settings as unknown as Record<string, unknown>;
}

describe("store — what a corrupt blob does to the two fields", () => {

  it("keeps a well-formed pair", async () => {
    const s = await roundTrip({ backgroundImage: "abc123", backgroundScrim: 0.4 });
    expect(s.backgroundImage).toBe("abc123");
    expect(s.backgroundScrim).toBe(0.4);
  });

  it("drops an id that is not a non-empty string", async () => {
    // A number id would reach `getAttachmentDataUrl` and return null anyway, but
    // keeping it in the blob means the Settings summary would claim a picture is
    // set when none is.
    for (const bad of ["", 42, null, {}, []]) {
      const s = await roundTrip({ backgroundImage: bad });
      expect(s.backgroundImage).toBeUndefined();
    }
  });

  it("REPLACES a scrim that is not a number in 0–1, rather than dropping it", async () => {
    // `?? ` would not have caught any of these, and each one reaches an
    // `rgba()` where the browser discards it without a word.
    //
    // Replaced, not deleted — and this assertion CHANGED during development, so
    // the reason is worth keeping. `undefined` is the meaningful state for
    // `backgroundImage` ("no picture is set"), so a bad id is deleted. It is not
    // a state the scrim has: DEFAULT_SETTINGS declares 0.55 and every reader
    // that wants a number writes a `?? DEFAULT_SCRIM` beside it. Deleting here
    // left the reader holding `undefined` for the entire live session; it only
    // healed on the next save, once the key was simply absent. The store's job
    // is to hand back a valid Settings, not a valid Settings-or-nothing.
    for (const bad of ["0.5", NaN, 2, -1, null, {}]) {
      const s = await roundTrip({ backgroundScrim: bad });
      expect(s.backgroundScrim, `${String(bad)} was not replaced`).toBe(DEFAULT_SCRIM);
    }
  });

  it("a repaired blob falls back to the default rather than to a broken one", async () => {
    // The two together: what a reader ends up with after a corrupt blob, and
    // the asymmetry between them stated in one place — the id goes, the scrim
    // comes back at its default.
    const s = await roundTrip({ backgroundImage: 99, backgroundScrim: "half" });
    expect(s.backgroundImage).toBeUndefined();
    expect(s.backgroundScrim).toBe(DEFAULT_SCRIM);
    // And the value a reader actually paints with needs no defence at all: the
    // store handed back a number, so the clamp is a no-op rather than a rescue.
    expect(clampScrim(s.backgroundScrim)).toBe(DEFAULT_SCRIM);
  });

  it("keeps the blur, the palette and the tint when they are well formed", async () => {
    const s = await roundTrip({
      backgroundBlur: 0.6,
      backgroundPalette: "theme",
      backgroundTint: "12, 34, 56",
    });
    expect(s.backgroundBlur).toBe(0.6);
    expect(s.backgroundPalette).toBe("theme");
    expect(s.backgroundTint).toBe("12, 34, 56");
  });

  it("REPLACES a blur or a palette that is not one, rather than dropping it", async () => {
    // Same rule as the scrim and for the same reason: DEFAULT_SETTINGS declares
    // both, so a component holding a partial Settings would need a `?? DEFAULT`
    // beside every use, and a deleted key would leave the reader on `undefined`
    // for the whole live session — healing only on the next save.
    for (const bad of ["0.5", NaN, 2, -1, null, {}]) {
      const s = await roundTrip({ backgroundBlur: bad });
      expect(s.backgroundBlur, `${String(bad)} was not replaced`).toBe(DEFAULT_BLUR);
    }
    for (const bad of ["IMAGE", "custom", 0, 1, null, {}, []]) {
      const s = await roundTrip({ backgroundPalette: bad });
      expect(s.backgroundPalette, `${String(bad)} was not replaced`).toBe(
        DEFAULT_PALETTE,
      );
    }
  });

  it("DROPS a tint that will not parse — the opposite repair, on purpose", async () => {
    // The exception to the rule above, and the reason is the same one that keeps
    // `backgroundImage` an absent key: there is no tint until there is a
    // picture. A stale tint that outlived its picture would keep tinting the
    // scrim of a backdrop the reader has already thrown away, and no default
    // could stand in for it.
    for (const bad of ["", "1, 2", "a, b, c", "-1, 0, 0", "0,,0", 42, {}, []]) {
      const s = await roundTrip({ backgroundTint: bad });
      expect(s.backgroundTint, `${String(bad)} survived`).toBeUndefined();
    }
  });
});

/**
 * THE FIT — three ways, and only three, with the third the default.
 *
 * The bug it fixes was reported from a real device: a sharp photograph looked
 * soft, because `background-size: cover` scales an image until it fills the
 * viewport and then blurs the result. The shipped fix was `contain`, which
 * shows the whole picture and leaves bare bands beside it, and the reader's own
 * answer is `soft`: the whole picture on top of a blurred, enlarged copy of the
 * SAME picture filling the bands. Three ways to fit a picture is a fix with
 * three ways to be wrong, and none of them were guarded — so the value that
 * reaches a CSS property, the value the store keeps, the three labels the
 * reader picks between, and the layer the stylesheet paints for `soft` are each
 * pinned below.
 *
 * `auto` is gone in the same commit that added `soft`, and it is not a special
 * case anywhere: it simply stopped being one of the three, so every clamp and
 * every repair already in place treats it as an unknown value and answers the
 * default. That is the migration, and it is asserted rather than assumed.
 */
describe("the fit — three ways, and only three", () => {
  // The order the picker OFFERS them, not just the set: the default (`soft`)
  // sits in the first position, so the control's first button is the value a
  // fresh install already paints.
  const ALL: BackgroundFit[] = ["soft", "cover", "contain"];

  it("normalises to one of the three, and repairs anything else", () => {
    for (const good of ALL) expect(normalizeFit(good)).toBe(good);
    for (const bad of [
      "",
      "COVER",
      "fill",
      "scale-down",
      "auto",
      0,
      1,
      true,
      null,
      undefined,
      {},
      [],
    ]) {
      expect(normalizeFit(bad), `${String(bad)} was not replaced`).toBe(DEFAULT_FIT);
    }
  });

  it("maps the three onto the two `background-size` keywords the paint uses", () => {
    // NOT the identity any more, and that is the whole reason this is a table:
    // `soft` has no `background-size` of its own — its picture layer is
    // `contain`, and the filling behind it is the stylesheet's third layer,
    // drawn from the same `--app-bg-image`. A retired `auto` (or any other
    // unknown value) falls through to the default's own keyword rather than
    // reaching the declaration.
    expect(fitCss("cover")).toBe("cover");
    expect(fitCss("contain")).toBe("contain");
    expect(fitCss("soft")).toBe("contain");
    for (const bad of ["auto", "fill", "COVER", 2, null, undefined]) {
      expect(fitCss(bad), `${String(bad)} reached the declaration`).toBe("contain");
    }
  });

  it("offers exactly the three, each once, in the order they are described", () => {
    expect(FIT_CHOICES.map((c) => c.value)).toEqual(ALL);
    // A label is user-facing text, and an empty one renders a button with
    // nothing on it — so the check is that each carries something a reader can
    // act on, not that it matches a specific word.
    for (const choice of FIT_CHOICES) {
      expect(choice.label.trim().length, `${choice.value} has no label`).toBeGreaterThan(0);
      expect(new Set(FIT_CHOICES.map((c) => c.label)).size, "two options share a label").toBe(3);
    }
  });

  it("defaults to the soft fill, which is the answer to both halves of the report", () => {
    // `contain` alone left the bands the reader called "a little strip";
    // `cover` alone is what made a sharp picture look soft. The default has to
    // be the one that answers both, or the bug is only half fixed.
    expect(DEFAULT_FIT).toBe("soft");
    expect(DEFAULT_SETTINGS.backgroundFit).toBe("soft");
  });

  it("PERSISTS: each of the three survives a store round trip", async () => {
    for (const fit of ALL) {
      const s = await roundTrip({ backgroundFit: fit });
      expect(s.backgroundFit, `${fit} did not survive`).toBe(fit);
    }
  });

  it("MIGRATES a stored `auto` to the default instead of breaking the blob", async () => {
    // The one value that used to be legal and is not any more. It must not read
    // as corrupt — a reader who chose it gets the default, silently and exactly
    // as a blob that predates the control does.
    const s = await roundTrip({ backgroundFit: "auto" });
    expect(s.backgroundFit).toBe(DEFAULT_FIT);
  });

  it("REPAIRS a stored fit that is not one of the three", async () => {
    for (const bad of ["fill", "COVER", "", 1, null, {}, []]) {
      const s = await roundTrip({ backgroundFit: bad });
      expect(s.backgroundFit, `${String(bad)} was not replaced`).toBe(DEFAULT_FIT);
    }
  });

  it("the stylesheet carries the soft fill's recipe, read from these constants", () => {
    // The recipe lives in one place and is consumed twice: the stylesheet
    // paints the fill and the Settings preview repeats it inline. A number
    // edited in one copy and not the other is a preview that lies, so the
    // stylesheet's copy is pinned against the constants rather than trusted —
    // and the sharp layer's own override is pinned with it, because a `soft`
    // picture that is magnified is not the whole picture any more.
    const css = readFileSync("src/styles.css", "utf8");
    const start = css.indexOf(".app-bg-fill {");
    expect(start, "the soft fill's layer is not in the stylesheet").toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("}", start));
    expect(block, "the fill is not the blurred cover copy").toContain("background-size: cover");
    expect(block).toContain(`blur(${SOFT_FILL_BLUR_PX}px)`);
    expect(block).toContain(`opacity: ${SOFT_FILL_OPACITY}`);
    expect(block).toContain(`scale(${SOFT_FILL_SCALE})`);

    const crisp = css.indexOf(".app.has-bg.bg-fit-soft::before");
    expect(crisp, "the sharp layer's override is not in the stylesheet").toBeGreaterThan(-1);
    expect(css.slice(crisp, css.indexOf("}", crisp))).toContain("transform: none");
  });

  it("reads as the default when the blob predates the control", async () => {
    // The scrim's rule, not the tint's. `normalizeSettings` spreads
    // DEFAULT_SETTINGS, so a blob written before this control existed reads as
    // the current default — which is the additive claim in the other direction:
    // a reader who has never opened the choice gets the fixed picture, and one
    // who chose a fit keeps it, asserted above. The fields that stay absent
    // instead (`backgroundImage`, `backgroundTint`) are the two with no meaning
    // without a picture, and that is the distinction.
    const s = await roundTrip({ theme: "light" });
    expect(s.backgroundFit).toBe(DEFAULT_FIT);
  });
});

describe("the card transparency — the fraction, and what the store keeps", () => {
  it("clamps to the slider's own range", () => {
    expect(MIN_CARD_TRANSPARENCY).toBe(0);
    expect(MAX_CARD_TRANSPARENCY).toBe(1);
    for (const good of [0, 0.05, 0.5, 1]) expect(clampCardTransparency(good)).toBe(good);
    for (const [bad, wanted] of [
      [-1, 0],
      [1.5, 1],
      [-0.001, 0],
      [1.0001, 1],
    ] as const) {
      expect(clampCardTransparency(bad), `${bad} was not clamped`).toBe(wanted);
    }
  });

  it("repairs a value that is not a number at all", () => {
    // The failure mode the whole file is about: a malformed value reaching a
    // `calc()` inside `color-mix()`, where the browser drops the declaration
    // and leaves cards that are neither opaque nor faded.
    for (const bad of ["0.5", NaN, Infinity, -Infinity, null, undefined, {}, []]) {
      expect(clampCardTransparency(bad), `${String(bad)} was not replaced`).toBe(
        DEFAULT_CARD_TRANSPARENCY,
      );
    }
  });

  it("defaults to no fading at all, so the setting adds nothing on arrival", () => {
    expect(DEFAULT_CARD_TRANSPARENCY).toBe(0);
    expect(DEFAULT_SETTINGS.backgroundCardTransparency).toBe(0);
  });

  it("PERSISTS: every slider step survives a store round trip", async () => {
    for (const step of [0, 0.05, 0.25, 0.5, 0.75, 1]) {
      const s = await roundTrip({ backgroundCardTransparency: step });
      expect(s.backgroundCardTransparency, `${step} did not survive`).toBe(step);
    }
  });

  it("REPAIRS a stored transparency that is out of range or not a number", async () => {
    for (const bad of [-0.5, 1.5, "0.4", NaN, null, {}, []]) {
      const s = await roundTrip({ backgroundCardTransparency: bad });
      expect(s.backgroundCardTransparency, `${String(bad)} was not replaced`).toBe(
        DEFAULT_CARD_TRANSPARENCY,
      );
    }
  });

  it("reads as no fading when the blob predates the control", async () => {
    // Same rule as the fit, and the reason it matters more here: 0 is not merely
    // a default, it is the only value at which this feature changes nothing.
    // A reader upgrading into this commit must not find their cards half-faded.
    const s = await roundTrip({ theme: "light" });
    expect(s.backgroundCardTransparency).toBe(DEFAULT_CARD_TRANSPARENCY);
  });
});
