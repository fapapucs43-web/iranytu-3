/**
 * The one Node built-in this project uses, declared by hand.
 *
 * WHY THIS FILE EXISTS
 * `src/lib/font-cmap.ts` decompresses a woff2 with Brotli, which Node and Bun
 * both ship in core. There is no `@types/node` in this project's `tsconfig`,
 * and adding one would be a new dependency bought purely so a test-only parser
 * would typecheck — which is a bad trade for a mood journal that promises
 * nothing leaves the device, and a worse one for a file that never runs in
 * production.
 *
 * So the surface is declared here, and deliberately it is the WHOLE surface:
 * one function, one signature. A hand-written declaration that grew to cover
 * `node:fs` and `node:path` would be a second, divergent copy of Node's types
 * — the same failure mode as a hand-maintained font list, and for the same
 * reason.
 *
 * If `@types/node` is ever added, delete this file. The compiler will tell you
 * the declaration is then redundant, and that is the intended ending.
 */
declare module "node:zlib" {
  /**
   * Decompress a Brotli buffer.
   *
   * The real signature takes a second options argument; it is omitted here
   * because nothing in this repository passes one, and a declaration that
   * accepts an argument no caller uses is a declaration nobody has checked.
   */
  export function brotliDecompressSync(buffer: Uint8Array): Uint8Array;
}
