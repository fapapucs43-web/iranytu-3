/**
 * Icon set picker (Batch 7, P12).
 *
 * The default row is NOT a set. It is "Nincs beállítva", which renders exactly
 * what the app rendered before Batch 7 — the literal character. It has to be
 * its own row because it is semantically different from "Rendszer emoji":
 * both look identical, but one means "you never chose" and the other means
 * "you chose this and it happens to look the same". Collapsing them would
 * quietly turn an existing user's untouched settings into a choice they never
 * made, and would make "go back to how it looked" impossible once they had
 * visited this screen.
 *
 * Every sample is the same five glyphs in every set, so the comparison is
 * honest — the mood scale is what a user actually judges a set by, and it is
 * also the surface the "zero change by default" constraint is about.
 *
 * The licences live here rather than on their own screen because this is the
 * only place a user is choosing between sets, so it is the only place a
 * licence question is actually in mind. (It used to be here for a harder
 * reason — Twemoji's CC-BY 4.0 obliged us to credit it somewhere the user
 * could see. That set is withdrawn, and the obligation with it; the licence
 * list stayed because it is useful, not because it is required.)
 *
 * WHY THE CHROME EXCEPTION IS ON THIS SCREEN
 * A user who picks a 3D set will look for the icons that did not change, and
 * they are right to. Batch 7f routed the 39 sites that had a picture available
 * and left 46 deliberately alone, because a 3D rendering of a plus sign, a
 * magnifier or a padlock is worse than a line drawing of one — but "some icons
 * stay line-drawn, on purpose" only reassures if the user can see WHICH and WHY.
 * So the list is here, under a disclosure, with the reason for each. An exception
 * nobody can see is not documented; it is merely tolerated.
 */
import {
  GLYPHS,
  ICON_SETS,
  glyphArtwork,
  glyphDef,
  licenceEntries,
  type IconSetId,
} from "../lib/iconsets";
import { CHROME_GROUP_LABEL, CHROME_ICON_NAMES, chromeByGroup } from "../lib/icon-policy";
import { InlineArtwork, useIconSet, useWarmFluentArtwork } from "../state/IconSetContext";
import { Check, getIcon } from "../lib/icons";
import { t } from "../lib/i18n";

/** The glyphs every sample shows: the mood scale, in order. */
const SAMPLE = ["😖", "😕", "😐", "🙂", "😄"];

/**
 * Draw one glyph for an EXPLICIT set, ignoring the current selection.
 *
 * Separate from <GlyphIcon> on purpose: a picker row must be able to show what
 * a set LOOKS like before the user commits to it, and a component that reads
 * the selection can only ever show the set already chosen.
 *
 * Batched 7b this no longer has a hover-warming state, and there is still
 * nothing for an `onWarm` callback to do: the picker asks for the artwork chunk
 * once, on mount, rather than on hover.
 *
 * WHAT THE SPLIT CHANGED, plainly: the artwork is a string in a separate chunk
 * now, not in the module graph of the entry bundle. On the very first paint
 * after that chunk is requested, a sample for an inline set draws its Lucide
 * icon and becomes the real artwork a moment later. That is the same branch an
 * unservable set takes, and it lasts one chunk rather than sticking.
 */
function PreviewGlyph({
  setId,
  glyph,
}: {
  setId: IconSetId | undefined;
  glyph: string;
}) {
  useWarmFluentArtwork();
  const def = glyphDef(glyph);
  if (!def) return <>{glyph}</>;

  // No set chosen, or the system set: the literal character, which is what
  // the app has always drawn.
  if (setId === undefined || setId === "system") return <>{glyph}</>;

  const fallback = <LucideIcon name={def.lucide} glyph={glyph} />;

  if (setId === "lucide") return fallback;

  // An inline set, once its chunk has landed. Until then this is undefined and
  // the fallback below draws, which is the correct answer for a beat rather
  // than a state that could stick.
  const artwork = glyphArtwork(setId, glyph);
  if (artwork) {
    return <InlineArtwork svg={artwork} />;
  }

  // A set that promises artwork and cannot supply it yet — because its chunk is
  // still in flight, or because the stem was never vendored. The Lucide icon is
  // a perfectly good icon, and showing it here is the same thing the app would
  // do.
  return fallback;
}

