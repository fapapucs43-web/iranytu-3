/**
 * Vendor the typefaces into `public/fonts/`.
 *
 *   bun scripts/vendor-fonts.ts
 *
 * WHY A SCRIPT AND NOT A MANUAL DOWNLOAD
 * The filenames come from `src/lib/fonts.ts` — the same registry the app
 * requests from at runtime. A hand-copied file can disagree with the registry
 * and the disagreement is invisible until a user picks that family and sees a
 * missing typeface. Deriving the list means the two cannot drift, and re-running
 * this after a registry change repairs the directory in one step. Batch 5
 * vendored its three families by hand, with nothing to catch a typo; this is
 * the fix, and it is why Batch 8 can swap four of the five families safely.
 *
 * WHY PINNED URLS
 * Every source is a full gstatic URL that carries its own version segment —
 * `/s/montserrat/v31/…`, `/s/sairacondensed/v12/…`. Those URLs are immutable, so
 * the bytes are reproducible; the *unstated* thing that could change under us is
 * the `css2` API that hands out which URL to use, and this script never calls
 * it. It also re-checks the size the registry promises, so a silently swapped
 * artefact fails here rather than in a user's browser.
 *
 * WHAT A PINNED URL CANNOT FIX
 * A pinned URL pins whatever that URL serves, and for Lato what it served could
 * not spell Hungarian: Google's `latin-ext` cut of Lato is the Central-European
 * one and omits ő and ű, while the upstream font has them. That is why Lato was
 * withdrawn in Batch 7f and why the registry now reads the real character map
 * out of every file (`src/lib/font-cmap.ts`) instead of trusting a `unicodeRange`
 * string. Pinning buys reproducibility; it does not buy correctness, and the
 * two are not the same property.
 *
 * WHAT IT REFUSES TO WRITE
 * A non-200, a body that is not woff2 (`wOF2` magic), and any file whose size
 * does not match the registry. A "successful" response that is really an error
 * page would otherwise be written into the app and 404 at runtime, offline.
 */
import { writeFileSync, rmSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FONTS, HAND_FONTS, FONT_BASE, type FontFile } from "../src/lib/fonts";
// The one list of "this family is not Google's to fetch". Imported rather than
// re-typed here, because a second copy of it is a second thing to forget: a
// family added upstream in the subsetter and not here would fail this script
// with "no pinned source", which is at least loud — but a family listed here
// and not there would be skipped here and never fetched anywhere.
import { stemOf } from "./subset-ui-fonts";

/**
 * Pinned upstream binaries, keyed by the filename the registry asks for.
 *
 * `null` used to mean "keep the file that is already on disk", and Inter was
 * the only user of it. That escape hatch is gone, because it cannot survive
 * Batch 7i: the file on disk is now a CUT, so keeping it and checking it
 * against an upstream size are contradictory instructions and the script would
 * refuse on a correct repository. Inter has real URLs here instead, taken from
 * the same immutable `/s/inter/v20/` paths the other nineteen use.
 *
 * Anything not listed is an error, so a new family cannot be committed without
 * a source.
 */
const SOURCES: Record<string, string> = {
  "inter-latin.woff2":
    "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2",
  "inter-latin-ext.woff2":
    "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7SUc.woff2",

  "montserrat-latin.woff2":
    "https://fonts.gstatic.com/s/montserrat/v31/JTUSjIg1_i6t8kCHKm459Wlhyw.woff2",
  "montserrat-latin-ext.woff2":
    "https://fonts.gstatic.com/s/montserrat/v31/JTUSjIg1_i6t8kCHKm459Wdhyzbi.woff2",

  "roboto-latin.woff2":
    "https://fonts.gstatic.com/s/roboto/v51/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3yUBA.woff2",
  "roboto-latin-ext.woff2":
    "https://fonts.gstatic.com/s/roboto/v51/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3KUBGEe.woff2",

  "playfair-display-latin.woff2":
    "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFiD-vYSZviVYUb_rj3ij__anPXDTzYgA.woff2",
  "playfair-display-latin-ext.woff2":
    "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFiD-vYSZviVYUb_rj3ij__anPXDTLYgFE_.woff2",

  "lora-latin.woff2":
    "https://fonts.gstatic.com/s/lora/v37/0QIvMX1D_JOuMwr7Iw.woff2",
  "lora-latin-ext.woff2":
    "https://fonts.gstatic.com/s/lora/v37/0QIvMX1D_JOuMwT7I-NP.woff2",

  "quicksand-latin.woff2":
    "https://fonts.gstatic.com/s/quicksand/v37/6xKtdSZaM9iE8KbpRA_hK1QN.woff2",
  "quicksand-latin-ext.woff2":
    "https://fonts.gstatic.com/s/quicksand/v37/6xKtdSZaM9iE8KbpRA_hJVQNcOM.woff2",

  "saira-condensed-400-latin.woff2":
    "https://fonts.gstatic.com/s/sairacondensed/v12/EJROQgErUN8XuHNEtX81i9TmEkrvoutF.woff2",
  "saira-condensed-400-latin-ext.woff2":
    "https://fonts.gstatic.com/s/sairacondensed/v12/EJROQgErUN8XuHNEtX81i9TmEkrvrOtFyIw.woff2",
  "saira-condensed-700-latin.woff2":
    "https://fonts.gstatic.com/s/sairacondensed/v12/EJRLQgErUN8XuHNEtX81i9TmEkrnGc5Q962f.woff2",
  "saira-condensed-700-latin-ext.woff2":
    "https://fonts.gstatic.com/s/sairacondensed/v12/EJRLQgErUN8XuHNEtX81i9TmEkrnGc5Q-a2fli0.woff2",

  "jetbrains-mono-latin.woff2":
    "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwg.woff2",
  "jetbrains-mono-latin-ext.woff2":
    "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPx7cwhsk.woff2",

  "dancing-script-latin.woff2":
    "https://fonts.gstatic.com/s/dancingscript/v29/If2RXTr6YS-zF4S-kcSWSVi_szLgiuE.woff2",
  "dancing-script-latin-ext.woff2":
    "https://fonts.gstatic.com/s/dancingscript/v29/If2RXTr6YS-zF4S-kcSWSVi_szLuiuEViw.woff2",
};

