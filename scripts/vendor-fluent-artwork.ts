/**
 * Vendor the Fluent 3D artwork into `src/lib/iconsets/fluent-artwork.ts`.
 *
 *   bun scripts/vendor-fluent-artwork.ts
 *
 * WHY THE ARTWORK IS IN THE BUNDLE AT ALL
 * Batch 7 shipped Fluent as 38 files under `public/iconsets/fluent-v1/` and
 * fetched them when the user picked the set. That was right when a set was a
 * download, and wrong once it is not: the artwork is the app's own, always the
 * same, and never a per-user cost. Inlining it turns a network request on
 * selection into nothing, which is the whole point of Batch 7b, and it also
 * stops 503 kB of dead assets being uploaded on every single deploy.
 *
 * WHY IT FETCHES, AND DOES NOT READ A DIRECTORY
 * The first version of this script read the already-vendored SVGs and then
 * deleted them, which made it a one-shot migration rather than a generator:
 * run it twice and the second run failed, because the directory it needed was
 * the directory it had removed. That is a script that cannot be re-run, in a
 * repository whose whole reason for having one is that re-running after a
 * registry change repairs the artwork in one step. So the sources come from
 * the pinned upstream release instead, the same way `vendor-fonts.ts` does it
 * for the typefaces. There is no intermediate directory to keep or delete.
 *
 * WHY A SCRIPT AND NOT A MANUAL PASTE
 * The stems come from the two registries — the content glyphs and the nav rows
 * — so the module cannot disagree with what the app asks for.
 *
 * WHY THE SVG IS MINIFIED ON THE WAY IN
 * The source files carry an XML prolog, newlines and indentation between
 * elements. Inside a JS string all three are dead weight, and the prolog would
 * make the output an XML document rather than a fragment. The artwork gzips
 * about 6x, so the honest cost is the gzip figure, not this one.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GLYPHS, ICON_SETS } from "../src/lib/iconsets";
import { NAV_ICONS } from "../src/lib/nav-icons";

const OUT = "src/lib/iconsets/fluent-artwork.ts";

/**
 * Pinned upstream. `main` and `latest` could change under us between runs, and
 * a mood journal's icons should not. The version is in the URL, so a bump is a
 * one-line, reviewable change here and in the licence file together.
 */
const UPSTREAM = "https://cdn.jsdelivr.net/npm/fluentui-emoji@1.3.0/icons/modern";
const TIMEOUT_MS = 30_000;

/** Every Fluent stem the app can draw: the content glyphs plus the nav rows. */
function stemsFor(): string[] {
  const out = new Set<string>();
  for (const g of GLYPHS) {
    if (g.fluent) out.add(g.fluent);
  }
  for (const row of NAV_ICONS) out.add(row.fluent);
  return [...out].sort();
}

async function fetchOrThrow(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

/**
 * Strip what a JS string does not need.
 *
 * Attribute values keep their double quotes — they are SVG syntax, and
 * dropping them would break the artwork. Only the XML prolog, the
 * whitespace between elements, and the leading indentation go.
 */
function toInlineFragment(svg: string): string {
  const withoutProlog = svg.replace(/<\?xml[\s\S]*?\?>\s*/g, "");
  return withoutProlog
    .replace(/>\s+</g, "><")
    .replace(/^[ \t]+/gm, "")
    .trim();
}

/**
 * Is this actually artwork?
 *
 * The checks are structural rather than a byte floor, because a byte floor is
 * wrong in both directions: a filled circle is a legitimate ~113-byte SVG, so
 * any threshold that catches an error page also rejects 🔴. What matters is
 * that the fragment is a complete `<svg>` with a `viewBox` and something in it
 * that draws, because those are exactly the four ways this output can be subtly
 * broken — a truncated response, a CSS-sized SVG that would render at the
 * wrong size, an empty one that renders nothing, and a prolog that turns a
 * fragment into a document.
 */
function assertArtwork(fragment: string, name: string): void {
  if (!/<svg[\s>]/i.test(fragment)) throw new Error(`${name}: no <svg>`);
  if (!/<\/svg>/i.test(fragment)) throw new Error(`${name}: truncated (no </svg>)`);
  if (!/viewBox=/i.test(fragment)) throw new Error(`${name}: no viewBox`);
  if (!/<(path|circle|rect|ellipse|polygon|polyline|line|g|image|use)\b/i.test(fragment)) {
    throw new Error(`${name}: draws nothing`);
  }
  if (fragment.includes("<?xml")) throw new Error(`${name}: still has an XML prolog`);
}

async function main() {
  if (!ICON_SETS.some((s) => s.id === "fluent")) {
    throw new Error("the registry no longer offers a `fluent` set");
  }

  const stems = stemsFor();
  if (stems.length === 0) throw new Error("no Fluent stems to vendor");

  const entries: [string, string][] = [];
  let sourceBytes = 0;
  let inlineBytes = 0;

  for (const stem of stems) {
    const url = `${UPSTREAM}/${stem}.svg`;
    const raw = await fetchOrThrow(url);
    const fragment = toInlineFragment(raw);
    assertArtwork(fragment, stem);
    entries.push([stem, fragment]);
    sourceBytes += Buffer.byteLength(raw, "utf8");
    inlineBytes += Buffer.byteLength(fragment, "utf8");
  }

  const body = entries
    .map(([stem, svg]) => `  ${JSON.stringify(stem)}: ${JSON.stringify(svg)},`)
    .join("\n");

  const module = `/**
 * Fluent 3D artwork, inlined (Batch 7b).
 *
 * GENERATED — do not edit. \`bun scripts/vendor-fluent-artwork.ts\` writes this
 * file from the icon-set registries and the pinned upstream release, and a test
 * fails if the two disagree. Editing it here means the next run silently
 * reverts you.
 *
 * WHY THIS IS A MODULE AND NOT A FETCH
 * Batch 7 loaded the set from /iconsets/fluent-v1/ when the user picked it,
 * which cost a network round trip and a warm-up on first selection. The
 * artwork never varies, so it belongs in the bundle: selecting Fluent now
 * draws the moment React renders, with nothing to wait for and nothing that
 * can 404, including on a train with no connection.
 *
 * The cost is ${entries.length} pieces of artwork in the main bundle forever, paid
 * by every visitor whether or not they ever pick this set. That is the
 * deliberate trade: measured, it is about 80 kB gzipped, and it is charged in
 * one request on first load rather than a second one at the moment the user
 * reaches for the thing they came to change.
 *
 * MIT licensed, so there is no attribution obligation to display. See
 * public/iconsets/LICENSES.md.
 */

/** Artwork stem to inline SVG fragment, minus the XML prolog. */
export const FLUENT_ARTWORK: Record<string, string> = {
${body}
};

/** One piece of artwork, or undefined when the stem is not one we ship. */
export function fluentArtwork(stem: string | undefined): string | undefined {
  return stem ? FLUENT_ARTWORK[stem] : undefined;
}

/** How many pieces are inlined. Shown in the licence screen. */
export const FLUENT_ARTWORK_COUNT = ${entries.length};
`;

  mkdirSync(join(OUT, ".."), { recursive: true });
  writeFileSync(OUT, module, "utf8");

  console.log(
    `${entries.length} pieces inlined → ${OUT}\n` +
      `  source ${(sourceBytes / 1024).toFixed(0)} kB → inline ${(inlineBytes / 1024).toFixed(0)} kB`,
  );
}

await main();
