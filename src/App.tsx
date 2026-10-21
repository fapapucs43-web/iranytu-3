import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import "./styles.css";
import { AppProvider, useApp } from "./state/AppContext";
import { ThemeProvider, useTheme } from "./state/ThemeContext";
import { FontProvider } from "./state/FontContext";
import { IconSetProvider } from "./state/IconSetContext";
import { localeTag, t } from "./lib/i18n";
import AppHeader from "./components/AppHeader";
import BottomNav from "./components/BottomNav";
import OnboardingFlow from "./components/OnboardingFlow";
import ReminderScheduler from "./components/ReminderScheduler";
import MedicationReminderScheduler from "./components/MedicationReminderScheduler";
import PinLockGate from "./components/PinLockGate";
import { Toasts } from "./components/ui/ui";
import { InstallBanner } from "./components/InstallPrompt";
import StaleWorkerNotice from "./components/StaleWorkerNotice";
import { cleanResetParam, registerPwa } from "./lib/pwa";
import { cleanQuickParam, consumeQuickStart, consumeQuickTarget, scrollToQuickAnchor, subscribeQuickStart } from "./lib/quickStart";
import { useDynamicInk } from "./state/useDynamicInk";
import { BACKUP_DUE_NOTE, useBackupScheduler } from "./lib/backupDaemon";
import TodayView from "./views/TodayView";
import ToolsView from "./views/ToolsView";
import JournalView from "./views/JournalView";
import SettingsView from "./views/SettingsView";
import HealthView from "./views/HealthView";
import { currentStreak } from "./lib/analysis";
import {
  blurPx,
  clampCardTransparency,
  deriveScrimRgb,
  effectiveVeil,
  fitCss,
  loadBackgroundImage,
  normalizeFit,
  normalizePalette,
} from "./lib/imageBackground";
import { isLight } from "./lib/themes";
import type { TabId } from "./types";

/*
 * THE OS-LEVEL SOLID-SURFACE SIGNAL, read as a hook.
 *
 * `prefers-reduced-transparency: reduce` is the reader telling the platform
 * "paint surfaces solid", and the stylesheet answers by pinning the card and
 * dialog backgrounds opaque. The ink decision has to agree with what is
 * actually painted: it reasons about the composite of surface and picture,
 * and a reader whose surfaces are pinned solid is looking at the surface
 * alone. So the signal collapses the decision's ground to the theme's own
 * surface — at transparency 0 the composite IS the surface, the theme's ink
 * wins the AA scan, and the dynamic decision becomes a no-op exactly where the
 * picture is no longer the ground under the text.
 */
function usePrefersSolidSurfaces(): boolean {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-transparency: reduce)");
    const update = () => setSolid(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return solid;
}

/**
 * The charting family is the second-largest thing this app ships, and
 * InsightsView is the only thing that pulls it in — so it is loaded on demand
 * rather than with the shell. Declared at MODULE scope on purpose: a `lazy()`
 * call inside a component body builds a brand-new lazy component on every
 * render, which discards the loaded chunk and re-fetches it forever.
 */
const InsightsView = lazy(() => import("./views/InsightsView"));

/**
 * A chunk that will not load must not take the whole app down with it.
 *
 * `lazy` rethrows the import failure during render, and with no boundary above
 * it the nearest one is React's root, which unmounts everything — a reader who
 * cleared site data, then opened Elemzés offline, would get a blank page
 * instead of the tab they asked for. The precache makes that unlikely; this
 * makes it survivable. One tab degrades to a sentence, the rest of the app
 * keeps working.
 */
class ChunkBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <p className="view-error">{t("app.insightsFailed")}</p>
      );
    }
    return this.props.children;
  }
}

