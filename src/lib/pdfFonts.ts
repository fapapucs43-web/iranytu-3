/**
 * The PDF report's own typeface, fetched and verified on demand (Batch 7i).
 *
 * WHY THIS EXISTS AT ALL
 * The report used to fold a Hungarian letter to spell it — `Belső
 * Iránytű` reached the page as `Belsö Iránytü` — because jsPDF's built-in
 * Helvetica has no glyph for ő (U+0151). A glyph in a report that a
 * clinician reads is not a cosmetic detail, so the fold is going away and a
 * real font is taking its place. This module is the "get it" half; the
 * "register it with jsPDF" half is in `reportPdf.ts`, because that is where
 * the document is.
 *
 * WHY IT IS A FETCH AND NOT AN IMPORT
 * The subsets are 30 784 B and 30 604 B. Inlining them as base64 in a
 * module would put ~82 kB of string into the JavaScript bundle that every
 * user parses on every load, to serve someone who may never export a
 * report. As files under `public/pdf-fonts/` they cost nothing until the
 * export button is pressed, and the service worker then keeps them for
 * offline use. Both facts are the reason this file exists in this shape.
 *
 * WHY THE BYTES ARE CHECKED BEFORE THEY ARE TRUSTED
 * A font is a binary this app hands to a renderer. If a deploy served a
 * truncated file, an HTML error page saved as `.ttf`, or some other
 * substitution, the failure mode is a PDF that renders boxes or nothing at
 * all — and it would surface as "the report looks wrong" in someone's
 * exported file, a long way from the cause. So both files are checked
 * against a byte count and a SHA-256 recorded when they were vendored, and
 * a mismatch is treated as "not available" rather than as a font.
 *
 * WHY A REASON INSTEAD OF A NULL
 * The caller's response to "not available" is to fall back to the old
 * folded rendering, and that is a decision the caller must make, not one
 * hidden behind a null it has to guess about. The reason travels with the
 * answer so a test can assert which failure happened, and so a future
 * on-screen hint could be added without changing this module's shape. There
 * is no logging here, for the same reason the rest of `src/` has none.
 *
 * WHY THE FETCH IS INJECTED
 * Every byte of this module is verification logic, and verification logic
 * that cannot be pointed at a stub is verification logic nobody runs. The
 * parameter defaults to the real one, so no caller has to know it exists.
 */

import { deploymentBase } from "./fonts";

/** Where the vendored subsets are served from under this deployment. The service worker caches it. */
export function pdfFontBase(base: string): string {
  return `${base.endsWith("/") ? base : `${base}/`}pdf-fonts/`;
}

/**
 * Same 404 as `FONT_BASE` had, same fix: rooted at `/pdf-fonts/` a project
 * site (`/iranytu-3/` on GitHub Pages) would 404 on its own subsets, and the
 * report export would fall back to the folded rendering this module exists
 * to end. The base is read once, at module load, by the registry module.
 */
export const PDF_FONT_BASE = pdfFontBase(deploymentBase());

/**
 * The name jsPDF knows this family by.
 *
 * Deliberately not "NotoSans": this is a subset of Noto Sans, not Noto Sans,
 * and a name that claims otherwise is a name that will be wrong in a future
 * bug report. Nothing else in the app registers a font with jsPDF.
 */
export const PDF_FONT_FAMILY = "NotoSansPdf";

/** One vendored file, and everything needed to refuse it if it is not it. */
export type PdfFontFile = {
  /** Filename under `public/pdf-fonts/`. */
  readonly file: string;
  /** The style jsPDF registers it under. */
  readonly style: "normal" | "bold";
  /** Byte count, recorded by the vendoring script when it wrote the file. */
  readonly bytes: number;
  /** SHA-256 of the committed bytes, likewise. */
  readonly sha256: string;
};

/**
 * The two files, as committed by `scripts/subset-pdf-font.ts`.
 *
 * These numbers are the vendoring script's output, copied here on purpose:
 * they are the contract between "what was vendored" and "what the app will
 * accept", and a test compares them against the bytes on disk. Keeping the
 * script and this table in step is a reviewer's job, which is why the values
 * are literal rather than computed.
 */
export const PDF_FONT_FILES: readonly PdfFontFile[] = [
  {
    file: "pdf-noto-sans-regular.ttf",
    style: "normal",
    bytes: 30784,
    sha256: "df6292e0f2251a6fcb99dc21683489ed48b4cb7113c5998baeae69ab66967c15",
  },
  {
    file: "pdf-noto-sans-bold.ttf",
    style: "bold",
    bytes: 30604,
    sha256: "8330cfef5e08b4ffc0771639de56330971a37087c0a855ed46cc52896c7ed926",
  },
];

