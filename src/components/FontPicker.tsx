/**
 * Typeface picker (Batch 5, P10b → revised in Batch 8).
 *
 * A radio group, not a free-text field — the whole point of the module is that
 * the families are known-good and already downloaded onto our own origin.
 *
 * LIVE PREVIEW, TWO KINDS
 * 1. Picking an option applies it to the ENTIRE app immediately, because the
 *    provider writes `--app-font` as soon as the family is loaded. The user can
 *    see the real effect on real screens, not a swatch.
 * 2. Before committing, pointing at or tabbing to an option loads that family
 *    so its own sample row renders in the real face. We deliberately do NOT
 *    load all of them up front: that would spend ~480 kB the moment anyone
 *    opens Settings, which is exactly the cost the lazy design exists to avoid.
 *
 * THE SAMPLE TEXT
 * Short, neutral, and — the part that matters — it contains BOTH ő and ű. The
 * previous sample was the Hungarian pangram "Árvíztűrő tükörfúrógép", which was
 * a good coverage test and a bad shop window: it is an artefact of linguistics
 * rather than anything a person would write, and it makes a font look like a
 * font specimen. A pangram also stresses the face with a letter frequency no
 * real text has, which is the opposite of what someone is judging when they
 * pick a typeface for a journal. "Így őrzöm a tűz emlékét." is what the user
 * would actually see in a note, and it still renders both Hungarian diacritics
 * that only the `latin-ext` subset covers — so it tests the subset and reads
 * like a sentence. Both letters are load-bearing here: ő and ű are the two
 * characters a Latin-only web font would silently fall back on, and a sample
 * that only proves one of them proves half the thing.
 *
 * THE HANDWRITING CONTROL IS SEPARATE, AND BELOW
 * Dancing Script is not a row above. A script face in a 200px-wide button, or
 * as a form label, is unreadable at the sizes this app actually uses — and
 * this app's whole premise is that it is large-type and easy to read. So the
 * decision is not "which font" but "do my own notes get a handwriting face",
 * which is a different question and gets its own control with its own preview.
 *
 * WHY THE LIST IS GROUPED, AND WHY IT IS STILL ONE RADIOGROUP
 * A user reported that Inter, Montserrat and Roboto "look nearly identical",
 * which is true: they are all neutral grotesques, and a flat list of names
 * asks the reader to already know a difference they cannot see. Grouping by
 * kind makes the shape of the choice legible — four sans, two serif, one
 * rounded, one condensed, one monospaced — so the user can at least tell that
 * the two serifs belong together even if the two sans faces do not stand apart.
 *
 * The grouping is `role="group"` INSIDE a single `role="radiogroup"`, not five
 * radio groups. It is still one question — which face for the app — and one
 * question has one answer, so a screen reader should say so. Five groups would
 * read as five questions and would break arrow-key movement across the whole
 * list. The headings are `aria-label`s on the inner groups, which is what gives
 * a screen-reader user the same shape the sighted user gets.
 */
import { useFont } from "../state/FontContext";
import {
  FONTS,
  FONT_CATEGORY_LABELS,
  FONT_CATEGORY_NOTES,
  HAND_FONTS,
  SYSTEM_FONT_STACK,
  fontWeightKb,
  fontsByCategory,
  handWeightKb,
  type FontDef,
} from "../lib/fonts";
import { t } from "../lib/i18n";

/**
 * Short, neutral, and carries both ő and ű — the two letters that live only in
 * the `latin-ext` subset. See the file header for why this replaced the
 * pangram.
 */
const SAMPLE = t("font.sample");

/** The bold line previews the weight axis, not the diacritics. */
const SAMPLE_BOLD = t("font.sampleBold");

/**
 * The handwriting preview, which must show the face at a readable size. The
 * hand faces ship without the weight axis, so the bold line would prove
 * nothing there — hence one face, and it reuses the sample above rather than
 * repeating a sentence that must stay byte-identical between the two previews.
 */
const HAND_SAMPLE = SAMPLE;

