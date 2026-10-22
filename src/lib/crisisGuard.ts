/**
 * The crisis guard — a client-side keyword filter in front of every AI call.
 *
 * WHAT IT IS, AND WHAT IT DELIBERATELY IS NOT
 * A keyword list, not a detector. It cannot understand intent, it will miss
 * paraphrases, and it is not claimed to be exhaustive anywhere it appears.
 * What it buys is the one property a detector cannot give: the FIRST line of
 * defence runs before any network call, any API key and any model load, so a
 * reader who writes about self-harm gets the app's own answer — instantly,
 * offline, and identical every time. The model-side obligation lives in the
 * system prompt (`ai.promptCrisis` in `lib/ai.ts`); this module is the belt
 * to that suspenders, and the reason a failed key or a dead network can never
 * swallow a crisis sentence.
 *
 * WHY THE REPLY IS BUILT FROM `assessments.RESOURCES`
 * That array is the app's single source of every crisis number — the module
 * header of `lib/assessments` says so, and five surfaces already import it
 * from there. A second hand-written copy of 116-123 in this file is exactly
 * the drift that one-source rule exists to prevent, so this module formats
 * the same list and never spells a number of its own.
 *
 * PURE: the catalogue and the resources list are data; nothing here touches
 * React, the DOM or storage, so the filter is testable without a browser —
 * which is the only way a keyword list this safety-relevant gets covered.
 */
import { t } from "./i18n";
import { RESOURCES } from "./assessments";

/**
 * The signals, as stems and phrases rather than whole words.
 *
 * Hungarian is agglutinative, so `öngyilk` covers öngyilkos, öngyilkosság,
 * öngyilkosságot — while `gyilkosság` alone (a news topic, a novel's plot)
 * matches nothing, because the stem never appears without its prefix. The
 * figurative `meghalt a kutyám` class of grief is deliberately NOT a signal:
 * matching bare death words would flag every bereavement note in the journal
 * and cry wolf until the reader stops believing the line that matters.
 *
 * English phrases are included because the journal accepts either language,
 * and the phrase level (`want to die`, not `die`) is what keeps a diary
 * sentence like `die Hitze` — or `I could die of laughter` — from counting.
 */
const SIGNALS: readonly RegExp[] = [
  // Hungarian
  /öngyilk/i,
  /nem akar(?:ok|na|nánk)? (?:többé )?élni/i,
  /szeretn[ée]k meghalni/i,
  /jobb\s+(?:lenne|volna),?\s+ha\s+meghal/i,
  /meg\s?öl(?:öm|ném)\s+magam/i,
  /meg\s+akar(?:ok)?\s+halni/i,
  /véget\s+vet(?:ek|nék)\s+az\s+életemnek/i,
  /véget\s+akar(?:ok|unk)\s+vetni\s+az\s+életemnek/i,
  /bántani\s+akar\w*\s+mag/i,
  /kárt\s+(?:teszek|tennék|akar\w*\s+tenni)\s+magam/i,
  /önkárosít/i,
  // English
  /kill(?:ing)?\s+myself/i,
  /suicid/i,
  /self[-\s]?harm/i,
  /end\s+my\s+life/i,
  /(?:i\s+)?(?:want|wish)\s+to\s+die/i,
  /(?:i['’]d|rather)\s+(?:rather\s+)?be\s+dead/i,
];

/** True when a text carries a self-harm / suicide signal. */
export function hasCrisisSignal(text: string): boolean {
  if (text === "") return false;
  return SIGNALS.some((re) => re.test(text));
}

/**
 * The app's own crisis answer: one sentence, then the shared resource list.
 *
 * A sentence rather than a paragraph on purpose — a reader who triggered this
 * guard may be in the middle of the worst day of their week, and the numbers
 * are the content, not the framing around them.
 */
export function crisisReply(): string {
  const lines = RESOURCES.map((r) => {
    const phone = r.phone ? ` — ${r.phone}` : "";
    const hours = r.hours ? ` (${r.hours})` : "";
    const href = r.href ? ` — ${r.href}` : "";
    return `• ${r.label}${phone}${hours}${href}`;
  });
  return [t("ai.crisisReply"), ...lines].join("\n");
}
