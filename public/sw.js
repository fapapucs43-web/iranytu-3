/*
 * Belső Iránytű service worker (Batch 2, P9) — PROD ONLY (registered from
 * src/lib/pwa.ts with `import.meta.env.PROD` guard; never in dev).
 *
 * Stale-bundle prevention:
 * - pwa.ts registers this worker under the deployment's base as
 *   `<base>sw.js?v=<bundle content hash>`; the cache is NAMED after that
 *   version, so each deploy gets a brand-new cache.
 * - `install` PRECACHES that cache's whole content list, filled before the old
 *   one is deleted, so a deploy replaces the offline copy atomically instead of
 *   emptying it. The list is generated into the marked block below by
 *   `scripts/precache-manifest.mjs` — it cannot be hand-written, because Vite
 *   copies this file before it hashes the assets and so nothing written here
 *   can know the filenames a given build produces.
 * - index.html (navigations) is served NETWORK-FIRST: returning users always
 *   get the newest HTML, which references the newest hashed bundles.
 * - On activate the old versioned caches are deleted (skipWaiting + claim).
 * - Hashed /assets files are immutable, so they are safe to cache-first.
 *
 * Fonts (Batch 5, P10b) are cache-first for the same reason: the woff2 files
 * in /fonts/ are versioned by FILENAME, and a face that 404s offline would
 * leave the app rendering in a different typeface from the one the user chose
 * — a silent, permanent downgrade for exactly the users who picked a custom
 * face. Serving them from cache keeps the choice stable offline.
 *
 * Icon sets are NOT here, and Batch 7b is why. There used to be an
 * `/iconsets/` rule beside `/fonts/`, for artwork fetched from
 * `/iconsets/fluent-v1/` and `/iconsets/twemoji-v1/`. Both directories are
 * gone: the artwork is inlined into the bundle and the CC-BY set is withdrawn.
 * With nothing to serve, the rule could only do harm — `caches.put` below
 * stores whatever came back, so a request for a withdrawn path would have
 * cached its 404 and served it for the rest of that cache's life.
 */
/*
 * THE VERSION, from TWO sources, because one of them can go missing at runtime.
 *
 * `pwa.ts` registers this worker as `<base>sw.js?v=<bundle hash>`, and that
 * query string is the first source. It is not the only one: a worker can also be
 * fetched by the browser's own update check with no query string at all (the
 * spec's implied script URL comparison, a redirected request, a hand-registered
 * worker in someone's devtools), and the old fallback for that case was the
 * string "stable" — the same cache name for every build, i.e. a cache that
 * survives a deploy and keeps answering with the previous bundle's assets.
 *
 * So the fallback is now a BUILD ID that `scripts/precache-manifest.mjs`
 * bakes into this file at build time: the hash of the built `index.html`, which
 * changes whenever any bundle's own hash changes. Two consequences, both
 * wanted: a worker is never named after a build it might not be, and the
 * worker's BYTES differ from one deploy to the next, which is the diff the
 * browser runs before it decides whether a worker is new.
 */
const QUERY_VERSION = new URLSearchParams(self.location.search).get("v");
/* BUILD_VERSION_START */
const BUILD_VERSION = "dev";
/* BUILD_VERSION_END */
const VERSION = QUERY_VERSION || BUILD_VERSION;
const CACHE = `belso-iranytu-${VERSION}`;

/*
 * THE DEPLOYMENT'S OWN PATH — read from the one place that knows it AT
 * RUNTIME, because nothing in the built file can.
 *
 * This worker has to work at an origin root (`/`) and under a project site
 * (`/iranytu-3/` on GitHub Pages). `public/sw.js` is copied verbatim before
 * the build knows its own base, and a second marker block for the base would
 * be a second template to keep in step — so the base is derived instead:
 * `pwa.ts` registers this worker with `scope` set to the deployment's base,
 * and a service worker's scope is always a directory. The scope's pathname
 * therefore IS the base, and every path in this file stays written
 * root-style (`/index.html`, `/assets/…`), rebased against it below.
 *
 * Trailing slash stripped, so `under("/x")` is a plain concatenation: root
 * gives `/x`, a project site gives `/iranytu-3/x` — the same url the reader's
 * page actually asked for, and the same key `cache.addAll` stores it under.
 */