export default function FontPicker() {
  const {
    fontId,
    setFont,
    loadForPreview,
    handFontId,
    setHandFont,
    loadHandForPreview,
  } = useFont();

  return (
    <div>
      <p className="muted-note">{t("font.intro")}</p>
      <div className="font-categories" role="radiogroup" aria-label={t("font.groupLabel")}>
        {fontsByCategory().map(({ category, fonts }) => (
          <div
            key={category}
            className="font-category"
            role="group"
            aria-label={FONT_CATEGORY_LABELS[category]}
          >
            <h4 className="font-category-title">{FONT_CATEGORY_LABELS[category]}</h4>
            <p className="muted-note font-category-note">{FONT_CATEGORY_NOTES[category]}</p>
            <div className="font-grid">
              {fonts.map((f) => (
                <FontOption
                  key={f.id}
                  font={f}
                  active={fontId === f.id}
                  onSelect={setFont}
                  onPreview={loadForPreview}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/*
        A second radiogroup, not a row in the one above. A `<fieldset>`-free
        structure is fine here because each button already carries
        role="radio" and the group is labelled; nesting the groups visually and
        separating them with a rule is enough, and it keeps the two decisions
        from being read as one list of five.
      */}
      <div className="hand-font" role="radiogroup" aria-label={t("font.handGroupLabel")}>
        <p className="font-hand-heading">
          <span className="font-hand-title">{t("font.handTitle")}</span>
          <span className="muted-note">{t("font.handNote")}</span>
        </p>
        <div className="font-grid font-grid-hand">
          {HAND_FONTS.map((f) => {
            const active = handFontId === f.id;
            const kb = handWeightKb(f.id);
            // With handwriting off the notes take the selected UI family, so
            // that is what the "off" row previews.
            const previewStack = f.stack ?? fontIdStack(fontId);
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`font-option ${active ? "font-option-active" : ""}`}
                onClick={() => setHandFont(f.id)}
                onPointerEnter={() => loadHandForPreview(f.id)}
                onFocus={() => loadHandForPreview(f.id)}
              >
                <span
                  className={`font-sample ${f.id === "dancing-script" ? "font-sample-hand" : ""}`}
                  style={{ fontFamily: previewStack }}
                >
                  {HAND_SAMPLE}
                </span>
                <span className="font-option-foot">
                  <span className="font-option-label">{f.label}</span>
                  <span className="font-option-size">
                    {kb === 0 ? t("font.noDownload") : t("font.kbSize", { kb })}
                  </span>
                </span>
                <span className="font-option-hint">{f.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="muted-note font-note">{t("font.selfHostedNote")}</p>
    </div>
  );
}

/**
 * The stack a note takes when handwriting is off: the selected UI family, or
 * the system stack for `system`. Built here rather than imported so the
 * "off" row shows exactly what the notes will show.
 */
function fontIdStack(id: string): string {
  const found = FONTS.find((f) => f.id === id);
  if (!found || !found.family) return SYSTEM_FONT_STACK;
  return found.stack;
}

/**
 * One family in the picker.
 *
 * Its own component because the grid is now rendered once per category rather
 * than once for the whole list, and a twenty-line JSX block inline in a nested
 * map is a thing nobody can review. `onPointerEnter` and `onFocus` both warm
 * the family: the picker still has to be careful about that, unlike the icon
 * picker, because a typeface is a real file and a face that is not loaded yet
 * shows a fallback in the very sample the user is judging it by.
 */
function FontOption({
  font,
  active,
  onSelect,
  onPreview,
}: {
  font: FontDef;
  active: boolean;
  onSelect: (id: FontDef["id"]) => void;
  onPreview: (id: FontDef["id"]) => void;
}) {
  const kb = fontWeightKb(font.id);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={`font-option ${active ? "font-option-active" : ""}`}
      onClick={() => onSelect(font.id)}
      onPointerEnter={() => onPreview(font.id)}
      onFocus={() => onPreview(font.id)}
    >
      {/* The sample opts OUT of the app-wide font so each row can show
          a different face at the same time. */}
      <span className="font-sample" style={{ fontFamily: font.stack }}>
        {SAMPLE}
      </span>
      <span className="font-sample font-sample-bold" style={{ fontFamily: font.stack }}>
        {SAMPLE_BOLD}
      </span>
      <span className="font-option-foot">
        <span className="font-option-label">{font.label}</span>
        <span className="font-option-size">
          {kb === 0 ? t("font.noDownload") : t("font.kbSize", { kb })}
        </span>
      </span>
      {font.recommended ? <span className="font-option-badge">{t("font.recommended")}</span> : null}
      <span className="font-option-hint">{font.hint}</span>
    </button>
  );
}
