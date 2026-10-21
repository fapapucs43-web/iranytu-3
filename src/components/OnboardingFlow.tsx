import ContentIcon from "./ContentIcon";
import { useEffect, useState } from "react";
import { useApp } from "../state/AppContext";
import { useTheme } from "../state/ThemeContext";
import {
  completeOnboarding,
  loadOnboarding,
  ONBOARDING_TRACKER_CHOICES,
  type OnboardingState,
} from "../lib/onboarding";
import { MOODS } from "../lib/mood";
import { t } from "../lib/i18n";
import {
  ClipboardList,
  Leaf,
  Mic,
  Moon,
  Paperclip,
  Save,
  Sparkles,
  Sun,
  Target,
} from "../lib/icons";
import { GlyphIcon } from "../state/IconSetContext";

/**
 * Guided first-run overlay (Phase 4): welcome → tracker picks → theme with
 * live preview → quick-log tutorial. Shows once; completion is persisted.
 * Additive component, mounted by the approved integration diff.
 */
export default function OnboardingFlow() {
  const { data, setSettings, notify } = useApp();
  const { setTheme } = useTheme();
  const [state, setState] = useState<OnboardingState>(() => loadOnboarding());
  const [open, setOpen] = useState(() => !loadOnboarding().completed);
  const [step, setStep] = useState(0);

  // Choosing a theme previews it immediately.
  useEffect(() => {
    if (open && step === 2) setTheme(state.theme);
  }, [open, step, state.theme, setTheme]);

  function finish() {
    completeOnboarding(state);
    setSettings({
      ...data.settings,
      enabledTrackers: state.trackers,
      theme: state.theme,
    });
    setTheme(state.theme);
    setOpen(false);
    notify(t("onboarding.done"));
  }

  function toggleTracker(id: string) {
    setState((s) => ({
      ...s,
      trackers: s.trackers.includes(id)
        ? s.trackers.filter((t) => t !== id)
        : [...s.trackers, id],
    }));
  }

  if (!open) return null;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t("onboarding.dialogLabel")}>
      <div className="dialog onboarding">
        {step === 0 && (
          <>
            <span className="onboarding-emoji" aria-hidden="true"><ContentIcon name="Compass" size="1.6em" /></span>
            <h2>{t("onboarding.welcome")}</h2>
            <p className="muted-note">{t("onboarding.intro")}</p>
            <p className="muted-note">{t("onboarding.hint")}</p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => setStep(1)}>
              {t("onboarding.start")}
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h2>{t("onboarding.trackerQuestion")}</h2>
            <p className="muted-note">A hangulat mindig ott lesz — ezeket is bekapcsolhatod.</p>
            <div className="pill-cloud">
              {ONBOARDING_TRACKER_CHOICES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={state.trackers.includes(t.id)}
                  className={`pill ${state.trackers.includes(t.id) ? "pill-selected" : ""}`}
                  onClick={() => toggleTracker(t.id)}
                >
                  <GlyphIcon glyph={t.icon} /> {t.label}
                </button>
              ))}
            </div>
            <p className="muted-note">{t("onboarding.trackerHint")}</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>{t("onboarding.back")}</button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>{t("onboarding.next")}</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
          <h2>{t("onboarding.themeQuestion")}</h2>
          <p className="muted-note">{t("onboarding.themeHint")}</p>
            <div className="pill-cloud">
              {(
                [
                  { v: "light", l: t("onboarding.themeLight"), I: Sun },
                  { v: "dark", l: t("onboarding.themeDark"), I: Moon },
                  { v: "warm", l: "Meleg", I: Leaf },
                  { v: "vibrant", l: t("onboarding.themeVibrant"), I: Sparkles },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={state.theme === o.v}
                  className={`pill ${state.theme === o.v ? "pill-selected" : ""}`}
                  onClick={() => setState((s) => ({ ...s, theme: o.v }))}
                >
                  <o.I size="1.1em" /> {o.l}
                </button>
              ))}
            </div>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>{t("onboarding.back")}</button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>{t("onboarding.next")}</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>{t("onboarding.howTitle")}</h2>
            <ol className="onboarding-steps">
              <li>
                <span className="mood-emoji" aria-hidden="true"><GlyphIcon glyph={MOODS[3].emoji} /></span> {t("onboarding.howMood")}
              </li>
              <li><Target size="1.1em" /> {t("onboarding.howTag")}</li>
              <li><Save size="1.1em" /> {t("onboarding.howSave")}</li>
            </ol>
            <p className="muted-note"><Paperclip size="1.1em" /> {t("onboarding.extrasPhoto")} <Mic size="1.1em" /> {t("onboarding.extrasVoice")} <ClipboardList size="1.1em" /> {t("onboarding.extrasTrack")}</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>{t("onboarding.back")}</button>
              <button type="button" className="btn btn-primary btn-block" onClick={finish}>
                {t("onboarding.begin")} <ContentIcon name="Sprout" size="1.1em" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
