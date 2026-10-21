/**
 * Batch 7i — the report draws `ő` because the font has a glyph for it.
 *
 * WHAT THIS FILE IS
 * Commits 1–3 built the thing: a derived Noto Sans subset under
 * `public/pdf-fonts/`, a loader that refuses any byte it cannot verify, and a
 * generator that registers that font with jsPDF instead of folding a Hungarian
 * letter to spell it. This file is the proof, and it is deliberately made of
 * two very different kinds of test.
 *
 * THE LOADER TESTS RUN IN PROCESS, ON THE REAL COMMITTED FILES
 * `PDF_FONT_FILES` carries a byte count and a SHA-256 for each subset, copied
 * out of the vendoring script that wrote them. A pin that is only compared
 * against the same source that produced it proves nothing, so these read the
 * bytes off disk and check them. Four refusal paths are exercised, because
 * "the font is unavailable" and "the font is the wrong bytes" must both fail
 * closed and must fail differently.
 *
 * THE GENERATOR TESTS RUN IN A SUBPROCESS
 * This is the part that needed a second process, and the reason is worth
 * recording because it cost real time to find.
 *
 * jsPDF copies every method onto the document as an OWN property in its
 * constructor, so `doc.text` is not `jsPDF.prototype.text` and patching the
 * prototype intercepts nothing — a probe written that way reported zero drawn
 * strings while producing a perfectly good PDF, which is exactly the shape of
 * a test that passes for the wrong reason. The interception that does work is
 * the one `tests/batch7h.test.ts` already uses for the same problem: Bun's
 * `mock.module` replaces the `jspdf` module itself, and it replaces it for the
 * whole process. `tests/batch6-pdf.test.ts` and `tests/batch7h.test.ts` both
 * call `mock.module("jspdf", …)` to install their fakes, so any test in this
 * repository that wants the REAL jsPDF has to be in a different process. Hence
 * the subprocess, and hence the real committed subset read over a `fetch`
 * stub rather than a module mock.
 *
 * AND THE REAL-PDF ASSERTION DECODES, IT DOES NOT SCAN
 * Once a TrueType font is embedded, the page is not the text any more — it is
 * a font program. Scanning the whole file for a control byte or for a mojibake
 * letter would match inside the embedded font stream and report corruption
 * where there is none. So the text is read back the way a reader reads it:
 * the hex strings out of the content streams, decoded through the document's
 * own `ToUnicode` CMap. That is a stronger assertion than the fold tests it
 * replaces, because it is the bytes on the page, not a string in an array.
 *
 * The fallback keeps its own test rather than being folded into the main one.
 * A generator that cannot fetch its font still has to produce a report; if
 * that only showed up as a branch nobody exercised, the first person to export
 * offline would be the one to find out what it draws.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PDF_FONT_BASE,
  PDF_FONT_FAMILY,
  PDF_FONT_FILES,
  loadPdfFonts,
  resetPdfFontCacheForTests,
} from "../src/lib/pdfFonts";
import { pdfSafe } from "../src/lib/reportPdf";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FONT_DIR = join(ROOT, "public", "pdf-fonts");

/**
 * The whole generator, in a process of its own.
 *
 * It is passed as source rather than kept as a file because a test that
 * depends on a second file on disk can be satisfied by a stale one; there is
 * no path here to go stale. `PROBE_OFFLINE=1` is the only switch, and it is
 * what turns the committed subset into a fetch that throws.
 *
 * Written with `String.raw` so the regexes below survive as regexes — a plain
 * template literal turns every `\d` and `\r` into a character class escape or
 * a real carriage return, and the content-stream scanner then silently matches
 * nothing, which is a test that cannot fail.
 */
