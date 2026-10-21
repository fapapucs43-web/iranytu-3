/**
 * Mega batch, commit 5 — the OpenAI SDK must not be in the main bundle.
 *
 * The finding this pins. `voice.ts` used a STATIC import of the SDK, so the
 * bundle contained it in exactly one situation: when `VITE_OPENAI_API_KEY` was
 * set at build time. With no key, Vite substituted `undefined`, the guard
 * `if (!apiKey) return null` constant-folded, and Rollup dropped the import.
 * Measured on the same tree: 1405.1 kB without a key, 1505.9 kB with one, no
 * warning, no test failure. A bundle size that depends on a secret's presence
 * at build time is not a property anyone can reason about.
 *
 * The fix is `await import("openai")` plus a `import type`, which is erased
 * before bundling. What is asserted here is the MECHANISM, not a number: a
 * build-size assertion would need a build before the tests, and would then
 * measure the test machine's environment rather than the repository's
 * invariant. "Nothing statically imports the SDK" is the property that makes
 * the chunk boundary real, and it holds on any machine.
 *
 * The last test is a bonus: when a `dist/` happens to exist it is checked for
 * the SDK's own signature strings, and skipped when there is no build.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { parseVoiceMetrics, isLlmAvailable } from "../../src/lib/voice";

const VOICE_SRC = readFileSync("src/lib/voice.ts", "utf8");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const SRC_FILES = walk("src");

/** A static VALUE import — `import type …` is erased and costs nothing. */
const STATIC_VALUE_IMPORT = /^import\s+(?!type\b)[^;]*?["']openai["']/gm;

/** Strings that only exist in the SDK's own code. */
const SDK_SIGNATURES = ["OpenAIError", "x-stainless", "openai/v4", "OpenAI-Beta"];

describe("the SDK cannot reach the main chunk", () => {
  test("no module in src/ statically imports openai", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      const src = readFileSync(file, "utf8");
      if (STATIC_VALUE_IMPORT.test(src)) offenders.push(file);
      STATIC_VALUE_IMPORT.lastIndex = 0;
    }
    expect(offenders).toEqual([]);
  });

  test("voice.ts imports the type statically and the value dynamically", () => {
    // Both halves are load-bearing. Without the type import the dynamic one
    // cannot be typed; without the dynamic one the SDK comes back.
    expect(VOICE_SRC).toContain('import type OpenAI from "openai"');
    expect(VOICE_SRC).toContain('await import("openai")');
  });

  test("the dynamic import is inside a function, not at module scope", () => {
    const idx = VOICE_SRC.indexOf('await import("openai")');
    expect(idx).toBeGreaterThan(-1);
    // A module-scope `await import` is a top-level await and would land the
    // chunk in the entry graph, which is the thing being avoided.
    expect(VOICE_SRC.slice(0, idx)).toContain("async function client");
  });

  test("client() is async, so the guard is awaited rather than skipped", () => {
    expect(VOICE_SRC).toContain("async function client(): Promise<OpenAI | null>");
    expect(VOICE_SRC).toContain("const api = await client()");
  });

  test("a chunk that fails to load degrades to the offline parser", () => {
    // The await sits INSIDE the try. A static import would have thrown at
    // module load instead, taking the whole feature with it.
    const tryAt = VOICE_SRC.indexOf("const api = await client()");
    const catchAt = VOICE_SRC.indexOf("} catch {", tryAt);
    expect(tryAt).toBeGreaterThan(-1);
    expect(catchAt).toBeGreaterThan(tryAt);
    expect(VOICE_SRC.slice(catchAt, catchAt + 80)).toContain("Offline parsing");
  });
});

describe("behaviour is unchanged", () => {
  test("with no key the LLM path is not offered", () => {
    // The tests run without VITE_OPENAI_API_KEY, which is exactly the
    // configuration where the old static import was being tree-shaken.
    expect(isLlmAvailable()).toBe(false);
  });

  test("and parsing still works, through the offline Hungarian parser", async () => {
    const r = await parseVoiceMetrics("Nagyon jó napom volt, sokat futottam és a családommal voltam.");
    expect(r.source).toBe("offline");
    expect(r.mood).toBe(5);
    expect(r.activities).toContain("Mozgás");
    expect(r.activities).toContain("Család");
  });

  test("an unrecognised sentence yields no invented numbers", async () => {
    const r = await parseVoiceMetrics("Hétköznap volt.");
    expect(r.source).toBe("offline");
    expect(r.mood).toBeNull();
    expect(r.stress).toBeNull();
  });
});

const DIST_MAIN = (() => {
  if (!existsSync("dist/assets")) return null;
  const js = readdirSync("dist/assets").filter((f) => /^index-.*\.js$/.test(f));
  return js.length > 0 ? `dist/assets/${js[0]}` : null;
})();

describe.skipIf(DIST_MAIN === null)("the built bundle (skipped when there is no dist)", () => {
  test("the main chunk carries no SDK signature", () => {
    const code = readFileSync(DIST_MAIN!, "utf8");
    for (const sig of SDK_SIGNATURES) {
      expect(code.includes(sig), `${sig} is in the main chunk`).toBe(false);
    }
  });
});