/**
 * OFL 1.1 texts, one per family, from `google/fonts`.
 *
 * `google/fonts` has no per-family release tags, so these are read from `main`.
 * That is acceptable precisely because the licence is fixed prose: OFL 1.1 is
 * the same text for every family, and the only per-family line is the
 * copyright holder. The file is committed, so the shipped copy is pinned in the
 * only way that matters; a re-fetch that changed it would show up as a diff in
 * a licence, which is exactly the kind of change a reviewer should see.
 */
const LICENCES: Record<string, string> = {
  "OFL-inter.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt",
  "OFL-montserrat.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/OFL.txt",
  // Lato's binaries are cut from the upstream TrueType rather than fetched from
  // gstatic, but the licence travels with the family either way: OFL
  // redistribution requires the text next to the binaries, and it makes no
  // difference to that obligation which URL the bytes came from.
  "OFL-lato.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/lato/OFL.txt",
  // Roboto was Apache 2.0 for years and Google relicensed it to OFL; the
  // `apache/roboto` path is a 404. Reading from `ofl/` is the whole story.
  "OFL-roboto.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/OFL.txt",
  "OFL-playfair-display.txt":
    "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/OFL.txt",
  "OFL-lora.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/lora/OFL.txt",
  "OFL-quicksand.txt":
    "https://raw.githubusercontent.com/google/fonts/main/ofl/quicksand/OFL.txt",
  "OFL-saira-condensed.txt":
    "https://raw.githubusercontent.com/google/fonts/main/ofl/sairacondensed/OFL.txt",
  "OFL-jetbrains-mono.txt":
    "https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/OFL.txt",
  "OFL-dancing-script.txt":
    "https://raw.githubusercontent.com/google/fonts/main/ofl/dancingscript/OFL.txt",
};

const OUT_ROOT = "public/fonts";
const TIMEOUT_MS = 30_000;

/**
 * The size each upstream file must be, keyed by filename.
 *
 * THIS USED TO BE THE REGISTRY'S `bytes`, and it cannot be any more. Since
 * Batch 7i the file served from `/fonts/` is a CUT of the upstream, produced by
 * `scripts/subset-ui-fonts.ts`, so the two numbers are different facts about
 * different artefacts: this table is the fact about what Google serves, and
 * `FontFile.bytes` is the fact about what the app downloads. Checking a
 * download against the wrong one would have made this script fail on a correct
 * repository, which is worse than having no check at all.
 *
 * They belong next to the URL that produces them for the same reason the
 * licence URLs live in this file: a pin and the thing it pins are one piece of
 * information, and separating them is how a table stops being maintained.
 */
const UPSTREAM_BYTES: Record<string, number> = {
  "inter-latin.woff2": 48256,
  "inter-latin-ext.woff2": 85068,
  "montserrat-latin.woff2": 37956,
  "montserrat-latin-ext.woff2": 70688,
  "roboto-latin.woff2": 43136,
  "roboto-latin-ext.woff2": 29392,
  "playfair-display-latin.woff2": 38404,
  "playfair-display-latin-ext.woff2": 21140,
  "lora-latin.woff2": 37788,
  "lora-latin-ext.woff2": 20088,
  "quicksand-latin.woff2": 28244,
  "quicksand-latin-ext.woff2": 26616,
  "saira-condensed-400-latin.woff2": 18160,
  "saira-condensed-400-latin-ext.woff2": 14692,
  "saira-condensed-700-latin.woff2": 17808,
  "saira-condensed-700-latin-ext.woff2": 14716,
  "jetbrains-mono-latin.woff2": 31432,
  "jetbrains-mono-latin-ext.woff2": 11624,
  "dancing-script-latin.woff2": 42708,
  "dancing-script-latin-ext.woff2": 22652,
};