const PROBE = String.raw`
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const ROOT = process.env.PROBE_ROOT;
const OFFLINE = process.env.PROBE_OFFLINE === "1";

const { mock } = await import("bun:test");
const { jsPDF: Real } = await import("jspdf");

// jsPDF binds its API onto the instance, so the interception has to be the
// MODULE, not the prototype. See the header.
const drawn = [];
const faces = [];
const saved = [];
class Probe extends Real {
  constructor(...rest) {
    super(...rest);
    const text = this.text;
    const setFont = this.setFont;
    this.text = function (a, b, c, d) {
      if (typeof a === "string") drawn.push(a);
      return text.call(this, a, b, c, d);
    };
    this.setFont = function (family, style) {
      faces.push(family + "/" + style);
      return setFont.call(this, family, style);
    };
    this.save = function (name) {
      saved.push(String(name));
      // Deliberately NOT called through. jsPDF writes a real file to the
      // working directory when it saves, so letting it through left a 33 kB
      // PDF at the repository root every time the suite ran. What is under
      // test is that the GENERATOR saves once and with the right name, not
      // that jsPDF's downloader can write a file.
      return this;
    };
  }
}
mock.module("jspdf", () => ({ jsPDF: Probe }));

const goodFetch = async (url) => {
  const name = String(url).replace(/^.*\/pdf-fonts\//, "");
  try {
    return new Response(readFileSync(ROOT + "/public/pdf-fonts/" + name), { status: 200 });
  } catch {
    return new Response("", { status: 404 });
  }
};
const deadFetch = async () => {
  throw new Error("offline");
};

const { loadPdfFonts, resetPdfFontCacheForTests } = await import(ROOT + "/src/lib/pdfFonts.ts");
resetPdfFontCacheForTests();
const loaded = await loadPdfFonts(OFFLINE ? deadFetch : goodFetch);
const { buildMoodReportPdf, exportMoodReportPdf } = await import(ROOT + "/src/lib/reportPdf.ts");

// One entry carrying a character in every corner the batch is about: o-double-
// acute in two registry labels, an em dash in every aggregate line, and
// o-double-acute plus u-double-acute in the assessment band label. (The note is
// deliberately the one thing here with no expectation attached: the report
// summarises a day as its date, mood, stress and energy, and never quotes what
// the person wrote. It is still on the entry, because a report test that only
// ever sees a stripped-down entry is not testing the real shape of one.)
const entries = [
  {
    id: "e1",
    date: "2026-03-01",
    mood: 3,
    stress: 4,
    energy: 6,
    activities: [],
    emotions: [],
    note: "Tűnődöm az őszön.",
    trackerValues: {
      "weather-condition": { kind: "select", value: "sunny" },
      "weather-temp": { kind: "number", value: 21 },
      sport: { kind: "select", value: "run" },
      "sport-duration": { kind: "number", value: 40 },
      steps: { kind: "number", value: 9000 },
    },
  },
];
const opts = {
  userName: "Kovács Eszter",
  assessments: [{ date: "2026-03-01", score: 14, bandLabel: "Közepes erősségű tünetek" }],
};

const built = await buildMoodReportPdf(entries, opts);
const savesAfterBuild = saved.length;
const bytes = new Uint8Array(built.doc.output("arraybuffer"));
const pdf = Buffer.from(bytes).toString("latin1");
const fontList = built.doc.getFontList();
const fileName = built.fileName;

const exported = await exportMoodReportPdf(entries, opts);

// ---- read the text back out of the page ------------------------------------
// The document's own ToUnicode map, and the hex strings of the content streams.
// With an embedded TrueType both exist; with Helvetica the strings are literal
// and there is no CMap, which is itself the answer to "is the font in here".
const toUnicode = new Map();
const streams = [];
for (const m of pdf.matchAll(/(\d+) 0 obj\s*<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
  let body = Buffer.from(m[3], "latin1");
  if (/FlateDecode/.test(m[2])) {
    try {
      body = inflateSync(body);
    } catch {
      continue;
    }
  }
  const text = body.toString("latin1");
  if (/begincmap/.test(text)) {
    for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g))
        toUnicode.set(parseInt(pair[1], 16), String.fromCodePoint(parseInt(pair[2], 16)));
    for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
      for (const range of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const lo = parseInt(range[1], 16);
        const hi = parseInt(range[2], 16);
        const dst = parseInt(range[3], 16);
        for (let c = lo; c <= hi; c++) toUnicode.set(c, String.fromCodePoint(dst + (c - lo)));
      }
  }
  if (/\bTj/.test(text)) streams.push(text);
}
let decoded = "";
for (const text of streams)
  for (const s of text.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
    const hex = s[1];
    for (let i = 0; i + 4 <= hex.length; i += 4) {
      const code = parseInt(hex.slice(i, i + 4), 16);
      decoded += toUnicode.get(code) ?? "�";
    }
  }

process.stdout.write(
  JSON.stringify({
    offline: OFFLINE,
    loaded: loaded.ok ? "ok" : loaded.reason,
    families: Object.keys(fontList).filter((k) => k.indexOf("Noto") === 0),
    notoStyles: fontList["NotoSansPdf"] === undefined ? null : fontList["NotoSansPdf"],
    helveticaUsed: faces.some((f) => f.indexOf("helvetica/") === 0),
    faces: [...new Set(faces)],
    drawnCount: drawn.length,
    drawnJoined: drawn.join(""),
    fileName,
    exported,
    savesAfterBuild,
    savesAfterExport: saved.length,
    bytes: bytes.length,
    embedsFont: pdf.indexOf("FontFile2") !== -1,
    hasToUnicode: pdf.indexOf("ToUnicode") !== -1,
    decoded,
  }),
);
`;