function LucideIcon({ name, glyph }: { name: string; glyph: string }) {
  const Comp = getIcon(name);
  return Comp ? <Comp /> : <>{glyph}</>;
}

export default function IconSetPicker() {
  const { selected, setIconSet } = useIconSet();
  const entries = licenceEntries(selected);

  // Batched 7b there is nothing to warm, nothing to retry, and nothing that
  // can come back half-loaded. Every set is either free or already in the
  // bundle, so a row can be hovered or focused with no cost at all — which was
  // the one thing the font picker still has to be careful about and the icon
  // picker no longer has to think about. The `onMouseEnter`/`onFocus` warming
  // hooks and the partial-load warning that used to live here were removed with
  // the runtime that served them, not left as dead branches.

  return (
    <div className="iconset-picker">
      <p className="muted-note">{t("iconset.intro")}</p>
      <p className="muted-note">
        {t("iconset.contentNote", { count: CHROME_ICON_NAMES.length })}
      </p>

      <div
        className="iconset-rows"
        role="radiogroup"
        aria-label={t("iconset.groupLabel")}
      >
        <button
          type="button"
          role="radio"
          aria-checked={selected === undefined}
          className={`iconset-row ${selected === undefined ? "iconset-row-active" : ""}`}
          onClick={() => setIconSet(undefined)}
        >
          <span className="iconset-row-head">
            <strong>{t("iconset.noneLabel")}</strong>
            {selected === undefined && <Check size="1.1em" />}
          </span>
          <span className="iconset-sample" aria-hidden="true">
            {SAMPLE.map((g, i) => (
              <PreviewGlyph key={i} setId={undefined} glyph={g} />
            ))}
          </span>
          <span className="iconset-blurb">{t("iconset.noneBlurb")}</span>
        </button>

        {ICON_SETS.map((s) => {
          const isActive = selected === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              className={`iconset-row ${isActive ? "iconset-row-active" : ""}`}
              onClick={() => setIconSet(s.id)}
            >
              <span className="iconset-row-head">
                <strong>{s.label}</strong>
                {isActive && <Check size="1.1em" />}
                <span className="iconset-cost">{s.downloadLabel}</span>
              </span>
              <span className="iconset-sample" aria-hidden="true">
                {SAMPLE.map((g, i) => (
                  <PreviewGlyph key={i} setId={s.id} glyph={g} />
                ))}
              </span>
              <span className="iconset-blurb">{s.blurb}</span>
            </button>
          );
        })}
      </div>

      <details className="iconset-chrome">
        <summary>{t("iconset.chromeSummary", { count: CHROME_ICON_NAMES.length })}</summary>
        <p className="muted-note">{t("iconset.chromeBody")}</p>
        {chromeByGroup().map(({ group, icons }) => (
          <div key={group} className="iconset-chrome-group">
            <h5>{CHROME_GROUP_LABEL[group]}</h5>
            <ul>
              {icons.map((c) => (
                <li key={c.name}>
                  <code>{c.name}</code>
                  <span className="muted-note"> — {c.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </details>

      <div className="iconset-licences">
        <h4>{t("iconset.licencesHeading")}</h4>
        <ul>
          {entries.map((e) => (
            <li key={e.setId}>
              <strong>{e.label}</strong>
              {e.used && <span className="iconset-badge">{t("iconset.inUse")}</span>}
              <span className="iconset-licence-line">
                {e.licence} · {e.credit}
              </span>
              <span className="iconset-licence-note">{e.licenceNote}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Exported for the test that proves the sample is the mood scale, not a pick. */
export { SAMPLE, GLYPHS };
