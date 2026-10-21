/**
 * THE READER'S OWN LEVER AGAINST A DEPLOY THAT WILL NOT ARRIVE.
 *
 * Every automatic path the app has — a versioned worker cache, `updateViaCache:
 * "none"` so the worker script is never answered out of the HTTP cache, an
 * update check on every open, and a reload once a new worker has taken over an
 * open page — is a REQUEST. The browser may decline any of them, and the reader
 * is then looking at a deployed app that tells them nothing is wrong. This card
 * is the one place they can say "drop it and fetch it again", and it is
 * deliberately unconditional: it does not try to detect whether an update is
 * waiting, because the failure it exists for is precisely the one where the app
 * cannot tell.
 *
 * WHY THE BUTTON IS WHERE IT IS. Settings → Miscellaneous, under the install
 * card: the two answer the same question — "which copy of this app am I using?"
 * — and a reader who suspects a stale build looks in the same area they went to
 * install it.
 *
 * WHY THE NOTE IS LONGER THAN THE BUTTON. The button reloads the page, and that
 * is a real cost: whatever the reader was typing goes away. A one-line label
 * would hide that behind a word like "refresh"; the note says what will be
 * dropped (caches, the background worker, the page) so the press is informed.
 * It also names what does NOT go anywhere — nothing leaves their device; the
 * caches are theirs.
 *
 * WHY IT NEEDS NO STATE BEYOND BUSY. `forceAppUpdate` never rejects for a cache
 * or a worker that refuses to go (see `lib/pwa`), so the only reachable failure
 * is a browser that will not reload — and that one has to be SAID rather than
 * swallowed, because the reader's next move (close the tab) is different from
 * pressing the button again.
 */
import { useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import { RefreshCw } from "../lib/icons";
import { forceAppUpdate } from "../lib/pwa";
import { t } from "../lib/i18n";

export default function AppUpdateCard() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stuck, setStuck] = useState(false);

  async function onUpdate() {
    setBusy(true);
    setFailed(false);
    try {
      // The answer to the reset's LAST step: a worker was still in charge when it
      // ran. That is the one case the button cannot finish by itself, so it is
      // the case that gets the devtools route instead of a second press.
      setStuck(await forceAppUpdate());
      // Reached only when the page did NOT navigate away — a browser that refused
      // the navigation, a test, a preview. Leaving the button disabled would
      // strand the reader on a card that looks like it is still working.
      setBusy(false);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <CollapsibleCard
      id="settings-update"
      title={t("update.cardTitle")}
      icon={<RefreshCw />}
      summary={t("update.note")}
    >
      <p className="muted-note">{t("update.note")}</p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onUpdate}
        disabled={busy}
        aria-busy={busy}
      >
        <RefreshCw size="1.1em" /> {busy ? t("update.busy") : t("update.action")}
      </button>
      {failed ? (
        <p className="bg-pick-error" role="status">
          {t("update.failed")}
        </p>
      ) : null}
      {stuck ? (
        // Shown when the reset left a worker in charge: the same route the
        // banner offers, from the card that was pressed.
        <p className="bg-pick-ink-lifted" role="status">
          {t("update.stuckGuide")}
        </p>
      ) : null}
    </CollapsibleCard>
  );
}