/** The one entry the generator builds, with the real font or without it. */
type ProbeResult = {
  offline: boolean;
  loaded: string;
  families: string[];
  notoStyles: string[] | null;
  helveticaUsed: boolean;
  faces: string[];
  drawnCount: number;
  drawnJoined: string;
  fileName: string;
  exported: string;
  savesAfterBuild: number;
  savesAfterExport: number;
  bytes: number;
  embedsFont: boolean;
  hasToUnicode: boolean;
  decoded: string;
};

function probe(offline: boolean): ProbeResult {
  // A temp file under ROOT, not `-e`: on Windows `bun` is a `.cmd` shim and
  // Bun refuses to hand it this many cmd.exe metacharacters. The directory is
  // under ROOT so the probe's `import("jspdf")` still resolves through the
  // repository's node_modules, and it is named for `.gitignore` and removed in
  // a `finally` so a failed probe leaves nothing behind.
  const dir = mkdtempSync(join(ROOT, ".tmp-pdf-"));
  try {
    const file = join(dir, "probe.mjs");
    writeFileSync(file, PROBE, "utf8");
    const proc = Bun.spawnSync(["bun", file], {
      cwd: ROOT,
      env: { ...process.env, PROBE_ROOT: ROOT, PROBE_OFFLINE: offline ? "1" : "0" },
    });
    const out = proc.stdout.toString();
    if (proc.exitCode !== 0) {
      throw new Error(`the PDF probe failed: ${proc.stderr.toString().slice(0, 600)}`);
    }
    return JSON.parse(out) as ProbeResult;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Every code point a TrueType `cmap` format 4 subtable claims, for one file.
 *
 * Format 4 only, and it refuses anything else rather than guessing — a
 * character-map parser that returns a confident wrong answer is worse than one
 * that stops, which is the rule `src/lib/font-cmap.ts` was written under. The
 * vendored subsets are TrueType with a format 4 cmap; if a future re-vendor
 * changes that, this says so instead of quietly proving nothing.
 */
function cmapCodepoints(file: Uint8Array): Set<number> {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const u16 = (at: number) => view.getUint16(at);
  const u32 = (at: number) => view.getUint32(at);
  const tag = (at: number) => String.fromCharCode(file[at]!, file[at + 1]!, file[at + 2]!, file[at + 3]!);

  if (u32(0) !== 0x00010000) throw new Error("not a TrueType outline font");
  let cmap = -1;
  for (let i = 0, n = u16(4); i < n; i++) {
    const rec = 12 + i * 16;
    if (tag(rec) === "cmap") cmap = u32(rec + 8);
  }
  if (cmap < 0) throw new Error("the font has no cmap table");

  let subtable = -1;
  for (let i = 0, n = u16(cmap + 2); i < n; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = u16(rec);
    const encoding = u16(rec + 2);
    // A Unicode subtable, either the 3/1 BMP one or the 0/x one. The other
    // encodings in this file are the same data again.
    if ((platform === 3 && encoding === 1) || (platform === 0 && encoding !== 6)) {
      subtable = cmap + u32(rec + 4);
    }
  }
  if (subtable < 0) throw new Error("the font has no Unicode cmap subtable");
  if (u16(subtable) !== 4) {
    throw new Error(`cmap format ${u16(subtable)} is not format 4, and this reader stops`);
  }

  const out = new Set<number>();
  const segCount = u16(subtable + 6) / 2;
  const endAt = subtable + 14;
  const startAt = endAt + segCount * 2 + 2;
  for (let s = 0; s < segCount; s++) {
    const from = u16(startAt + s * 2);
    const to = u16(endAt + s * 2);
    // 0xFFFF terminates the table and maps to .notdef, not to U+FFFF.
    if (from === 0xffff) continue;
    for (let c = from; c <= to; c++) out.add(c);
  }
  return out;
}

describe("the vendored subsets are the bytes the app will accept", () => {
  test("every file in the manifest is on disk, at its recorded size and digest", () => {
    for (const spec of PDF_FONT_FILES) {
      const bytes = readFileSync(join(FONT_DIR, spec.file));
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(bytes.byteLength, `${spec.file} size`).toBe(spec.bytes);
      expect(digest, `${spec.file} digest`).toBe(spec.sha256);
    }
  });

  test("the directory holds the manifest and its licence, and nothing else", () => {
    // A subset the manifest does not know about is a file the app will never
    // fetch, sitting in a directory whose whole job is to be fetched from.
    const onDisk = readdirSync(FONT_DIR).sort();
    const expected = [...PDF_FONT_FILES.map((f) => f.file), "OFL-noto-sans.txt"].sort();
    expect(onDisk).toEqual(expected);
    // ...and the manifest covers both faces, so `bold` is never a silent
    // fall-through to the regular face at a heading.
    expect(PDF_FONT_FILES.map((f) => f.style).sort()).toEqual(["bold", "normal"]);
  });

  test("both subsets spell the Hungarian alphabet, capitals included", () => {
    // 18 letters, and both subsets — the bold one is a different cut of the
    // same font and a missing ő in it would only show up in a heading.
    const letters = "aáeéiíoóöőuúüűAÁEÉIÍOÓÖŐUÚÜŰ";
    for (const spec of PDF_FONT_FILES) {
      const covered = cmapCodepoints(readFileSync(join(FONT_DIR, spec.file)));
      for (const c of letters) {
        expect(covered.has(c.codePointAt(0)!), `${spec.file} has no ${c}`).toBe(true);
      }
    }
  });

  test("both subsets carry every character the fold table exists for", () => {
    // Derived from `pdfSafe` rather than copied: if someone adds a character
    // to the fold table because the built-in font cannot draw it, this fails
    // until the subset covers it too. That is the coupling that keeps the two
    // halves of the fix from drifting apart.
    for (const spec of PDF_FONT_FILES) {
      const covered = cmapCodepoints(readFileSync(join(FONT_DIR, spec.file)));
      for (const c of "aáeéiíoóöőuúüűAÁEÉIÍOÓÖŐUÚÜŰ—–‒―„”‘’… ") {
        expect(covered.has(c.codePointAt(0)!), `${spec.file} cannot draw ${c}`).toBe(true);
      }
    }
  });

  test("the subsets live beside the UI fonts, not inside them", () => {
    // `public/fonts/` is required by three tests to hold exactly the UI
    // registry — a licence text or a `.woff2`, nothing else — and putting the
    // PDF's TTFs there broke all three when it was tried. This is the check
    // that says the separation is deliberate rather than accidental.
    const ui = readdirSync(join(ROOT, "public", "fonts"));
    expect(ui.filter((f) => f.endsWith(".ttf"))).toEqual([]);
    expect(ui.length).toBeGreaterThan(0);
    // The base the loader asks for is the one the directory is served from.
    expect(PDF_FONT_BASE).toBe("/pdf-fonts/");
    for (const spec of PDF_FONT_FILES) {
      expect(PDF_FONT_BASE + spec.file).toBe(`/pdf-fonts/${spec.file}`);
    }
  });
});

describe("the loader refuses anything that is not the vendored file", () => {
  const bytesOf = (file: string) => readFileSync(join(FONT_DIR, file));
  const first = PDF_FONT_FILES[0]!;

  /** A fetch that serves the real subset for every name. */
  const serving = (body: (spec: (typeof PDF_FONT_FILES)[number]) => Uint8Array) =>
    (async (input: RequestInfo | URL) =>
      new Response(
        body(PDF_FONT_FILES.find((s) => String(input).endsWith(s.file))!),
      )) as unknown as typeof fetch;

  test("an unreachable network is `network`, and a 404 is `http`", async () => {
    resetPdfFontCacheForTests();
    const dead = await loadPdfFonts((async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);
    expect(dead).toEqual({ ok: false, reason: "network" });

    resetPdfFontCacheForTests();
    const missing = await loadPdfFonts((async () =>
      new Response("", { status: 404 })) as unknown as typeof fetch);
    expect(missing).toEqual({ ok: false, reason: "http" });
  });

  test("a truncated body is `size`, and it is refused before it is hashed", async () => {
    // Order matters as much as the outcome: hashing a wrong-length file
    // wastes a WebCrypto round trip on every export on a bad connection, and
    // the size is free.
    resetPdfFontCacheForTests();
    const short = await loadPdfFonts(serving(() => bytesOf(first.file).subarray(0, 1024)));
    expect(short).toEqual({ ok: false, reason: "size" });
  });

  test("a full-length body that is not the file is `hash`", async () => {
    // The right number of wrong bytes: an HTML error page saved as `.ttf`, a
    // truncated-then-padded file, a proxy's interstitial. Nothing about the
    // length says it is wrong, so this is the case the digest is for.
    resetPdfFontCacheForTests();
    const wrong = await loadPdfFonts(
      serving((spec) => {
        const b = bytesOf(spec.file);
        const copy = Uint8Array.from(b);
        copy[copy.length - 1] ^= 0xff;
        return copy;
      }),
    );
    expect(wrong).toEqual({ ok: false, reason: "hash" });
  });

  test("one bad file refuses the pair — a half-loaded font is not a font", async () => {
    resetPdfFontCacheForTests();
    const half = await loadPdfFonts(serving((spec) =>
      spec.style === "bold" ? bytesOf(spec.file).subarray(0, 10) : bytesOf(spec.file),
    ));
    expect(half).toEqual({ ok: false, reason: "size" });
  });

  test("the vendored bytes pass", async () => {
    resetPdfFontCacheForTests();
    const ok = await loadPdfFonts(serving((spec) => bytesOf(spec.file)));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.fonts.map((f) => f.style)).toEqual(["normal", "bold"]);
    expect(ok.fonts.every((f) => f.family === PDF_FONT_FAMILY)).toBe(true);
    // The base64 is the whole file, not a prefix of it: four characters per
    // three bytes, rounded up, with the padding the encoder adds.
    for (const font of ok.fonts) {
      const spec = PDF_FONT_FILES.find((s) => s.file === font.file)!;
      expect(font.base64.length, `${font.file} base64 length`).toBe(
        4 * Math.ceil(spec.bytes / 3),
      );
    }
  });

  test("a failure is not cached, and a success is fetched once", async () => {
    // A user who exports offline and then comes back online must get the real
    // font on the next try, so a failure cannot be remembered...
    resetPdfFontCacheForTests();
    const dead = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect((await loadPdfFonts(dead)).ok).toBe(false);
    expect((await loadPdfFonts(serving((spec) => bytesOf(spec.file)))).ok).toBe(true);

    // ...and once it has succeeded, a second export must not refetch two 30 kB
    // files. Both callers of `loadPdfFonts` see one shared promise.
    resetPdfFontCacheForTests();
    let requests = 0;
    const counting = (async (input: RequestInfo | URL) => {
      requests++;
      const spec = PDF_FONT_FILES.find((s) => String(input).endsWith(s.file))!;
      return new Response(bytesOf(spec.file));
    }) as unknown as typeof fetch;
    const [a, b] = await Promise.all([loadPdfFonts(counting), loadPdfFonts(counting)]);
    expect(a.ok && b.ok).toBe(true);
    expect(requests, "the two files were fetched more than once").toBe(2);
    expect((await loadPdfFonts(counting)).ok).toBe(true);
    expect(requests, "a cached success was refetched").toBe(2);
  });
});

describe("the report draws the words it was given", () => {
  const result = probe(false);

  test("the document registers both faces and never falls back to Helvetica", () => {
    expect(result.loaded).toBe("ok");
    expect(result.families).toEqual([PDF_FONT_FAMILY]);
    expect(result.notoStyles).toEqual(["normal", "bold"]);
    expect(result.faces.every((f) => f.startsWith(`${PDF_FONT_FAMILY}/`))).toBe(true);
    expect(result.helveticaUsed).toBe(false);
  });

  test("the string handed to jsPDF is the string the app stores", () => {
    // The identity claim. `drawable` is `pdfSafe` or it is the identity
    // function, and which one it is decides what the reader sees; this reads
    // it off the argument jsPDF actually received.
    expect(result.drawnJoined).toContain("Belső Iránytű — közérzet-jelentés");
    expect(result.drawnJoined).toContain("Kovács Eszter");
    expect(result.drawnJoined).toContain("Hőmérséklet");
    expect(result.drawnJoined).toContain("Időjárás");
    expect(result.drawnJoined).toContain("Sport időtartama");
    expect(result.drawnJoined).toContain("Közepes erősségű tünetek");
    // Nothing was folded on the way. Each of these is a real corruption that
    // shipped before this batch, named here so a regression is recognisable.
    for (const bad of ["Belsö", "Iránytü", "Hömérséklet", "Idöjárás", "Sport idötartama", "erösségü"]) {
      expect(result.drawnJoined, `the fold produced ${bad}`).not.toContain(bad);
    }
  });

  test("the bytes on the page spell Hungarian, read back out of a real PDF", () => {
    // The end-to-end claim, and the only one made of the actual document: the
    // committed subset, the real loader, the real jsPDF, the real content
    // streams, decoded through the document's own ToUnicode map. Nothing here
    // can pass without the glyph being in the font.
    expect(result.embedsFont, "no TrueType program was embedded").toBe(true);
    expect(result.hasToUnicode, "the embedded font has no ToUnicode map").toBe(true);
    expect(result.decoded).toContain("Belső Iránytű — közérzet-jelentés");
    expect(result.decoded).toContain("Készült:");
    expect(result.decoded).toContain("Kovács Eszter");
    expect(result.decoded).toContain("Hőmérséklet — átlag 21 °C");
    expect(result.decoded).toContain("Sport időtartama — átlag 40 perc");
    expect(result.decoded).toContain("Időjárás — napsütéses");
    expect(result.decoded).toContain("Közepes erősségű tünetek");
    // The whole of the fold table, absent from the page.
    for (const bad of ["Belsö", "Iránytü", "Hömérséklet", "erösségü", "�"]) {
      expect(result.decoded, `the page contains ${bad}`).not.toContain(bad);
    }
    // ...and the page is genuinely a document, not a stub: the fallback is
    // 6 kB and this is 33 kB of which the two subsets are most.
    expect(result.bytes).toBeGreaterThan(20_000);
  });

  test("building the report does not save it, and exporting saves it once", () => {
    // The split that made this testable at all. `doc.save()` used to be the
    // last statement of the one function, so a real document could only ever
    // be produced by a fake.
    expect(result.savesAfterBuild).toBe(0);
    expect(result.savesAfterExport).toBe(1);
    expect(result.fileName).toMatch(/\.pdf$/);
    expect(result.exported).toBe(result.fileName);
  });
});

describe("a device that has never been online still gets a report", () => {
  const offline = probe(true);

  test("with the font unavailable the report is folded, not broken", () => {
    // The fallback has its own test rather than a branch nobody runs. It is
    // reachable on a first export with no connection, where the subsets were
    // never cached — and a report that says `Belsö` is worth more than an
    // error dialog, and much more than a control byte.
    expect(offline.loaded).toBe("network");
    expect(offline.families).toEqual([]);
    expect(offline.helveticaUsed).toBe(true);
    // The same number of strings as the real path: a fallback that drops
    // content is not a fallback.
    expect(offline.drawnCount).toBeGreaterThan(20);
    expect(offline.drawnJoined).toContain("Belsö Iránytü - közérzet-jelentés");
    expect(offline.drawnJoined).toContain("Közepes erösségü tünetek");
    // No font embedded, and no control byte: the fold is the point.
    expect(offline.embedsFont).toBe(false);
    expect(offline.bytes).toBeGreaterThan(1_000);
  });

  test("and it is the fold, not the app, that differs", () => {
    // One line that says the two paths are the same report. Taken by folding
    // the real path's strings and comparing the two whole documents, so a
    // future change to either half shows up as a difference rather than as a
    // reworded expectation.
    const real = probe(false);
    const folded = real.drawnJoined.split("").map(pdfSafe).join("");
    expect(folded).toBe(offline.drawnJoined);
  });
});

describe("the change stayed where it belongs", () => {
  test("no font is inlined into the bundle", () => {
    // 30 kB of binary as a base64 literal would put ~41 kB into the module
    // every user parses on every load, to serve someone who may never export a
    // report. The longest string literal in the loader is a path — comments
    // are stripped first, because prose about why the file is small is not the
    // file being small, and the literals are matched one line at a time,
    // because a character class that allows a newline walks straight out of
    // one string, through the code between, and into the next.
    const source = readFileSync(join(ROOT, "src", "lib", "pdfFonts.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const lit of source.matchAll(/"([^"\\\n]{80,})"|'([^'\\\n]{80,})'|`([^`\\\n]{80,})`/g)) {
      const text = lit[1] ?? lit[2] ?? lit[3] ?? "";
      expect(text.length, `a ${text.length}-character literal is inlined into the bundle`).toBeLessThan(80);
    }
    // The base64 is produced from the fetched bytes, not stored.
    expect(source).toContain("btoa(binary)");
  });

  test("the service worker keeps the subsets for the next offline export", () => {
    // The fallback above is a first-export problem. Caching the two files on
    // first fetch is what makes it a first-export-once problem, so the cache
    // rule is part of the feature rather than a detail. Matched on the
    // condition line itself: a window of the file, or the first mention of
    // "cache-first" anywhere, would pass on a mention in a comment and fail on
    // a rule that moved.
    const sw = readFileSync(join(ROOT, "public", "sw.js"), "utf8");
    const condition = sw
      .split("\n")
      .filter((line) => line.includes("url.pathname.startsWith"))
      .join("\n");
    expect(condition).toContain(`startsWith("${PDF_FONT_BASE}")`);
    // It has to sit in a rule with the other vendored directories, not alone —
    // a rule of its own would be a second cache to reason about for no gain.
    expect(condition).toContain('startsWith("/fonts/")');
    expect(condition).toContain('startsWith("/assets/")');
  });

  test("the generator has one decision and thirteen calls that obey it", () => {
    // `pdfSafe` is still exported and still tested against real jsPDF in
    // `tests/batch7h.test.ts`; what changed is that the generator reaches for
    // it only when the font is missing.
    const source = readFileSync(join(ROOT, "src", "lib", "reportPdf.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain('setFont("helvetica"');
    expect((code.match(/face\(/g) ?? []).length).toBeGreaterThanOrEqual(13);
    expect(code).toContain("loaded.ok ? (text) => text : pdfSafe");
  });
});