const BASE = new URL(self.registration.scope).pathname.replace(/\/+$/, "");

/** A root-style path as this deployment's own url. */
const under = (p) => BASE + p;

/* PRECACHE_MANIFEST_START */
const PRECACHE = [];
/* PRECACHE_MANIFEST_END */

self.addEventListener("install", (event) => {
  // The whole point of this handler is the ORDERING, so it is worth stating
  // what it buys:
  //
  //  - `addAll` fills the new version-named cache BEFORE install resolves, so
  //    `activate` — which DELETES every older cache — cannot run against a
  //    half-built one. Without this, each deploy destroyed the reader's whole
  //    offline copy and only rebuilt it by accident, one asset at a time, as
  //    they happened to be requested again.
  //  - If `addAll` rejects, install rejects with it, the browser keeps the OLD
  //    worker, and the old cache is never deleted. So a failed precache leaves
  //    the reader exactly where they were rather than with nothing.
  //  - `skipWaiting` sits INSIDE the waitUntil, after the fill, so it cannot
  //    promote this worker ahead of a precache that has not finished.
  //
  // `addAll` is all-or-nothing on purpose. Populating entry by entry and
  // activating on a partial cache would be worse: `activate` deletes the old
  // cache either way, so a flaky network during install would leave the reader
  // with a fraction of an app instead of all of the previous one.
  //
  // The list below is written by `scripts/precache-manifest.mjs` at build
  // time, which also refuses to emit an entry the build did not produce. The
  // empty array above is the template state and never ships: the script throws
  // if it cannot find the markers below.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Rebased through `under`: the list is written root-style by the
      // generator, and a project site's copy of every file lives under the
      // base. `addAll` is all-or-nothing either way — see above.
      await cache.addAll(PRECACHE.map(under));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("belso-iranytu-") && n !== CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/*
 * THE ESCAPE HATCH FOR A WORKER THAT IS STUCK IN `waiting`.
 *
 * WHY IT IS NEEDED even though `install` already calls `skipWaiting()`: the
 * browser parks a NEWLY installed worker in `waiting` whenever a document of the
 * previous version is still open, and `skipWaiting()` inside `install` is a
 * request the browser may not have acted on yet. That is the state a reader gets
 * stuck in — the deploy is installed, the old worker keeps answering, and the
 * only thing that ends it is every tab being closed, which someone with one tab
 * open never does.
 *
 * So the page is allowed to ask, and it is the only side that knows the reader is
 * looking at a stale app: `SKIP_WAITING` is answered by the worker promoting
 * itself, which fires `controllerchange` on the page and lets it reload onto the
 * deploy. Nothing else is accepted over this channel: a message a page can send
 * is a message any script on the origin can send, so the only verb here is the
 * one that is safe to honour unconditionally.
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // REBASE `url` to the deployment, so every rule below is written
  // root-style and stays true at any base. The scope already guarantees the
  // pathname starts with the base — this only removes it again; `url` is the
  // rule's INPUT and nothing below ever fetches it (requests go by `req`).
  if (BASE && url.pathname.startsWith(`${BASE}/`)) {
    url.pathname = url.pathname.slice(BASE.length) || "/";
  }

  // Navigations: network-first so a deploy is picked up immediately.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          // Keyed under the base, matching what the precache stored — a
          // project site's document is `/iranytu-3/index.html`, not the
          // origin root's.
          caches.open(CACHE).then((c) => c.put(under("/index.html"), copy));
          return res;
        })
        .catch(() =>
          caches.match(under("/index.html")).then((r) => r || caches.match(req)),
        ),
    );
    return;
  }

  // Immutable hashed assets + icons + self-hosted fonts: cache-first.
  //
  // `/pdf-fonts/` is the PDF report's own subsetted TTFs, vendored by
  // `scripts/subset-pdf-font.ts` into its own directory (Batch 7i) because
  // `public/fonts/` is required to hold exactly the UI registry. They are
  // fetched only when someone exports a PDF, and once fetched here they are
  // available offline for ever — which is what makes a report exportable on a
  // train. Same rule, same reason, one line.
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/pdf-fonts/")
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
  // Everything else (manifest, sw.js itself…) goes to the network untouched.
});