function allFiles(): FontFile[] {
  return [...FONTS, ...HAND_FONTS].flatMap((d) => d.files);
}

async function fetchOrThrow(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** A woff2 starts with the four bytes `wOF2`. Anything else is not a font. */
function assertWoff2(body: Uint8Array, file: string, url: string): void {
  const expected = UPSTREAM_BYTES[file];
  if (expected === undefined) {
    throw new Error(`${file} has no pinned upstream size — refusing to fetch it`);
  }
  if (body.byteLength !== expected) {
    throw new Error(`size ${body.byteLength}, registry says ${expected} — ${url}`);
  }
  const magic = String.fromCharCode(...body.subarray(0, 4));
  if (magic !== "wOF2") {
    throw new Error(`not a woff2 (magic was ${JSON.stringify(magic)}) — ${url}`);
  }
}

async function main() {
  mkdirSync(OUT_ROOT, { recursive: true });
  const files = allFiles();

  if (files.length === 0) throw new Error("the registry lists no font files");

  let fetched = 0;
  let bytes = 0;
  let deferred = 0;

  for (const f of files) {
    // Families cut from an upstream TrueType are produced by
    // `scripts/subset-ui-fonts.ts`, which pins its own upstream three ways and
    // refuses to write a file that cannot spell Hungarian. There is nothing for
    // this script to fetch, and the file still belongs in `wanted` below, or the
    // prune loop would delete the very binaries the subsetter just produced.
    if (stemOf(f.file)) {
      deferred += 1;
      console.log(`  ${f.file.padEnd(30)} from pinned upstream TTF`);
      continue;
    }
    if (!(f.file in SOURCES)) {
      throw new Error(`no pinned source for ${f.file} — refusing to guess one`);
    }
    const url = SOURCES[f.file];
    const path = join(OUT_ROOT, f.file);

    const body = await fetchOrThrow(url);
    assertWoff2(body, f.file, url);
    writeFileSync(path, body);
    fetched += 1;
    bytes += UPSTREAM_BYTES[f.file]!;
    console.log(`  ${f.file.padEnd(30)} ${String(UPSTREAM_BYTES[f.file]).padStart(7)} B`);
  }

  // Licences. OFL redistribution requires the text to travel with the fonts,
  // and it is prose, not a build artefact, so it is checked rather than built.
  for (const [name, url] of Object.entries(LICENCES)) {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
    const text = await res.text();
    if (!/SIL OPEN FONT LICENSE/i.test(text)) {
      throw new Error(`not an OFL 1.1 text (no "SIL OPEN FONT LICENSE" heading) — ${url}`);
    }
    writeFileSync(join(OUT_ROOT, name), text, "utf8");
    console.log(`  ${name.padEnd(30)} licence`);
  }

  // Remove anything the registry no longer asks for, so a family dropped from
  // the app cannot linger in the bundle for ever.
  //
  // The PDF's subsetted TTFs deliberately do NOT live here. Batch 7i tried a
  // `pdf-` prefix with this loop skipping it, and three existing tests objected,
  // correctly: this directory is required to hold exactly the UI registry, so a
  // withdrawn family's file cannot linger here by construction. Two owners, two
  // directories, no exceptions: they are in `public/pdf-fonts/`.
  //
  const wanted = new Set([...files.map((f) => f.file), ...Object.keys(LICENCES)]);
  const { readdirSync } = await import("node:fs");
  for (const entry of readdirSync(OUT_ROOT)) {
    if (!wanted.has(entry)) {
      rmSync(join(OUT_ROOT, entry), { force: true });
      console.log(`  removed ${entry} (no longer in the registry)`);
    }
  }

  console.log(
    `\n${files.length} binaries (${fetched} fetched, ${deferred} cut from upstream TTF by the ` +
      `subsetter) + ${Object.keys(LICENCES).length} licences, ` +
      `${(bytes / 1024).toFixed(0)} kB of UPSTREAM → ${OUT_ROOT} (served at ${FONT_BASE})`,
  );
  console.log(
    "These are the uncut Google files. Run `bun scripts/subset-ui-fonts.ts` next, and copy the\n" +
      "`bytes:` values it prints into src/lib/fonts.ts — until you do, the registry describes\n" +
      "the pre-subset sizes and `tests/batch5-typography.test.ts` will say so.",
  );
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  console.error("Fix the cause and re-run. A partial vendor must not be committed.");
  process.exit(1);
});
