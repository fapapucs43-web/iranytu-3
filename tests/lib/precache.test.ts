/**
 * The precache list, and the contract between the generator and the template.
 *
 * The service worker cannot be exercised here — this project ships no jsdom,
 * deliberately — so what this file guards is the part that CAN rot silently:
 * the rules that decide what goes in the list, and the marker pair that lets
 * the generator write into `public/sw.js` at all. Both are pure functions and
 * both are imported from the generator itself rather than restated, so a test
 * cannot pass against a copy of the rules that production no longer runs —
 * the same mistake two contrast guards used to make, each carrying its own
 * copy of a threshold that had already moved.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrecacheList, injectManifest, shouldPrecache, verifyPrecacheList, END, START } from "../../scripts/precache-manifest.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SW = readFileSync(join(ROOT, "public/sw.js"), "utf8");

/** The real, non-hashed files the build copies out of `public/`. */
function publicFiles(dir = "public", base = "public", out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) publicFiles(rel, base, out);
    else out.push("/" + rel.slice(base.length + 1));
  }
  return out;
}

describe("what goes in the precache", () => {
  test("the runtime roots are in, and the worker itself is out", () => {
    expect(shouldPrecache("/index.html")).toBe(true);
    expect(shouldPrecache("/manifest.webmanifest")).toBe(true);
    expect(shouldPrecache("/sw.js")).toBe(false);
  });

  test("every hashed asset is in, whatever it is called", () => {
    // Not filtered by extension on purpose: Vite decides the names, and a
    // future `.wasm` or `.woff2` chunk must not be silently left uncached.
    expect(shouldPrecache("/assets/index-Dxshk_oW.js")).toBe(true);
    expect(shouldPrecache("/assets/index-RpWFxeWj.css")).toBe(true);
    expect(shouldPrecache("/assets/anything-changed-name.mjs")).toBe(true);
  });

  test("licence and documentation files are out, and only those", () => {
    expect(shouldPrecache("/fonts/OFL-inter.txt")).toBe(false);
    expect(shouldPrecache("/pdf-fonts/OFL-noto-sans.txt")).toBe(false);
    expect(shouldPrecache("/iconsets/LICENSES.md")).toBe(false);
    // …while the faces they license are in.
    expect(shouldPrecache("/fonts/inter-latin.woff2")).toBe(true);
    expect(shouldPrecache("/pdf-fonts/pdf-noto-sans-regular.ttf")).toBe(true);
  });

  test("a directory the build starts emitting is NOT swept in by accident", () => {
    // The rule is a positive list, so this is the case that would catch a
    // well-meaning `return true` added at the bottom.
    expect(shouldPrecache("/telemetry/beacon.js")).toBe(false);
    expect(shouldPrecache("/iconsets/fluent-v1/thing.svg")).toBe(false);
    expect(shouldPrecache("/")).toBe(false);
    expect(shouldPrecache("/nested/deep/file.woff2")).toBe(false);
  });
});

describe("the list the rules produce", () => {
  const BUILT = [
    "/assets/index-abc.js",
    "/assets/index-def.css",
    "/fonts/inter-latin.woff2",
    "/fonts/OFL-inter.txt",
    "/icons/icon.svg",
    "/pdf-fonts/pdf-noto-sans-bold.ttf",
    "/pdf-fonts/OFL-noto-sans.txt",
    "/iconsets/LICENSES.md",
    "/index.html",
    "/manifest.webmanifest",
    "/sw.js",
  ];

  test("it is sorted, deduplicated and free of the excluded files", () => {
    const list = buildPrecacheList([...BUILT, ...BUILT]);
    expect(list).toEqual([
      "/assets/index-abc.js",
      "/assets/index-def.css",
      "/fonts/inter-latin.woff2",
      "/icons/icon.svg",
      "/index.html",
      "/manifest.webmanifest",
      "/pdf-fonts/pdf-noto-sans-bold.ttf",
    ]);
    expect(list.every((p) => !p.includes("OFL"))).toBe(true);
    expect(list.every((p) => !p.includes("LICENSES"))).toBe(true);
    expect(list).not.toContain("/sw.js");
  });

  test("the same tree twice gives the same list, so a rebuild is not a change", () => {
    // `sw.js` bytes decide whether the browser sees a worker update. An
    // unstable order would make every build look like one, and would defeat
    // the byte-diff that triggers it in the first place.
    const shuffled = [...BUILT].reverse();
    expect(buildPrecacheList(shuffled)).toEqual(buildPrecacheList(BUILT));
  });

  test("an empty tree produces an empty list rather than throwing", () => {
    // The generator's own emptiness guard is separate and does throw; this is
    // only about the pure function not being surprising on its own.
    expect(buildPrecacheList([])).toEqual([]);
  });
});