/** One verified file, ready for `doc.addFileToVFS`. */
export type PdfFontBase = {
  /** jsPDF's own name for this face. */
  readonly family: string;
  /** "normal" or "bold" — the style it is registered under. */
  readonly style: string;
  /** The filename jsPDF is told the bytes came from. */
  readonly file: string;
  /** Base64 of the whole TTF. */
  readonly base64: string;
};

export type PdfFontLoad =
  | { readonly ok: true; readonly fonts: readonly PdfFontBase[] }
  | {
      readonly ok: false;
      readonly reason: "network" | "http" | "size" | "hash" | "digest";
    };

/**
 * One fetch per session, shared by concurrent callers.
 *
 * Two exports in a row — or a double-tap, which is exactly what a button
 * invites — used to mean two pairs of requests and two base64 conversions
 * of the same bytes. This is the promise, not the result, so a second caller
 * arriving while the first is still in flight waits for it instead of
 * starting its own. A failure is NOT cached: a user who exports offline and
 * then comes back online must get the real font on the next try.
 */
let inFlight: Promise<PdfFontLoad> | null = null;

function toBase64(bytes: Uint8Array): string {
  // Chunked, because `String.fromCharCode(...bytes)` on a 30 KB array is one
  // call with 30 000 arguments and the argument limit is not generous. 8 KB
  // is comfortably inside it and costs a handful of concatenations.
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The failure half of `PdfFontLoad`, on its own so a helper cannot return the success half by accident. */
type PdfFontFailure = Extract<PdfFontLoad, { ok: false }>;

/** Fetch, verify and base64 one file. */
async function loadOne(spec: PdfFontFile, doFetch: typeof fetch): Promise<PdfFontBase | PdfFontFailure> {
  let bytes: Uint8Array;
  try {
    const res = await doFetch(`${PDF_FONT_BASE}${spec.file}`);
    if (!res.ok) return { ok: false, reason: "http" };
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    // Offline, DNS failure, an aborted navigation: all of them mean the same
    // thing to this module, which is "not available".
    return { ok: false, reason: "network" };
  }

  // Size first: it is a number, it is instant, and a wrong size makes the
  // hash pointless to compute.
  if (bytes.byteLength !== spec.bytes) return { ok: false, reason: "size" };

  let hex: string;
  try {
    hex = await sha256Hex(bytes);
  } catch {
    // `crypto.subtle` is undefined outside a secure context. A missing digest
    // is a reason to fall back, not a reason to throw at the user.
    return { ok: false, reason: "digest" };
  }
  if (hex !== spec.sha256) return { ok: false, reason: "hash" };

  return {
    family: PDF_FONT_FAMILY,
    style: spec.style,
    file: spec.file,
    base64: toBase64(bytes),
  };
}

/**
 * Load the PDF's fonts, or say why they could not be loaded.
 *
 * The fetch is injectable, and it is looked up INSIDE the function rather than
 * bound as a default argument. A default argument is evaluated when the call
 * happens, which is fine for a function object and useless for a stub: a test
 * that replaces `globalThis.fetch` — which is how a test exercises the real
 * generator end to end — would find the replacement ignored, and the module
 * built to be testable would be the one thing a test could not reach.
 *
 * @param doFetch optional override; defaults to whatever `globalThis.fetch` is
 *   at the moment of the call.
 */
export function loadPdfFonts(doFetch?: typeof fetch): Promise<PdfFontLoad> {
  if (inFlight) return inFlight;
  const fetcher: typeof fetch =
    doFetch ?? ((input, init) => globalThis.fetch(input as RequestInfo, init));
  inFlight = (async (): Promise<PdfFontLoad> => {
    const loaded = await Promise.all(PDF_FONT_FILES.map((spec) => loadOne(spec, fetcher)));
    const fonts: PdfFontBase[] = [];
    for (const item of loaded) {
      if ("base64" in item) fonts.push(item);
      else return item;
    }
    return { ok: true, fonts };
  })();
  // A failed load is dropped so the next attempt starts clean; a successful
  // one is kept, because the bytes cannot have changed within a session.
  inFlight = inFlight.then((result) => {
    if (!result.ok) inFlight = null;
    return result;
  });
  return inFlight;
}

/** Test seam: forget a cached load, so one test cannot decide another's. */
export function resetPdfFontCacheForTests(): void {
  inFlight = null;
}
