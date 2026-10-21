import { useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard } from "./ui/ui";
import { promptInstall, useInstallable } from "../lib/pwa";
import { Smartphone, X } from "../lib/icons";
import { t } from "../lib/i18n";

const BANNER_KEY = "belso-iranytu-install-banner-dismissed";

/**
 * Install UX (Batch 2, P9): a Settings card + a dismissible banner above the
 * content, both shown only when the browser has actually offered the install
 * prompt (beforeinstallprompt) — no nagging where installation isn't possible.
 */
export function InstallBanner() {
  const { notify } = useApp();
  const installable = useInstallable();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    // Dismissal is session-scoped (sessionStorage): the offer returns on the
    // next visit unless the browser stops offering installation.
    try {
      return sessionStorage.getItem(BANNER_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (!installable || dismissed) return null;

  return (
    <div className="install-banner" role="status">
      <span aria-hidden="true"><Smartphone size="1.4em" /></span>
      <p>
        <strong>{t("install.bannerTitle")}</strong>
        <br />
        {t("install.bannerBody")}
      </p>
      <button
        type="button"
        className="btn btn-soft"
        onClick={async () => {
          const ok = await promptInstall();
          if (ok) notify(t("install.done"));
          else setDismissed(true);
        }}
      >
        {t("install.bannerAction")}
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={t("install.bannerDismiss")}
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(BANNER_KEY, "1");
          } catch {
            /* in-memory only */
          }
        }}
      >          <X size="1.1em" />
        </button>
    </div>
  );
}

export function InstallCard() {
  const { notify } = useApp();
  const installable = useInstallable();
  // One mount, not two branches: the offer and the "not offered yet" note are
  // the same card, so they share one id in the collapse map.
  return (
    <CollapsibleCard
      id="settings-install"
      title={t("install.cardTitle")}
      icon={<Smartphone />}
      summary={installable ? t("install.offered") : t("install.notOffered")}
    >
      {installable ? (
        <>
          <p className="muted-note">{t("install.offered")}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const ok = await promptInstall();
              if (ok) notify(t("install.done"));
            }}
          >
            <Smartphone size="1.1em" /> {t("install.cardAction")}
          </button>
        </>
      ) : (
        <p className="muted-note">{t("install.notOffered")}</p>
      )}
    </CollapsibleCard>
  );
}
