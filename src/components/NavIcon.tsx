/**
 * One bottom-nav icon, drawn by whichever set the user chose.
 *
 * WHY THIS IS NOT `<GlyphIcon>`
 * `GlyphIcon` answers a content question: "the data holds this emoji, draw
 * it". Its contract when the glyph is not in `GLYPHS` is to draw the literal
 * character, which is right for a user's own custom emoji and wrong for a nav
 * row. ⚙️ is a real Unicode character the OS draws, but it is not one of the
 * 38 glyphs this app knows about, so routing the nav through `GlyphIcon` would
 * have rendered it as a flat system character even when the user picked Fluent.
 *
 * The decision lives here instead, where the nav's own registry is in scope,
 * and it is made per item:
 *
 *   no set chosen  → Lucide, byte for byte what shipped before
 *   lucide         → Lucide
 *   system         → the row's own character
 *   fluent         → the row's Fluent artwork
 *   a set with no artwork for this item → Lucide, for this item only
 *
 * The last line is the one that matters. Falling back for the WHOLE bar would
 * leave a user with a half-Lucide, half-3D navigation, which reads worse than
 * either. Every row has artwork in every shipped set today, so this path
 * exists for a set added later.
 *
 * It is a COMPONENT, not a hook, because it is rendered inside a `.map()` —
 * a hook called once per nav item would change how many times it runs on
 * every render and break the rules of hooks.
 */
import { getIcon } from "../lib/icons";
import { fluentArtworkSync } from "../lib/iconsets";
import { navCharacter, navFluentStem, navIconDef } from "../lib/nav-icons";
import { InlineArtwork, useIconSet, useWarmFluentArtwork } from "../state/IconSetContext";
import type { TabId } from "../types";

export default function NavIcon({ tab }: { tab: TabId }) {
  const { selected } = useIconSet();
  // The bar draws on every screen, so this is the one caller that must never
  // wait behind a slow chunk to look right: it asks once, and until the artwork
  // arrives every tab draws its Lucide icon, which is what this bar looked like
  // before any set could be chosen at all.
  useWarmFluentArtwork();

  // No set chosen is the pre-Batch-7 appearance and must stay exactly that,
  // for the nav as much as for the mood scale.
  if (selected === undefined || selected === "lucide") return <Lucide tab={tab} />;

  if (selected === "system") {
    const character = navCharacter(tab);
    return character ? <>{character}</> : <Lucide tab={tab} />;
  }

  // Artwork-backed sets. The stem is looked up in the set's own artwork, NOT
  // routed through the content glyph registry: a nav glyph need not be one of
  // the 38 the app stores in its data, and asking the content registry for it
  // returns nothing rather than the artwork.
  const stem = navFluentStem(tab);
  if (!stem) return <Lucide tab={tab} />;
  // A stem with no artwork falls back to Lucide, like the missing-stem case
  // above — and so does a stem whose artwork has not been fetched yet, which is
  // the same branch reached a moment earlier rather than ever. Returning null
  // here would leave a blank slot in the bar, which is the one outcome worse
  // than a monochrome icon.
  const svg = fluentArtworkSync(stem);
  if (!svg) return <Lucide tab={tab} />;
  // `InlineArtwork` is the same component the content icons use, so the nav and
  // the content cannot drift on sizing or on the accessibility surface.
  return <InlineArtwork svg={svg} />;
}

/** The Lucide icon for one nav item — the default and every fallback. */
function Lucide({ tab }: { tab: TabId }) {
  const name = navIconDef(tab)?.lucide;
  const Comp = name ? getIcon(name) : undefined;
  return Comp ? <Comp /> : null;
}
