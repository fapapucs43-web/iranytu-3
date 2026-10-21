/**
 * One content icon, drawn by whichever set the user chose (Batch 7f).
 *
 * WHY THIS EXISTS AND NOT MORE `<GlyphIcon>` CALLS
 * The gap Batch 7f closed was thirty-nine call sites — section headers, the
 * streak flame, the app's own logo, a primary button — that drew a Lucide icon
 * by name even though the content registry already held a picture for every one
 * of them. Rewriting those as `<GlyphIcon glyph="🔥" />` would work, but it
 * throws away the link between the two things that are actually the same icon:
 * the name the call site knows ("Flame") and the emoji the data stores ("🔥").
 * A call site that has to pick one of those to express an icon has to be right
 * about which, and nothing checks it. This component takes the name, looks the
 * emoji up, and lets the set decide — so the 39 sites differ only in a string
 * and the mapping is asserted once, in `iconsets.ts`.
 *
 * WHY IT IS NOT `<GlyphIcon>`
 * `GlyphIcon` answers "the DATA holds this emoji". This answers "this SCREEN
 * needs the flame", and the screen usually does not have an emoji at all — the
 * mood pills, activity chips and achievement badges are the ones that do, and
 * they are already `GlyphIcon`. The difference matters at the edges:
 *
 *   - `GlyphIcon`'s contract for an unknown glyph is "draw the literal
 *     character", which is right for a user's own custom emoji. Here an
 *     unknown NAME is a bug in the call site, and silently drawing a character
 *     would hide it — so this component falls back to Lucide and says so in
 *     development.
 *   - `GlyphIcon` is never asked to be a particular size. Nearly every one of
 *     these 39 sites passed `size="1.1em"` to Lucide, so the size has to
 *     survive the swap or every card header changes height.
 *
 * THE SIZE IS THE INTERESTING PART
 * Lucide's `size` is a width and a height; `.iconset-inline` is 1em square;
 * a bare emoji is sized by the font. Three different boxes for one icon, and
 * the app looks wrong the moment they disagree — a 3D set would make every
 * card header a different height from the Lucide one it replaced. So `size`
 * defaults to `"24px"`, Lucide's own default, and is then applied to whichever
 * branch actually renders. With no `size` prop the icon is the same size in
 * all three sets, which is the whole point of routing it.
 *
 * WHY "NO SET CHOSEN" IS LUCIDE HERE AND AN EMOJI IN `GlyphIcon`
 * The two components look similar and are not interchangeable on this point.
 *
 * `GlyphIcon` is asked to draw something the DATA already holds as an emoji —
 * the mood pill says "🙂" — so drawing the character is drawing what was
 * always there, and that is what a user who never opened the picker saw.
 *
 * These 39 call sites are different: they said `<Flame />`, a Lucide name, and
 * that is what every user has seen since before Batch 7. Routing them through
 * `renderModeFor` — which answers "emoji" for an unset selection, correctly,
 * for a data glyph — would have replaced the app's default appearance with a
 * row of system emoji for every user who had never chosen a set. That is the
 * exact regression Batch 7 existed to prevent, arrived at from the other
 * direction.
 *
 * So the rule here is `NavIcon`'s rule, for the same reason: an unset
 * selection is the pre-Batch-7 appearance and must stay byte-for-byte the
 * pre-Batch-7 appearance, whichever component is drawing.
 */
import { getIcon } from "../lib/icons";
import { glyphArtwork, glyphForLucideName } from "../lib/iconsets";
import { InlineArtwork, useIconSet, useWarmFluentArtwork } from "../state/IconSetContext";

export type ContentIconProps = {
  /** The Lucide component name, as `lib/icons` spells it. */
  name: string;
  /**
   * The box, in any CSS length. Defaults to Lucide's own 24px so a routed icon
   * is the size it was before it was routed. Pass what the Lucide call used to
   * pass (`"1.1em"` is the common one).
   */
  size?: string;
  /** Extra class, for the handful of sites that style the box. */
  className?: string;
  /**
   * Accessible name. Omitted everywhere in this app, which is correct: all 39
   * call sites are decorative and sit beside a visible label.
   */
  label?: string;
};

/** Lucide's default, used so a routed icon is the size it replaced. */
const DEFAULT_SIZE = "24px";

export default function ContentIcon({
  name,
  size = DEFAULT_SIZE,
  className,
  label,
}: ContentIconProps) {
  const { selected, appliedAt } = useIconSet();
  // Read so the component re-renders when a set finishes warming; the swap then
  // lands once, in one pass, rather than icon by icon as a screen scrolls.
  void appliedAt;
  // The artwork is its own chunk now. Until it arrives `glyphArtwork` answers
  // undefined and the Lucide branch below draws — the same icon this component
  // already fell back to for a glyph no set could serve.
  useWarmFluentArtwork();

  const glyph = glyphForLucideName(name);

  // No set chosen, or the set that IS Lucide: the appearance this app shipped
  // before Batch 7, kept for the same reason it is kept everywhere else.
  if (selected === undefined || selected === "lucide") {
    return <Lucide name={name} size={size} className={className} label={label} />;
  }

  // No emoji backs this name, so no set has anything to offer. The correct
  // answer is the Lucide icon — which is exactly what a chrome icon wants, and
  // why chrome icons are supposed to be named in `lib/icon-policy.ts` instead
  // of reaching for this component. Rendered, not thrown: a missing picture
  // must never take a screen down, and the icon it falls back to is a good one.
  if (!glyph) {
    return <Lucide name={name} size={size} className={className} label={label} />;
  }

  const box = { width: size, height: size, fontSize: size };

  if (selected === "system") {
    return (
      <span
        className={className}
        style={box}
        aria-hidden={label ? undefined : true}
        aria-label={label}
      >
        {glyph}
      </span>
    );
  }

  const artwork = glyphArtwork(selected, glyph);
  if (artwork) {
    return (
      <InlineArtwork svg={artwork} className={className} label={label} style={box} />
    );
  }
  // The stem is in the registry and the artwork module is generated from the
  // same registry, so this cannot fire. If it ever does, Lucide is the last
  // branch of the chain rather than an empty slot.
  return <Lucide name={name} size={size} className={className} label={label} />;
}

/**
 * The Lucide drawing, at the same size the caller asked for.
 *
 * Its own function so the four places that fall back to it say so once, rather
 * than repeating the `Comp ? … : null` dance — a null there is an empty slot in
 * a card header, and there should be exactly one place that decides that.
 */
function Lucide({
  name,
  size,
  className,
  label,
}: {
  name: string;
  size: string;
  className?: string;
  label?: string;
}) {
  const Comp = getIcon(name);
  return Comp ? <Comp size={size} className={className} label={label} /> : null;
}