describe("the marker contract between the generator and the template", () => {
  test("public/sw.js carries each marker exactly once", () => {
    expect(SW.split(START).length - 1).toBe(1);
    expect(SW.split(END).length - 1).toBe(1);
    expect(SW.indexOf(START)).toBeLessThan(SW.indexOf(END));
  });

  test("the shipped template starts EMPTY, because the generator fills it", () => {
    // If this ever reads non-empty, a generator run wrote its output back into
    // the template — and the next build would ship the previous build's list.
    expect(SW).toMatch(/const PRECACHE = \[\s*\];/);
  });

  test("install waits for the precache, and skipWaiting comes after it", () => {
    // The ordering is the entire benefit, so it is asserted rather than
    // described: a fill that started after skipWaiting would activate a worker
    // with an empty cache and delete the old one on the way past.
    const install = SW.slice(SW.indexOf('addEventListener("install"'), SW.indexOf('addEventListener("activate"'));
    expect(install).toContain("waitUntil");
    expect(install.indexOf("addAll")).toBeGreaterThan(-1);
    expect(install.indexOf("addAll")).toBeLessThan(install.indexOf("skipWaiting"));
    // …and activate still deletes the old caches, which is what makes the
    // fill-before-activate ordering load-bearing.
    const activate = SW.slice(SW.indexOf('addEventListener("activate"'));
    expect(activate).toContain("caches.delete");
    expect(activate).toContain("CACHE");
  });

  test("injectManifest refuses a template it cannot safely edit", () => {
    const filled = injectManifest(SW, ["/index.html", "/assets/a.js"]);
    expect(filled).toContain('"/assets/a.js"');
    expect(filled.split(START).length - 1).toBe(1);

    // No markers at all — the generator must not guess where to write.
    expect(() => injectManifest("const x = 1;", ["/a"])).toThrow(/drifted apart/);
    // Two of them — a duplicated block would make the replacement ambiguous.
    expect(() => injectManifest(`${SW}${SW}`, ["/a"])).toThrow(/drifted apart/);
  });

  test("injectManifest leaves the rest of the worker untouched", () => {
    // Both sides have the marked block removed with the same expression, so
    // what is compared is the two workers' remaining text — and nothing else.
    const block = /\/\* PRECACHE_MANIFEST_START \*\/[\s\S]*?\/\* PRECACHE_MANIFEST_END \*\//g;
    const filled = injectManifest(SW, ["/index.html", "/assets/a.js"]).replace(block, "");
    expect(filled).toBe(SW.replace(block, ""));
    // The block itself is the only thing that changed.
    expect(injectManifest(SW, ["/index.html", "/assets/a.js"])).toContain('  "/assets/a.js",\n];');
  });
});

describe("the build-time existence guard actually refuses", () => {
  // This is the invariant issue #13 asks for — every precache entry is a path
  // the build produced — and it is exercised directly rather than assumed,
  // because as the generator calls it the check is belt-and-braces: the list is
  // derived from a walk of dist/. What matters is that a future rule change
  // emitting a path the build never made fails here instead of shipping a
  // precache that 404s the first time a reader goes offline.
  const DIST = join(ROOT, "public");

  test("a list naming a file that is not there is refused, by name", () => {
    expect(() =>
      verifyPrecacheList(["/index.html", "/assets/never-built.js"], DIST),
    ).toThrow(/assets\/never-built\.js/);
  });

  test("an empty list is refused rather than shipping a worker that caches nothing", () => {
    expect(() => verifyPrecacheList([], DIST)).toThrow(/empty/);
  });

  test("a list of files that all exist passes and comes back unchanged", () => {
    const list = ["/manifest.webmanifest"];
    expect(verifyPrecacheList(list, DIST)).toBe(list);
  });
});

describe("the real public tree, which needs no build to check", () => {
  test("every non-asset entry the rules produce is a file that exists", () => {
    // `/assets/*` only exists after a build, but everything else is copied
    // straight out of `public/`, so the rules can be checked against the real
    // tree in CI with no dist and no jsdom.
    const files = publicFiles();
    const list = buildPrecacheList(files);
    expect(list.length).toBeGreaterThan(0);

    const missing = list
      .filter((p) => !p.startsWith("/assets/"))
      .filter((p) => !statSync(join(ROOT, "public", p), { throwIfNoEntry: false }));
    expect(missing, `precached paths that public/ does not contain: ${missing.join(", ")}`).toEqual([]);
  });

  test("the list covers the faces and the icons, not just the manifest", () => {
    const list = buildPrecacheList(publicFiles());
    expect(list).toContain("/manifest.webmanifest");
    expect(list.some((p) => p.endsWith(".woff2"))).toBe(true);
    expect(list.some((p) => p.startsWith("/icons/"))).toBe(true);
    expect(list.some((p) => p.endsWith(".ttf"))).toBe(true);
    // And the licences are genuinely still in the tree — this is the exclusion
    // being exercised on real files, not on a fixture that always agreed.
    expect(list.some((p) => p.includes("OFL"))).toBe(false);
  });

  test("/index.html is precached, and it comes from the repo root not public/", () => {
    // Vite builds `dist/index.html` from the ROOT template; `public/` has no
    // index.html and must not gain one. So this entry cannot be seen in the
    // public walk above, and asserting it there would have been wrong. What is
    // checkable without a build is both halves of the fact: the rule accepts
    // the path, and the file it will be built from really is in the repo.
    expect(shouldPrecache("/index.html")).toBe(true);
    expect(statSync(join(ROOT, "index.html"), { throwIfNoEntry: false })).toBeTruthy();
    expect(statSync(join(ROOT, "public/index.html"), { throwIfNoEntry: false })).toBeFalsy();
  });

  test("the build script runs the generator, or the list would never be written", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.build).toContain("vite build");
    expect(pkg.scripts.build).toContain("scripts/precache-manifest.mjs");
  });
});