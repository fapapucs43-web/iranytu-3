/**
 * The help surface, decoupled from the questionnaire (Batch 13, commit 6).
 *
 * WHY THIS FILE EXISTS AT ALL
 * `RESOURCES` and `DISCLAIMER` are not new — they are in `lib/assessments.ts`,
 * and Batch 6 put them on every questionnaire result and every row of the
 * history log. What Batch 6 could not do is make them REACHABLE: the
 * questionnaire is consent-gated and `assessmentsEnabled` defaults to false,
 * so a reader who never ticked the box had no route to a phone number from
 * inside this app at all. Reaching a helpline should not require opting into a
 * clinical instrument first; that ordering is backwards.
 *
 * WHAT IS NOT HERE, ON PURPOSE
 * No phone number, hours string, label or disclaimer sentence is written in
 * this file — not even in a comment, which is why the numbers in the prose
 * above are described rather than quoted. All of them are imported from
 * `lib/assessments`. A second list of crisis numbers is the one duplication in
 * this codebase that could actually hurt somebody, so the list stays
 * single-source and this file decides only how it is presented.
 * `tests/lib/crisis-card.test.tsx` scans this source for any digit sequence
 * at all, which is what makes that promise checkable rather than aspirational.
 *
 * TWO DENSITIES, ONE LIST
 * `CrisisStrip` is the compact form — four dialable numbers and the
 * disclaimer, for surfaces that already have a result or an entry on screen.
 * `CrisisCard` is the full form — the whole list including the two web
 * resources, for surfaces with room to read.
 */
import { DISCLAIMER, RESOURCES, RESOURCES_TITLE } from "../lib/assessments";
import { t } from "../lib/i18n";
import { Phone, ShieldAlert } from "../lib/icons";

/**
 * Stated once, used by both densities. The hours matter: a helpline that is
 * quietly closed at 03:00 is not a route to help, and this app is most used
 * late.
 *
 * `HELP_NOTE` was the ONLY Hungarian sentence this file owned; it is now
 * `crisis.helpNote`, and that is the entire extent of the extraction here.
 * Everything else this component shows is imported, on purpose.
 */

/**
 * Only the entries that can actually be dialled. The two web resources are
 * dropped from the strip on purpose: a strip that is read in one glance has no
 * room for a link the reader has to find a browser for, and pretending they
 * are one tap away would be a lie. They stay in the full card.
 */
const CALLABLE = RESOURCES.filter((r) => typeof r.phone === "string");

/**
 * Dial-ready digits: the dashes in a displayed number are for reading, and a
 * handset will not accept them.
 */
function telHref(phone: string): string {
  return `tel:${phone.replace(/-/g, "")}`;
}

/**
 * The compact form. Rendered above the score on a result that needs support,
 * and at the foot of a journal entry.
 *
 * `role="note"` rather than `role="alert"`: nothing here is interrupting an
 * urgent situation the app detected, and a screen reader interrupting itself
 * for a permanent footer would be worse than saying nothing.
 */
export function CrisisStrip() {
  return (
    <div className="crisis-strip" role="note">
      <span className="crisis-strip-lead">
        <ShieldAlert size="1em" /> {RESOURCES_TITLE}
      </span>
      <span className="crisis-strip-numbers">
        {CALLABLE.map((r) => (
          <a
            key={r.phone}
            className="crisis-strip-tel"
            href={telHref(r.phone as string)}
          >
            <Phone size="1em" /> {r.phone}
          </a>
        ))}
      </span>
      <span className="crisis-strip-note">
        {t("crisis.helpNote")} {DISCLAIMER}
      </span>
    </div>
  );
}

/**
 * The full form. Everything in `RESOURCES`, web resources included, plus the
 * disclaimer — the same three things a questionnaire result shows, so someone
 * who has met them there is not meeting something different here.
 *
 * Deliberately NOT a `CollapsibleCard`. A route to help behind a tap is not a
 * route to help, so wherever this is mounted it is mounted open.
 */
export default function CrisisCard() {
  return (
    <section className="card crisis-card" aria-label={RESOURCES_TITLE}>
      <h3 className="crisis-card-title">
        <ShieldAlert size="1.1em" /> {RESOURCES_TITLE}
      </h3>
      <p className="crisis-card-intro">{t("crisis.helpNote")}</p>
      <ul className="crisis-card-list">
        {RESOURCES.map((r) => (
          <li key={r.phone ?? r.href} className="crisis-card-row">
            {typeof r.phone === "string" ? (
              <a className="crisis-card-tel" href={telHref(r.phone)}>
                <Phone size="1em" /> {r.phone}
              </a>
            ) : (
              <a
                className="crisis-card-link"
                href={r.href}
                target="_blank"
                rel="noreferrer noopener"
              >
                {r.label}
              </a>
            )}
            {typeof r.phone === "string" && (
              <span className="crisis-card-label">
                {r.label}
                {r.hours ? ` — ${r.hours}` : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="crisis-card-disclaimer">{DISCLAIMER}</p>
    </section>
  );
}