function Shell() {
  /*
   * THE STARTING TAB, and the one place a deep link can decide it.
   *
   * `useState`'s argument runs once, on the first render, which is exactly the
   * lifetime a one-shot instruction should have: an iOS Shortcut, an Android
   * shortcut or a Home Screen widget opens `/?quick=mood`, that parameter asks
   * for the Ma tab, and it is consumed (scrubbed from the address bar) by the
   * effect below. A reader who opens the plain app still lands on `today` —
   * `consumeQuickStart` returns `null` for a missing or unknown value, so a
   * stray parameter can never take over the default.
   */
  const [tab, setTab] = useState<TabId>(() => consumeQuickStart() ?? "today");
  const { data, toasts, dismissToast, notify } = useApp();
  const { theme, tokens } = useTheme();

  useEffect(() => registerPwa(), []);

  /*
   * THE RESET'S STAMP COMES BACK OUT OF THE ADDRESS BAR.
   *
   * `forceAppUpdate` navigates to `/?nocache=<stamp>` because a url nobody has
   * ever requested is the one form of navigation no cache can answer from
   * storage. That stamp has done its job the moment this document is up, and
   * leaving it there would hand it to a bookmark, to a pasted link, and to every
   * later visit — each of which would then pay a cache miss for nothing.
   * `replaceState`, not a second navigation: the reader stays exactly where they
   * are.
   */
  useEffect(() => {
    // The deep link's FULL instruction is read first, while the parameter is
    // still in the URL: the tab half already decided the starting tab above,
    // and this is where the anchor half ("scroll to the breathing drawer") is
    // honoured — after the scrub, so the value cannot survive in the address
    // bar, and before the scroll, so the element the first commit painted is
    // the one we land on.
    const target = consumeQuickTarget();
    cleanResetParam();
    // The deep link's own parameter, honoured above and scrubbed here for the
    // same reason the reset's stamp is: a one-shot instruction that stays in
    // the address bar becomes a bookmark, a shared link, and a return URL that
    // re-fires the deep link on every later visit.
    cleanQuickParam();
    if (target?.anchor) scrollToQuickAnchor(target.anchor);
  }, []);

  /*
   * A DEEP LINK THAT ARRIVES WHILE THE APP IS OPEN — the tapped daily
   * reminder. Its notification cannot navigate (the page is already the
   * running app, and reloading would discard a half-written entry), so it
   * publishes through `subscribeQuickStart` instead: same target table as a
   * cold start, but as `setTab` + a scroll. Unsubscribed on unmount like any
   * other listener.
   */
  useEffect(
    () =>
      subscribeQuickStart((target) => {
        setTab(target.tab);
        if (target.anchor) scrollToQuickAnchor(target.anchor);
      }),
    [],
  );

  // The chosen language, mirrored onto `<html lang>` — the one place outside
  // React's tree that carries it, and the one a screen reader reads its
  // pronunciation from. The catalogue has its own copy of this choice (see
  // `lib/i18n`'s header), and the element is kept in step with the SETTINGS
  // rather than with the catalogue, because the settings are the authority: the
  // effect re-runs on the picker's own change in the same tick, before the
  // reload the switch triggers, so there is no frame where the document claims
  // a language the page is not in.
  useEffect(() => {
    document.documentElement.lang = localeTag();
  }, [data.settings.locale]);

  // Once for the whole app, mounted here beside the two reminder schedulers:
  // it asks — never writes — when a backup is due. It can only run while the
  // app is open, which is the same limit the reminders carry and the settings
  // card states out loud. See lib/backupDaemon for why a browser cannot do
  // this unattended.
  useBackupScheduler(() => notify(BACKUP_DUE_NOTE, "warn"));

  // The background image, resolved to a data URL for the app root's style. Read
  // through the same loader the Settings preview uses, so the two cannot show
  // different pictures; `undefined` and a missing blob both mean "no image", and
  // both land on the plain themed background with no scrim and no leftover
  // `has-bg` class.
  const background = loadBackgroundImage(data.settings.backgroundImage);
  // Which palette the scrim is mixed from, and — when it is the picture's — the
  // tint that results. `isLight(tokens.bg)` is the SAME decision `applyThemeTokens`
  // makes for `--app-bg-scrim-rgb` and `color-scheme`, called with the live
  // resolved tokens, so the scrim's polarity cannot disagree with the ink that
  // sits on it. The tint is written to its OWN property rather than over
  // `--app-bg-scrim-rgb`, because that one belongs to the theme: the high
  // contrast and reduced-transparency rules below read it for a flat scrim, and
  // an inline override here would silently give them the tinted value instead.
  const palette = normalizePalette(data.settings.backgroundPalette);
  const tint = deriveScrimRgb(data.settings.backgroundTint, isLight(tokens.bg ?? "#ffffff"));

  // The fit, repaired the same way the palette above is. `soft` is the default
  // and the one case that needs a third layer: the stylesheet draws the blurred
  // cover fill from `--app-bg-image` under the picture, which is why the class
  // is on the root rather than a value in the inline style. `fitCss` still
  // decides the picture layer's own `--app-bg-size`, which is `contain` for
  // both `contain` and `soft`.
  const fit = normalizeFit(data.settings.backgroundFit);

  // The reader's own card transparency, clamped to the slider's range and
  // nothing else. The card is the only surface it fades directly — and from
  // the veil-floor batch on, it also FLOORS the veil: `effectiveVeil` is what
  // the style block writes for `--app-bg-scrim-alpha`, so a reader whose card
  // is 95% transparent always has at least a 47.5% veil behind the text even
  // if their scrim slider sits at zero. The clamp remains the boundary guard
  // it has to be: the value reaches a `calc()` inside `color-mix()`, and an
  // invalid one there is dropped by the browser without a word.
  const transparency = clampCardTransparency(data.settings.backgroundCardTransparency);

  /*
   * SOLID-SURFACE MODES KEEP THEIR GROUND. `contrast-high` is the reader's own
   * switch, `prefers-reduced-transparency` the OS's; both pin the card's paint
   * opaque in the stylesheet, so the ink decision is handed an OPAQUE card —
   * transparency 0 — rather than the composite the slider would make. The
   * stylesheet still receives the reader's own transparency below: these two
   * modes override the paint, not the control.
   */
  const prefersSolidSurfaces = usePrefersSolidSurfaces();
  const effectiveTransparency =
    data.settings.highContrast || prefersSolidSurfaces ? 0 : transparency;

  /*
   * THE INK, chosen from the picture the reader actually chose.
   *
   * The stack is three translucent layers and the text sits on whatever comes
   * out, so the theme's own ink — which is right on a solid surface — is a coin
   * flip on a photograph. The decision is made ONCE per (picture, veil,
   * transparency, theme) and written as an inline custom property, for two
   * reasons that are the same reason:
   *
   *  - `--ink` rather than a new property every text rule reads. A custom
   *    property's value is what INHERITS, so one write reaches every card, row,
   *    chip and heading — and a rule list would need a new entry for every
   *    component that prints a word.
   *  - the sampling itself is a canvas read of the picture, once, when the
   *    picture changes. Re-measuring on every render would mean decoding an
   *    8 MB data URL per keystroke.
   *
   * `null` is the honest answer whenever the ground cannot be measured — no
   * canvas, a picture still decoding, an unreadable image — and `null` means
   * "write nothing", so a browser that cannot measure keeps the app it has.
   */
  const dynamicInk = useDynamicInk(
    background ?? undefined,
    tokens,
    data.settings.backgroundScrim,
    data.settings.backgroundPalette,
    effectiveTransparency,
    // The fit travels WITH the decision because the decision needs it: a
    // `cover` picture is the one case where the visible slice of the page is a
    // visible slice of the picture, which is what the scroll listener reads on
    // the platform that paints the backdrop against the document.
    fit,
  );

  return (
    <div
      data-theme={theme}
      className={
        "app" +
        (data.settings.textSize === "large" ? " text-large" : "") +
        (data.settings.textSize === "xlarge" ? " text-xlarge" : "") +
        (data.settings.highContrast ? " contrast-high" : "") +
        (background ? " has-bg" : "") +
        (background && palette === "image" ? " bg-palette-image" : "") +
        // AFTER `bg-palette-image`, deliberately: the palette class is the
        // substring existing tests and readers look for, and the fit class is
        // additive beside it.
        (background && fit === "soft" ? " bg-fit-soft" : "")
      }
      style={
        background
          ? ({
              "--app-bg-image": `url("${background}")`,
              // The veil the reader's sliders produce — or the stronger one the
              // ink decision needed. `dynamicInk.veil` is the number the
              // guarantee was MEASURED at (the reader's own, whenever it already
              // works), so painting it rather than recomputing it is what keeps
              // "clears AA" and "what is on screen" the same sentence.
              "--app-bg-scrim-alpha": String(
                dynamicInk?.veil ?? effectiveVeil(data.settings.backgroundScrim, transparency),
              ),
              "--app-card-transparency": String(transparency),
              "--app-bg-blur": blurPx(data.settings.backgroundBlur),
              "--app-bg-size": fitCss(fit),
              "--app-bg-tint-rgb": tint,
              // Four SLOT names, deliberately — `--app-dynamic-ink` is the
              // primary decision in a name a reader's devtools can find,
              // `--app-dynamic-ink-soft` is the same decision at its quieter
              // step for the secondary words, and the two brand slots are what
              // the theme's brand paints become where they stopped reading on
              // the ground. Writing only the primary left every muted word on
              // the theme's tint — the exact text the picture made unreadable.
              //
              // AND NOT `--ink` ITSELF. It used to be written here too, on the
              // reasoning that it is the name the whole app already reads. That
              // is what made it wrong: `--ink` is also the name the SOLID
              // CARRIERS re-pin FROM — `.yip-*`, `.rec-flow`, the badges,
              // `.pin-overlay` all declare `--app-ink: var(--ink)` so their
              // words stay the theme's own on ground the picture is not under.
              // Overwriting the token broke exactly that promise: those rules
              // read back the picture's ink and printed it on a theme surface,
              // which is how light ink ended up on a light tile and how the PIN
              // SCREEN came up in the photograph's colours. The decision belongs
              // in the slots; the raw token stays the theme's.
              ...(dynamicInk
                ? {
                    "--app-dynamic-ink": dynamicInk.primary,
                    "--app-dynamic-ink-soft": dynamicInk.soft,
                    "--app-dynamic-brand": dynamicInk.brand,
                    "--app-dynamic-brand-strong": dynamicInk.brandStrong,
                  }
                : {}),
            } as React.CSSProperties)
          : undefined
      }
    >
      {/* The soft fill's layer, and nothing else needs it: the picture and the
          scrim are the two pseudo-elements the stylesheet already owns, and a
          third pseudo-element does not exist. Rendered only in `soft` so the
          other two fits keep the two-layer DOM they shipped with, and
          `aria-hidden` because it is the same picture painted twice. */}
      {background && fit === "soft" ? <div className="app-bg-fill" aria-hidden="true" /> : null}
      <AppHeader name={data.profile.name} streak={currentStreak(data.entries)} />
      <main className="app-main">
        {tab === "today" && <TodayView />}
        {tab === "tools" && <ToolsView />}
        {tab === "health" && <HealthView />}
        {tab === "journal" && <JournalView onGoToday={() => setTab("today")} />}
        {tab === "insights" && (
          <ChunkBoundary>
            <Suspense fallback={<p className="view-loading">{t("app.insightsLoading")}</p>}>
              <InsightsView onGoToday={() => setTab("today")} />
            </Suspense>
          </ChunkBoundary>
        )}
        {/* The ink decision's own report travels to the background card, where
            the two sliders that can change it live. `undefined` with no
            picture — the card then warns about nothing. */}
        {tab === "settings" && (
          <SettingsView inkMeetsAA={dynamicInk?.meetsAA} inkVeil={dynamicInk?.veil} />
        )}
      </main>
      <BottomNav active={tab} onChange={setTab} />
      <InstallBanner />
      {/* Above the content with the install offer, and for a more urgent reason:
          a stale controller means the app in front of the reader is not the one
          that was deployed. */}
      <StaleWorkerNotice />
      <Toasts toasts={toasts} onDismiss={dismissToast} />
      <OnboardingFlow />
      <ReminderScheduler />
      <MedicationReminderScheduler />
      <PinLockGate />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ThemeProvider>
        <FontProvider>
          <IconSetProvider>
            <Shell />
          </IconSetProvider>
        </FontProvider>
      </ThemeProvider>
    </AppProvider>
  );
}
