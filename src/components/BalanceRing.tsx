/**
 * The balance ring's TONE is a meaning and belongs here: 70 and 45 are the
 * thresholds the note under the ring describes, and changing one changes what
 * the score MEANS.
 *
 * The ring's COLOUR is not a meaning and does not belong here. It used to be a
 * ternary of literal hexes picked in this file, which meant the ring kept
 * painting one theme's palette after the reader switched to another — and one
 * of them did not even match any theme's `danger`, so it had already drifted
 * from the palette entirely. The three tones now resolve through `--ring-ok` /
 * `--ring-warn` / `--ring-bad`, which `applyThemeTokens` writes from the active
 * palette.
 *
 * The hexes are named nowhere in this file, comments included, because
 * `tests/lib/ring-tokens.test.ts` scans this source for any six-digit hex and
 * quotes them there instead. "It was only in a comment" is exactly the argument
 * that would otherwise let a frozen palette back in.
 *
 * Note the mechanism, because the obvious version does not work: `var()` is
 * not valid in an SVG presentation attribute, so `stroke="var(--ring-ok)"`
 * paints nothing. `currentColor` IS valid there and resolves from the inherited
 * CSS `color` property, which the tone classes in styles.css set.
 */
/**
 * Tone name → class. Written out rather than built from a template so the
 * three class names are visible where the thresholds are, and so
 * `tests/batch12-css.test.ts` can see them as literals — a `ring-value-${tone}`
 * template would pass the compiler and leave three orphaned CSS rules that
 * nothing appears to select.
 */
const TONE_CLASS: Record<string, string> = {
  ok: "ring-value-ok",
  warn: "ring-value-warn",
  bad: "ring-value-bad",
};

export default function BalanceRing({ value, label = "pont" }: { value: number; label?: string }) {
  const size = 132;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;
  const tone = clamped >= 70 ? "ok" : clamped >= 45 ? "warn" : "bad";

  return (
    <div className="balance-ring">
      <svg width={size} height={size} role="img" aria-label={`Egyensúly pontszám: ${clamped} / 100`}>
        <circle className="ring-bg" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className={`ring-value ${TONE_CLASS[tone]}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="ring-number">
          {clamped}
        </text>
        <text x="50%" y="66%" textAnchor="middle" dominantBaseline="middle" className="ring-caption">
          {label}
        </text>
      </svg>
    </div>
  );
}
