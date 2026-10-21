/**
 * THE BANNER THAT SAYS THE APP IN FRONT OF YOU IS NOT THE DEPLOYED ONE.
 *
 * WHY A BANNER AND NOT A SILENT FIX. Everything the app can do about a stuck
 * worker it already does: the registration carries the build hash, every open
 * asks for an update check, a waiting worker is asked to skip, and the Settings
 * button drops the caches and re-navigates. What none of that can do is reach a
 * page whose controller is from ANOTHER BUILD, because the only thing that ends
 * that state is a navigation the reader starts — or every tab being closed, which
 * a page cannot do for them. So the honest move is to say it out loud, offer the
 * one action that helps (the same six-step reset), and — when even that leaves a
 * worker in charge — hand over the two devtools routes that always work.
 *
 * WHY IT IS NOT DISMISSIBLE. Every other banner in this app can be closed,
 * because every other banner is a suggestion. This one reports a page that is
 * running the wrong code, and the reader's data entry on a stale bundle is the
 * exact cost it exists to prevent. A close button would turn the last warning
 * into the first thing dismissed.
 *
 * WHY THE PRESENTATIONAL PART IS SEPARATE. `StaleWorkerBanner` takes its state as
 * props, so the markup — the warning tone, the button, the guide — is testable
 * without a service worker, which is the same split `InstallPrompt` uses for its
 * own card and banner.
 */
import { useState } from "react";
import { AlertTriangle, RefreshCw } from "../lib/icons";
import { forceAppUpdate, useStaleWorker } from "../lib/pwa";
import { t } from "../lib/i18n";

/**
 * The reader-facing part: a warning strip and the reset button.
 *
 * `stuck` is what `forceAppUpdate` answered — a worker was still in charge when
 * the reset ran — and it swaps the button's promise for the manual route, since
 * a second press cannot do what the first one did not.
 */
export function StaleWorkerBanner({
  show,
  busy,
  stuck,
  onUpdate,
}: {
  show: boolean;
  busy: boolean;
  stuck: boolean;
  onUpdate: () => void;
}) {
  if (!show) return null;
  return (
    <div className="stale-worker-banner" role="status">
      <span aria-hidden="true">
        <AlertTriangle size="1.5em" />
      </span>
      <p>
        <strong>{t("stale.title")}</strong>
        <br />
        {t("stale.body")}
        {/* The same wording the Settings card uses when its own reset cannot
            finish the job: one text, two places, no drift. */}
        {stuck ? (
          <>
            <br />
            {t("update.stuckGuide")}
          </>
        ) : null}
      </p>
      <button type="button" className="btn btn-primary" onClick={onUpdate} disabled={busy} aria-busy={busy}>
        <RefreshCw size="1.1em" /> {busy ? t("update.busy") : t("update.action")}
      </button>
    </div>
  );
}

/** The wired version the app mounts: it renders nothing while nothing is stale. */
export default function StaleWorkerNotice() {
  const stale = useStaleWorker();
  const [busy, setBusy] = useState(false);
  const [stuck, setStuck] = useState(false);

  async function onUpdate() {
    setBusy(true);
    try {
      setStuck(await forceAppUpdate());
    } catch {
      // A browser that refuses to navigate gets the manual route instead of a
      // button that looks like it is still working.
      setStuck(true);
    } finally {
      setBusy(false);
    }
  }

  return <StaleWorkerBanner show={stale} busy={busy} stuck={stuck} onUpdate={onUpdate} />;
}
