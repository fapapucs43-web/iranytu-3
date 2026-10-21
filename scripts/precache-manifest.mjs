/**
 * Precaches the built file list into the service worker.
 *
 * WHY THIS IS `.mjs` AND NOT A `.ts` MODULE IN `src/lib/`. The other scripts
 * here are TypeScript run by `bun`, and sharing a pure helper with the test
 * suite would have been the obvious shape — but this one runs inside
 * `npm run build` on the hosting builder, which is a Node-only image with no
 * `bun` on it and no TypeScript loader. A `.ts` file it tries to import is a
 * build that fails on deploy. So the logic lives here, and `tests/` imports
 * THIS file under `bun`, which is the only arrangement that keeps one copy of
 * the rules and still builds on hosting. `bun test` and `node` both execute it
 * unchanged.
 *
 * WHY A GENERATOR AT ALL, rather than a list written into `public/sw.js` by
 * hand. Vite copies `public/` verbatim BEFORE it hashes the asset filenames,
 * so anything written there cannot know the names a given build will produce.
 * A hand-maintained list is therefore correct for exactly one commit and
 * silently wrong after the next one, and the failure is invisible: the app
 * installs, the worker activates, and the reader gets a cache full of 404s.
 * The issue this closes (fapapucs43-web/iranytu-2.0#13) exists because that
 * gap makes lazy-loaded chunks unsafe offline.
 *
 * WHAT IS IN THE LIST. Everything the app needs to boot and to look right
 * offline: the hashed assets, the two document roots, the UI icon set, the
 * self-hosted faces and the PDF export's subsetted fonts.
 *
 * WHAT IS NOT, and why. Licence and documentation files — 10 `OFL-*.txt`
 * under `/fonts/`, one under `/pdf-fonts/`, and `/iconsets/LICENSES.md`, 12
 * files and about 60 kB. They are attribution records, not runtime
 * dependencies: the Settings → Licences section reads them out of the bundle,
 * never over the network, so precaching them would spend a reader's install
 * bandwidth on text they already have.
 *
 * AND NOT `/sw.js` ITSELF. Caching the worker inside the worker is pointless
 * and confusing, and the registration URL already carries the bundle hash.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Markers the template in `public/sw.js` carries around the empty list. */
export const START = "/* PRECACHE_MANIFEST_START */";
export const END = "/* PRECACHE_MANIFEST_END */";

/** Markers the template carries around the build id baked into the worker. */
export const VERSION_START = "/* BUILD_VERSION_START */";
export const VERSION_END = "/* BUILD_VERSION_END */";

/**
 * Whether a built file belongs in the precache, given its `/`-rooted path.
 *
 * Written as a positive list rather than a set of exclusions so that a NEW
 * directory the build starts emitting cannot be swept in by accident. The two
 * extension tests are what drop the licence files.
 */
export function shouldPrecache(path) {
  if (path === "/sw.js") return false;
  if (path === "/index.html") return true;
  if (path === "/manifest.webmanifest") return true;
  if (path.startsWith("/assets/")) return true;
  if (path.startsWith("/icons/")) return true;
  if (path.startsWith("/fonts/")) return path.endsWith(".woff2");
  if (path.startsWith("/pdf-fonts/")) return path.endsWith(".ttf");
  return false;
}

/**
 * The precache list for a set of built files.
 *
 * Sorted so the generated `dist/sw.js` is byte-stable across builds that
 * produce the same tree: an unstable order would make every build look like a
 * worker update even when nothing changed.
 */
export function buildPrecacheList(paths) {
  return [...new Set(paths.filter(shouldPrecache))].sort();
}

/**
 * Replace the marked block in the worker source with the real list.
 *
 * Refuses rather than guessing. A template with no markers, or with two, means
 * the generator and `public/sw.js` have drifted apart, and the two ways that
 * can go wrong are both silent — an unreplaced token ships a worker that
 * precaches nothing, and a sloppy replace can eat code it was never meant to
 * touch.
 */
export function injectManifest(source, list) {
  const starts = source.split(START).length - 1;
  const ends = source.split(END).length - 1;
  if (starts !== 1 || ends !== 1) {
    throw new Error(
      `public/sw.js must contain ${START} and ${END} exactly once each; found ${starts} and ${ends}. ` +
        `The template and the generator have drifted apart.`,
    );
  }
  const body = list.map((p) => `  ${JSON.stringify(p)},`).join("\n");
  const replacement = `${START}\nconst PRECACHE = [\n${body}\n];\n${END}`;
  const head = source.slice(0, source.indexOf(START));
  const tail = source.slice(source.indexOf(END) + END.length);
  return `${head}${replacement}${tail}`;
}

