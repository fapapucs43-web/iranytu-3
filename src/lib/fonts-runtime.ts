/**
 * Font loading runtime (Batch 5, P10b → revised in Batch 8).
 *
 * This is the only part of the typography work that touches the DOM, and it is
 * kept separate from `lib/fonts.ts` so the registry itself stays a pure data
 * module that tests can exercise without a browser.
 *
 * LOADING STRATEGY — why nothing is in the HTML
 * The default selection is the system stack, so a first-time visitor downloads
 * ZERO font bytes. A web font is fetched only when the user picks it, and from
 * then on it is in the HTTP cache and in our service worker. The cost of this
 * approach is a possible brief flash of fallback text on the very first pick;
 * `document.fonts.ready` is awaited before the family is actually applied, so
 * the swap is atomic and the user never sees the intermediate state.
 *
 * TWO INDEPENDENT FAMILIES
 * `--app-font` and `--hand-font` are separate properties written separately.
 * That is what keeps Dancing Script off the buttons: the notes can be in a
 * script face while every piece of UI chrome reads `--app-font`, and turning
 * handwriting on does not touch the UI family at all. When the handwriting
 * control is off, `--hand-font` is simply left equal to the UI stack, so a
 * stylesheet rule naming it needs no special case for "off".
 *
 * The one exception to lazy loading is the preload hint: if the *currently
 * selected* family is a web font, we inject a `<link rel=preload as=font>` for
 * its `latin` 400 subset so the browser starts fetching it in parallel with the
 * app's own bundle instead of after first paint. Only the selected family is
 * ever preloaded — hinting all five would defeat the point of lazy loading.
 */
import {
  fontFaceDescriptors,
  fontDef,
  handFaceDescriptors,
  handFontDef,
  isFontId,
  isHandFontId,
  preloadHref,
  handPreloadHref,
  SYSTEM_FONT_STACK,
} from "./fonts";

/** Families already registered with document.fonts, keyed by id. */
const registered = new Set<string>();
/** Families currently being fetched, so we never double-request. */
const inFlight = new Map<string, Promise<void>>();

/** True where the FontFace API exists (every browser we target; not in Bun). */
function canLoadFonts(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof FontFace !== "undefined" &&
    typeof document.fonts !== "undefined" &&
    document.fonts !== null
  );
}

/** Register + fetch a set of descriptors, tolerating a family that will not load. */
async function register(
  key: string,
  descriptors: ReturnType<typeof fontFaceDescriptors>,
): Promise<void> {
  if (descriptors.length === 0) return;
  const job = (async () => {
    try {
      const faces = descriptors.map(
        (d) =>
          new FontFace(d.family, d.src, {
            weight: d.weight,
            unicodeRange: d.unicodeRange,
            display: "swap",
          }),
      );
      await Promise.all(faces.map((f) => f.load()));
      for (const f of faces) document.fonts.add(f);
      registered.add(key);
    } catch {
      // A missing or corrupt file must never break the app: the CSS stack ends
      // in the system stack, so the worst case is that nothing changes.
      registered.add(key);
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);
  await job;
}

/**
 * Register + fetch a UI family. Idempotent and safe to call on every render.
 * `system` resolves immediately — there is nothing to load.
 */
export function loadFont(id: unknown): Promise<void> {
  if (!isFontId(id)) return Promise.resolve();
  const key = id;
  if (!fontDef(key).family) return Promise.resolve(); // system
  if (registered.has(key)) return Promise.resolve();
  if (!canLoadFonts()) return Promise.resolve();
  return inFlight.get(key) ?? register(key, fontFaceDescriptors(key));
}

/** The same, for the handwriting family. `none` resolves immediately. */
export function loadHandFont(id: unknown): Promise<void> {
  if (!isHandFontId(id)) return Promise.resolve();
  const key = id;
  if (!handFontDef(key).family) return Promise.resolve(); // none
  if (registered.has(key)) return Promise.resolve();
  if (!canLoadFonts()) return Promise.resolve();
  return inFlight.get(key) ?? register(key, handFaceDescriptors(key));
}

/** True once a family is registered and safe to reference from CSS. */
export function isFontReady(id: unknown): boolean {
  return isFontId(id) && (registered.has(id) || !fontDef(id).family);
}

/** True once the handwriting family is registered, or was never needed. */
export function isHandFontReady(id: unknown): boolean {
  return isHandFontId(id) && (registered.has(id) || !handFontDef(id).family);
}

/** Test seam: forget what we think is loaded. */
export function resetFontCache(): void {
  registered.clear();
  inFlight.clear();
}

/**
 * Add the `<link rel=preload>` hint for a family, once per slot.
 *
 * Two independent slots, because the UI family and the handwriting family are
 * chosen separately and either may be the only web font in play. One slot for
 * both would mean whichever hint landed first suppressed the other.
 */
function hint(slot: string, href: string | null): void {
  if (!href) return;
  if (document.querySelector(`link[data-font-preload="${slot}"]`)) return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "font";
  link.type = "font/woff2";
  link.crossOrigin = "anonymous";
  link.setAttribute("data-font-preload", slot);
  link.href = href;
  document.head.appendChild(link);
}

export function preloadFont(id: unknown): void {
  if (typeof document === "undefined") return;
  hint("app", preloadHref(id));
}

export function preloadHandFont(id: unknown): void {
  if (typeof document === "undefined") return;
  hint("hand", handPreloadHref(id));
}

/**
 * Set the CSS custom property the stylesheet reads. Kept as a variable so the
 * whole app re-renders in the new face with one write, and so the value lives
 * on <html> where both the body rule and the picker can see it.
 */
export function applyFontStack(id: unknown): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--app-font", fontDef(id).stack);
}

/**
 * Set the face for the user's own words.
 *
 * `null` — meaning handwriting is off — writes the *UI* stack, not the system
 * stack: with Montserrat selected and handwriting off, the notes must still be
 * Montserrat. Removing the property instead would fall back to the stylesheet's
 * own declaration, which happens to be the system stack, so a user who picked
 * Montserrat would see their notes silently switch back to the system face.
 *
 * Taking the UI id as an argument rather than reading `--app-font` back keeps
 * the two properties a pure function of the settings, with no ordering
 * requirement between the two writes.
 */
export function applyHandStack(handId: unknown, uiId: unknown): void {
  if (typeof document === "undefined") return;
  const hand = isHandFontId(handId) ? handFontDef(handId).stack : null;
  document.documentElement.style.setProperty(
    "--hand-font",
    hand ?? fontDef(uiId).stack ?? SYSTEM_FONT_STACK,
  );
}