/**
 * The id of THIS build, from the one file that names every hashed asset.
 *
 * Vite rewrites the bundle filenames into `dist/index.html`, so its bytes are a
 * function of the whole build: a change anywhere in `src/` changes a bundle's
 * content hash, which changes the `index.html` that references it, which
 * changes this id. That is exactly the property the worker's fallback version
 * needs, and it is reproducible — the same tree hashes to the same id, so a
 * rebuild of an unchanged commit does not look like a new deploy to a browser
 * that already has it. A timestamp would have been the other candidate and the
 * worse one: it would make every build a surprise update, and it would make the
 * generated `dist/sw.js` impossible to compare byte for byte.
 */
export function buildId(distDir) {
  const bytes = readFileSync(join(distDir, "index.html"));
  return createHash("sha256").update(bytes).digest("hex").slice(0, 12);
}

/**
 * Replace the version block in the worker source with this build's id.
 *
 * Same refusal as `injectManifest`, for the same reason: the template's
 * placeholder is what makes the write safe, and a template that has lost its
 * markers — or grown a second copy — must fail the build rather than ship a
 * worker whose fallback version is the word "dev".
 */
export function injectBuildVersion(source, id) {
  const starts = source.split(VERSION_START).length - 1;
  const ends = source.split(VERSION_END).length - 1;
  if (starts !== 1 || ends !== 1) {
    throw new Error(
      `public/sw.js must contain ${VERSION_START} and ${VERSION_END} exactly once each; found ${starts} and ${ends}. ` +
        `The template and the generator have drifted apart.`,
    );
  }
  const replacement = `${VERSION_START}\nconst BUILD_VERSION = ${JSON.stringify(id)};\n${VERSION_END}`;
  const head = source.slice(0, source.indexOf(VERSION_START));
  const tail = source.slice(source.indexOf(VERSION_END) + VERSION_END.length);
  return `${head}${replacement}${tail}`;
}

/**
 * Check that every entry names a file the build actually produced.
 *
 * Exported and tested rather than inlined in `main()`, because a guard nobody
 * can exercise is a guard nobody can trust. As `main` calls it the check is
 * belt-and-braces — the list is derived from a walk of `dist/`, so entries
 * trivially exist — but it is the thing that stops a future rule change from
 * emitting a path the build never made. That is the failure the issue names:
 * a precache that 404s on the reader's first install, which looks identical to
 * a working one until they are offline.
 */
export function verifyPrecacheList(list, distDir) {
  const missing = list.filter((p) => !statSync(join(distDir, p), { throwIfNoEntry: false }));
  if (missing.length) {
    throw new Error(
      `precache list names ${missing.length} file(s) the build did not produce:\n  ${missing.join("\n  ")}`,
    );
  }
  if (!list.length) {
    throw new Error("precache list is empty — the install handler would cache nothing.");
  }
  return list;
}

/** Every file under `dir`, as a `/`-rooted relative path. */
function walk(dir, base, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push("/" + relative(base, full).split(sep).join("/"));
  }
  return out;
}

function main() {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const dist = join(root, "dist");
  const swPath = join(dist, "sw.js");

  if (!statSync(dist, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error("dist/ does not exist — run `vite build` before this script.");
  }

  const built = walk(dist, dist);
  const list = verifyPrecacheList(buildPrecacheList(built), dist);
  const id = buildId(dist);

  // The version first, then the list: both write into the same file, and doing
  // the block that carries no markers last means a drift in either one is
  // reported against a file that still has the other's markers intact.
  const versioned = injectBuildVersion(readFileSync(swPath, "utf8"), id);
  writeFileSync(swPath, injectManifest(versioned, list));

  const bytes = list.reduce((n, p) => n + statSync(join(dist, p)).size, 0);
  const skipped = built.filter((p) => !list.includes(p));
  console.log(
    `precache: ${list.length} entries, ${bytes.toLocaleString("en-US")} B, build ${id}` +
      (skipped.length ? ` (${skipped.length} file(s) excluded: ${skipped.join(", ")})` : ""),
  );
}

// Run only when invoked directly, so importing this module under `bun test`
// does not try to touch the filesystem.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}