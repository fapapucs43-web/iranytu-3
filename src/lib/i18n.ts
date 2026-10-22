/**
 * The i18n framework.
 *
 * STAGED FIRST, RUN BY AN APP NOW. The first round built the machinery and put
 * ONE surface on it — the meditation card's own chrome — so that a translation
 * module had a real caller. A file nothing calls is not a framework, and it
 * would have rotted at the first refactor. Sixteen rounds later every string a
 * reader sees is a key, and this module has exactly one job left: to answer
 * `t()` in the language the reader chose.
 *
 * WHO DECIDES THE LOCALE, AND WHY IT IS NOT THE BROWSER
 * `settings.locale` is the answer, and Hungarian is what "unset" means. The
 * browser's own `navigator.language` is deliberately NOT read: a reader whose
 * phone is in German but who has used this app in Hungarian since it was
 * Hungarian-only should not have it change language under them because a
 * format detector guessed. The Settings picker is the only door into this
 * module. `resolveLocale` is the one place a BROWSER TAG from outside the type
 * system becomes a `Locale` — the mirror below, which a hand-edited export or
 * an older build can have left holding anything at all. `coerceLocale` is the
 * stricter sibling for a stored value.
 *
 * THE MIRROR, AND WHY MODULE-SCOPE CONSTANTS NEED IT
 * Several registries are built ONCE, at import, and hold catalogue values:
 * `dates.ts`'s seven weekday initials, `icon-policy.ts`'s 48 reasons,
 * `trackerDisplay`'s number formatter, the report's month names. React cannot
 * rebuild a module constant, so the chosen locale is written to a localStorage
 * MIRROR (`belso-iranytu-locale`) at the same moment the store is written, and
 * this module reads that mirror as it initialises. The picker then reloads the
 * page, which is the only honest way to hand those constants the language the
 * reader just chose — see `setActiveLocale` for the rules that keep the two
 * from disagreeing.
 *
 * A PARTIAL CATALOGUE IS STILL SAFE, which is why staging could work at all:
 * `t()` falls back twice — the requested locale, then Hungarian, then the key
 * itself. Every round before this one shipped modules into a catalogue whose
 * other two languages were nearly empty, and a reader saw Hungarian rather than
 * a blank box.
 *
 * CHROME YES, CONTENT NO. The ten practice titles and their steps are
 * Hungarian *content* in `lib/meditations.ts`, and translating content is a
 * different and much larger job than translating the words around it. Moving
 * them here now would put a hundred words of prose into a framework whose whole
 * promise is that a missing key shows Hungarian rather than a blank.
 *
 * HUNGARIAN IS THE SOURCE OF TRUTH. `TranslationKey` is derived from the `hu`
 * catalogue, so a locale cannot ship a key the default does not have — that is
 * a compile error, not a review comment. And `t()` falls back in two steps: the
 * requested locale, then Hungarian, then the key itself. The last step is what
 * stops a typo from rendering as an empty box in production.
 */

export const DEFAULT_LOCALE = "hu";

/** Every locale the app is ready to grow into. */
export const SUPPORTED_LOCALES = ["hu", "en", "de"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Where the chosen locale is mirrored for the modules that read it at import.
 *
 * A SECOND copy of `settings.locale`, and the duplication is deliberate rather
 * than careless. `lib/i18n` cannot import the store — the store imports this
 * module, and a cycle here would put `t()`'s own default behind a live store
 * read — so the two are kept in step by writing them together instead: the
 * store calls `setActiveLocale` every time it commits, and this module is the
 * only thing that reads the mirror. The mirror is therefore never the source of
 * truth, only a cache of it that is reachable before any React code has run.
 *
 * Its own key, not a field of `belso-iranytu-data-v2`: the reader has to be
 * able to read the language before (and without) parsing their whole data blob,
 * and a corrupt store must not take the language down with it.
 */
const LOCALE_STORAGE_KEY = "belso-iranytu-locale";

/**
 * The BCP 47 tag each locale is handed to, for the platform APIs whose names
 * are not the app's to translate: `toLocaleDateString` (the long date forms and
 * the report's own date line), the recogniser's grammar, and `<html lang>`.
 *
 * `en-GB` rather than `en-US` because the app writes `2026. október 3.` in its
 * own voice and 3 October in this one; the day-before-month order is the half
 * that matches how the rest of the interface reads, and it is the one place a
 * region code has a defensible answer at all.
 */
const LOCALE_TAGS: Readonly<Record<Locale, string>> = {
  hu: "hu-HU",
  en: "en-GB",
  de: "de-DE",
};

/** The platform tag for a locale; the one in force when none is named. */
export function localeTag(locale: Locale = activeLocale): string {
  return LOCALE_TAGS[locale] ?? LOCALE_TAGS[DEFAULT_LOCALE];
}

/**
 * The locale in force, read from the mirror once, as this module initialises.
 *
 * `resolveLocale` rather than a strict check, because the mirror is a string out
 * of storage: it can be `"DE"`, `"de_AT"`, a locale this build has dropped, or
 * a value a hand-edited export put there. All four have one meaning — "whatever
 * the reader chose, this is not it" — and Hungarian is that meaning. A missing
 * key is the same answer without the ambiguity, which is why only a PRESENT
 * value goes through the resolver.
 */
function readMirroredLocale(): Locale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return raw === null ? DEFAULT_LOCALE : resolveLocale(raw);
  } catch {
    // No storage at all (private mode, a test environment, a locked-down
    // browser): the app still runs, in its own voice, for this session.
    return DEFAULT_LOCALE;
  }
}

let activeLocale: Locale = readMirroredLocale();

/**
 * Move the app into another language, and mirror the choice where the modules
 * that read it at import time can find it.
 *
 * Called by the store on every commit, so `settings.locale` and this module can
 * never disagree for longer than one write: whatever the store settles on — a
 * picker choice, a restored backup, "minden adat törlése" — is what `t()`
 * answers with after the reload that choice triggers.
 *
 * THE GUARD IS AGAINST THE MIRROR, NOT AGAINST MEMORY, and the difference is
 * the one thing here that is easy to get wrong. `setActiveLocale` is called on
 * every store write, including the one that follows every saved entry, so it
 * must not write localStorage per keystroke-saved day for a value that almost
 * never changes. Comparing with `activeLocale` would avoid that write — and
 * would also skip a repair that is genuinely needed: "minden adat törlése"
 * moves the app back to Hungarian while this module is already in Hungarian, so
 * the in-memory check would leave a `de` in the mirror that the NEXT reload
 * reads back, and the wipe would appear not to have happened. Reading the mirror
 * first costs one `getItem`, and the rule it gives is the honest one: the mirror
 * is written exactly when it disagrees with the choice.
 *
 * It does NOT re-render anything by itself: the module constants listed in this
 * file's header were built at import and are not React state. The picker owns
 * that half — see `SettingsView`'s language card, which reloads.
 */
export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
  try {
    if (localStorage.getItem(LOCALE_STORAGE_KEY) !== locale) {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  } catch {
    /* in-memory only — the switch still holds until the next reload */
  }
}

/**
 * The Hungarian catalogue, and therefore the key list. Typed `as const` so the
 * union below is the literal keys rather than `string`.
 */
const HU = {
  "meditation.title": "Meditációk",
  "tools.meditation.summary": "Rövid, időzített gyakorlatok csendben",
  "meditation.group": "Gyakorlat",
  "meditation.progress": "Eltelt idő",
  "meditation.start": "Indítás",
  "meditation.finish": "Befejezés",
  "meditation.restart": "Újrakezdés",
  // Two new states, not two new words: `pause` freezes the engine where it is
  // and `resume` continues from it. `finish` still discards, because a session
  // the reader wants to throw away should throw away what it accumulated.
  "meditation.pause": "Megáll",
  "meditation.resume": "Folytatás",
  "meditation.remaining": "Hátralévő: {time}",
  "meditation.summary": "{minutes} perc · {total} összesen",
  "meditation.complete": "Kész. Ha van időd, hagyd pár másodpercig a csendet.",

  // ---- Settings. The whole page's own chrome, one namespace per card. ----
  //
  // NOT HERE, and the omission is the point rather than an oversight. Two kinds
  // of string deliberately stay where they are:
  //
  //  · STRINGS THIS PAGE RENDERS BUT DOES NOT OWN. `SAFETY_NOTE` comes from
  //    `lib/nutritionTips`, `REST_NUDGE` from `lib/sportTips` and `DISCLAIMER`
  //    from `lib/assessments`. They are that module's words; SettingsView is one
  //    of their callers, so lifting them here would leave the originals behind
  //    and duplicate every sentence.
  //  · REGISTRIES, which are data rather than copy. The tracker group labels
  //    and hints (`lib/trackers`), the tab names (`lib/nav-icons`), the theme
  //    names (`lib/themes`), the icon-set names (`lib/iconsets`) and the font
  //    names (`lib/fonts`) are each a list its own module owns, and several of
  //    them are read by more than this view. They get their own namespace when
  //    their own module is extracted — the same job, one module at a time,
  //    rather than one commit that rewrites five registries at once.
  //
  // ALSO NOT HERE: the ten child components the page mounts (CrisisCard,
  // WeatherApiCard, FoodAiSettingsCard, HealthImportCard, BackupSettingsCard and
  // the rest). Each owns its own copy, and each extracts it in its own batch.
  //
  // TWO SHAPING RULES THE VALUES BELOW OBEY, both of them enforced by
  // `tests/lib/i18n.test.ts` rather than left to review:
  //
  //  · NO VALUE STARTS OR ENDS WITH A SPACE. A leading space is invisible in a
  //    diff, invisible in review, and the first thing a translator reorders —
  //    after which the concatenation the space was hiding has silently become a
  //    missing word. Where the shipped text joined two pieces (a summary plus
  //    "· nagy kontraszt", a sentence plus a recognition note), each piece is
  //    now a whole sentence in its own right and the caller joins them, so the
  //    join is visible at the call site instead of smuggled through the data.
  //  · PLACEHOLDERS, NOT CONCATENATION. A caller that writes `` `${a} ${b}` ``
  //    hands every language the Hungarian word order; `{n}. {name} előre` hands
  //    the words and lets the translator choose where they go.
  "settings.title": "Beállítások",
  "settings.hint": "Állítsd az appot a magadéra.",

  "settings.profile.title": "Profil",
  "settings.profile.summary": "Név és cél megadása",
  "settings.profile.nameLabel": "Neved (ahogy szólíthatunk)",
  "settings.profile.namePlaceholder": "pl. Anna",
  "settings.profile.goalLabel": "Miért használod az appot?",
  "settings.profile.goalPlaceholder": "pl. hogy jobban odafigyeljek magamra",
  "settings.profile.save": "Mentés",
  "settings.profile.saved": "Beállítások elmentve ⚙️",

  "settings.accessibility.title": "Könnyebb használat",
  "settings.accessibility.size": "{size} betűméret",
  "settings.accessibility.contrastSummary": "nagy kontraszt",
  "settings.accessibility.note": "Nagyobb betűk és erősebb kontraszt — bármikor váltható.",
  "settings.accessibility.sizeGroup": "Betűméret",
  "settings.accessibility.contrastLabel": "Nagy kontrasztú mód",
  "settings.accessibility.contrastHint": "Erősebb színek, tisztább szöveg.",

  // The three sizes are a list, not a sentence, and the segmented control draws
  // all three while the collapsed summary names one of them. The wording lives
  // here so a language cannot end up with a summary promising a word the button
  // does not carry — which is exactly how the two copies drifted before they
  // were merged.
  "settings.size.normal": "Normál",
  "settings.size.large": "Nagy",
  "settings.size.xlarge": "Nagyon nagy",

  // ---- The language itself (the switcher, Phase 2). ----
  //
  // The `language.<code>` values are AUTONYMS, and their value must not move
  // when the app's language does: a picker that offers a German reader the word
  // "Német" has not translated a language name, it has hidden the one they were
  // looking for. `en` and `de` are still partial, so they read these two through
  // the fallback rather than carrying them — and when they are translated, the
  // value to write is the SAME STRING. They live in the catalogue rather than in
  // the view for the reason every other word does — the summary line under the
  // card's title names the chosen language, and a name spelled in two places is
  // a name that can drift between the button and the summary meant to agree with
  // it.
  //
  // The note says out loud that the switch reloads. That is the honest half of
  // this feature: the weekday initials, the 48 icon reasons and the number
  // formatter are module constants (see this file's header), so a switch that
  // only re-rendered would translate the page and leave the calendar behind.
  "settings.language.title": "Nyelv",
  "settings.language.summary": "{language} felület",
  "settings.language.note":
    "Az app minden szövege erre a nyelvre vált. A váltás újratölti az oldalt, hogy a napok és a hónapok neve is átálljon.",
  "settings.language.group": "A felület nyelve",
  "language.hu": "Magyar",
  "language.en": "English",
  "language.de": "Deutsch",

  "settings.font.title": "Betűtípus",
  "settings.font.summary": "{main} · kézírás: {hand}",
  "settings.iconset.title": "Ikonok és emoji",

  "settings.nav.title": "Navigáció",
  "settings.nav.summaryAuto": "Az alsó sáv görgetésre elrejtődik",
  "settings.nav.summaryFixed": "Az alsó sáv mindig látszik",
  "settings.nav.summaryReordered": "fülek átrendezve",
  "settings.nav.note":
    "Az alsó sáv alapból mindig látszik. Ha bekapcsolod, lefelé görgetve elrejtőzik, és amint visszagörgeles, visszatér.",
  "settings.nav.hideLabel": "Alsó sáv elrejtése görgetéskor",
  "settings.nav.hideHint":
    "Nagyobb felület olvasás közben. Csökkentett animációt kérő rendszerbeállítás mellett nem működik.",
  "settings.nav.tabOrderGroup": "Fülek sorrendje",
  "settings.nav.tabOrderTitle": "Fülek sorrendje",
  "settings.nav.tabOrderNote": "A lenti sáv gombjai sorrendje. A nyilakkal átrendehető.",
  "settings.nav.tabUp": "{n}. {name} előre",
  "settings.nav.tabDown": "{n}. {name} hátra",
  "settings.nav.resetNotify": "Alapértelmezett sorrend visszaállítva.",
  "settings.nav.reset": "Alapértelmezett sorrend visszaállítása",
  "settings.sections.orderTitle": "Sorrend",
  "settings.sections.orderNote": "A kártyák sorrendje. A nyilakkal átrendezhető.",
  // Same wording as `settings.nav.reset`, kept as its own key rather than
  // borrowed across the namespace: the bar's reset and a tab's card reset are
  // two affordances that happen to share a sentence, and a section panel
  // reaching into `nav.*` would make that accidental rather than deliberate.
  "settings.sections.moveUp": "{n}. {name} előre",
  "settings.sections.moveDown": "{n}. {name} hátra",
  "settings.sections.reset": "Alapértelmezett sorrend visszaállítása",
  // The toggle that opens a tab's rearrange panel, and the sentence said once
  // when an arrangement is put back. `reset` above is the button; this is what
  // the button did, told to a reader who never saw the panel close.
  "settings.sections.start": "Kártyák átrendezése",
  "settings.sections.stop": "Kész",
  "settings.sections.resetDone": "Alapértelmezett sorrend visszaállítva.",
  // Phase 4 — two destructive confirmations that used to be raw Hungarian in
  // the component. They read as different weights only because one asked about
  // the action and the other named the object; the consequence is the same
  // either way, so the object goes into the sentence and the rule is shared.
  "entry.deleteTitle": "Biztosan törlöd ezt a bejegyzést?",

  // ---- Entry detail. Swept in the i18n sweep, round 3. ----
  //
  // `photoAlt` is NOT repeated here: it is `attachments.photoAlt`, shared with
  // the attachment picker. One key for one string, verified byte-for-byte in
  // round 2 rather than assumed.
  //
  // Four of these carry a value, and three of them are the case the sweep
  // exists for. `Alvás:` and `óra` were two JSXText nodes with the number
  // between them, so the parser saw two strings and a translator would have
  // been handed two fragments of one sentence. Same shape in the three
  // reflection lines — `Érzés:` reads on its own as a field label, so it
  // keeps its own key, but the value belongs to that label and travels with
  // it. One key, one word order, and the catalogue owns it.
  //
  // `stressField`, `energyField`, `pulse` and `noteLabel` are in here and were
  // NOT in the measured 15. The extractor decides a string is Hungarian by
  // looking for an accented vowel, and `Stressz`, `Energia`, `Pulzus` and
  // `Jegyzet` have none — the same blind spot that hid three sentences in
  // catch blocks last round, one layer over. A reader sees all four, so all
  // four move. The first three are used in BOTH the read row and the edit
  // labels on purpose: one stat, one sentence, one key, so the two views
  // cannot drift apart.
  "entry.detail.aria": "Bejegyzés részletei",
  "entry.detail.close": "Bezárás",
  "entry.detail.sleep": "Alvás: {hours} óra",
  "entry.detail.stressField": "Stressz: {value}/10",
  "entry.detail.energyField": "Energia: {value}/10",
  "entry.detail.pulse": "Pulzus: {value}",
  "entry.detail.noteLabel": "Jegyzet",
  "entry.detail.trackersTitle": "Nyomonkövetés",
  "entry.detail.reflectionTitle": "Reflexió",
  "entry.detail.feeling": "Érzés: {value}",
  "entry.detail.stressReason": "Feszültség: {value}",
  "entry.detail.need": "Szükséglet: {value}",
  "entry.detail.delete": "Törlés",
  "entry.detail.edit": "Szerkesztés",
  "entry.detail.moodAria": "Hangulat módosítása",
  "entry.detail.cancel": "Mégse",
  "entry.detail.save": "Mentés",
  "entry.detail.deleteMessage": "Ez a bejegyzés véglegesen eltávolításra kerül. Ezt a lépést nem lehet visszavonni.",
  "entry.detail.savedToast": "Bejegyzés frissítve ✏️",
  "entry.detail.deletedToast": "Bejegyzés törölve 🗑",
  "tracker.deleteTitle": "Biztosan törlöd ezt a nyomonkövetőt?",
  // Round 6 — `components/CustomTrackerManager.tsx`. The extractor's list
  // shows SEVEN literals here; the file has twenty-two. The other fifteen are
  // the ones it cannot see — strings inside `notify()`, inside a template
  // literal, and on props whose value is an expression — so they are
  // catalogued here by hand, which is the only way they get catalogued at all.
  //
  // `max` is interpolated rather than written into the sentence: the cap lives
  // in `lib/customTrackers.ts` as `MAX_COUNT`, and a catalogue that hardcodes
  // "20" is a second number that can drift from the one that enforces it.
  "customTrackers.title": "Saját nyomonkövetők",
  "customTrackers.intro":
    "Figyelsz valamit, amit a beépítettek nem fednek? Adj hozzá saját naprakövetőt — a napi bejegyzésnél jelenik meg (max. {max}).",
  "customTrackers.emojiLabel": "Emoji",
  "customTrackers.nameLabel": "Nyomonkövető neve",
  "customTrackers.namePlaceholder": "pl. Víz, Fájdalom, Adag…",
  "customTrackers.kindLabel": "Nyomonkövető típusa",
  "customTrackers.kindSlider": "Csúszka",
  "customTrackers.kindCheckbox": "Pipa",
  "customTrackers.kindText": "Szöveg",
  "customTrackers.minLabel": "Legkisebb érték",
  "customTrackers.maxLabel": "Legnagyobb érték",
  
  "customTrackers.limitReached": "Elérted a {max} nyomonkövető limitjét.",
  "customTrackers.duplicateName": "Ilyen nevű nyomonkövető már van.",
  "customTrackers.added": "{icon} {label} hozzáadva ✅",
  // The list rows say the kind in LOWER CASE, where the option buttons above
  // capitalise it, so these are not the three keys above under a different name
  // — sharing them would need a CSS `text-transform` to paper over a
  // grammatical difference, and the difference is real: one is a noun on its
  // own, the other sits mid-sentence after the tracker's name.
  "customTrackers.kindSliderShort": "csúszka",
  "customTrackers.sliderRange": "{kind} ({min}–{max})",
  "customTrackers.kindCheckboxShort": "pipa",
  "customTrackers.kindTextShort": "szöveg",
  "customTrackers.deleteLabel": "{label} törlése",
  "customTrackers.deleteMessage":
    "A(z) „{label}” nyomonkövető eltűnik a napi bejegyzésből. A régi bejegyzésekben mentett értékek megmaradnak.",
  "customTrackers.confirmDelete": "Igen, törlés",
  "customTrackers.deleted": "Nyomonkövető törölve.",
  // Round 6 — `components/DailyGoals.tsx`. Four literals by the extractor's
  // count and seven in the file: the ternary's two branches and the two
  // template literals are all inside EXPRESSIONS, which is exactly the shape it
  // cannot attribute a line to. Both are catalogued here.
  //
  // `goalProgress` is one key rather than three assembled from fragments. The
  // two numbers around `kész` are read as a fraction by a reader scanning the
  // card, and a translator who reorders the words cannot do it from three
  // independent pieces.
  "goals.title": "Mai célok",
  "goals.empty": "Tűzz ki 1–3 apró, elérhető célt a mai napra.",
  "goals.progress": "{done}/{total} kész — {percent}%",
  // STRAIGHT quotes here, and they are deliberate: this component's delete
  // label was built with ASCII `"` on both sides, while `CustomTrackerManager`
  // uses the Hungarian `„…"`. Byte-identical was verified with `od` before this
  // line was written, and normalising the typography is a copy decision, not a
  // translation one — so each string keeps the quotes it shipped with.
  "goals.deleteLabel": "\"{text}\" törlése",
  "goals.newLabel": "Új napi cél",
  "goals.newPlaceholder": "Új cél, pl. 10 perc séta",
  // `customTrackers.add` above and `today.meds.add`, `recording.add`,
  // `tools.activity.add` and `tools.habits.add` further down are all the same
  // word, verified byte-identical with `od`. Five copies is one word a
  // translator maintains five times, and the fifth is the one nobody remembers.
  // Round 6 points the two files it touches at this one; consolidating the
  // other three components is left to the rounds that own them, because a
  // shared key edited from four components at once is not reviewable as a
  // round.
  "common.add": "Hozzáadás",

  // Round 7 — `components/FoodAiSettingsCard.tsx`. Nine by the extractor's count,
  // thirteen here: the toggle's `hint`, the field's label, the "Mentett kulcs"
  // line and the tail of the cost sentence are all props whose value the
  // scanner does not attribute to a line.
  //
  // `dataBefore`/`dataAfter` are ONE sentence in two keys, and the split is
  // forced by the markup: `<strong>` wraps the host name between them. Putting
  // the host in a `{host}` placeholder and dropping the emphasis was the
  // alternative, and it would change what the reader sees — the host is the one
  // word in that sentence worth emphasising, because it is where their photo
  // and their key are going. Byte output is unchanged.
  "foodAi.title": "Étkezés AI — fotóelemzés",
  "foodAi.summary": "Fotó alapú becslés — alapból kikapcsolva.",
  "foodAi.toggleLabel": "Étkezés AI bekapcsolása",
  "foodAi.toggleHint": "Fotó alapján becsült tápérték az étkezés-mezőkbe. Alapból kikapcsolva.",
  "foodAi.dataBefore": "A feltöltött kép és a kulcsod az {host}",
  "foodAi.dataAfter":
    "felé kerül — semmi más, senki máshoz. A kulcs a böngésződben tárolódik, soha nem küldjük tovább, és bármikor törölhető.",
  "foodAi.costLabel": "Költség:",
  "foodAi.costBody": "minden elemzés kb. $0.01–0.02 az OpenAI számládon ({model} modell).",
  "foodAi.keyLabel": "OpenAI API kulcs",
  "foodAi.saveKey": "Kulcs mentése",
  "foodAi.clearKey": "Kulcs törlése",
  "foodAi.savedKey": "Mentett kulcs: {key}",
  // The `placeholder="sk-…"` on the key field is deliberately NOT here. It is
  // the shape of the credential, not copy: a translator rendering it in another
  // script would be inventing a prefix their provider does not use. Same
  // reasoning that keeps a MIME type and an import path out of the catalogue.

  // Round 7 — `components/HealthImportCard.tsx`. Twelve by the count, twenty-two
  // here. The ones the scanner cannot see are the three parse-failure messages
  // inside a nested ternary, the "nothing to write" line, and the four
  // comma-prefixed suffixes built as template literals in the preview list.
  //
  // The preview list appends its suffixes to a value rather than rendering them
  // beside one, which is where the first draft of this round went wrong: it put
  // the leading ", " and " — " INSIDE these strings, and `tests/lib/i18n.test.ts`
  // refuses any catalogue value whose `.trim()` differs from itself. That
  // invariant is right — a stray space is invisible in the source and changes
  // the output — so the separators are punctuation in the markup instead, and
  // the two "skipped" lines became whole sentences rather than halves, which is
  // what a translator wanted anyway.
  "healthImport.title": "Okosóra import",
  "healthImport.summary": "Apple Health vagy Google Fit adatainak beolvasása — nem kötelező.",
  "healthImport.intro":
    "Apple Health (.xml) vagy Google Fit (.json) export beolvasása. Az adat a böngésződben marad; csak meglévő napokat töltünk fel — a kézzel írt értékeid mindig nyernek.",
  "healthImport.hrLabel": "Szívritmus és vértelítettség",
  "healthImport.hrHint":
    "Két új nyomonkövető, egy kapcsolóval. Alapból kikapcsolva — az import csak akkor ír bele, ha itt bekapcsolod.",
  "healthImport.stubsLabel": "Üres napok létrehozása az importált napokra",
  "healthImport.stubsHint":
    "Alapból kikapcsolva: csak olyan napok frissülnek, amelyekhez már írtál bejegyzést.",
  "healthImport.fileLabel": "Export fájl",
  "healthImport.errorUnparseable": "A fájl nem értelmezhető — biztosan export fájl ez?",
  "healthImport.errorUnrecognized": "A fájl felismerhetetlen formátumú.",
  "healthImport.errorTooLarge": "A fájl túl nagy a böngészőnek.",
  "healthImport.previewTitle": "Előnézet",
  "healthImport.previewLead": "— mi változna:",
  // `label` is deliberately absent: it is a tracker name out of the data, not a
  // sentence, and interpolating it would invite a translator to reformat it.
  "healthImport.previewRow": ": {count} nap az exportban",
  "healthImport.previewApplies": "{count} kitölthető",
  "healthImport.previewPreserved": "{count} megtartva (a tiéd marad)",
  // TWO WHOLE SENTENCES, not one sentence and a suffix. They share their first
  // clause, and that clause is now written twice on purpose: a translator
  // reordering "— bejegyzés lesz létrehozva." around a half-sentence is a worse
  // outcome than one duplicated noun phrase they can see in both halves.
  "healthImport.skippedWillCreate": "{count} naphoz nincs bejegyzés — bejegyzés lesz létrehozva.",
  "healthImport.skippedSkipped": "{count} naphoz nincs bejegyzés — ezek kimaradnak.",
  "healthImport.apply": "Alkalmazás",
  "healthImport.nothingApplies": "Nincs kitölthető érték ezzel a beállítással.",
  "healthImport.nothingToWrite": "Nincs mit feltölteni — minden érték már megvan.",
  "healthImport.optionalFooter":
    "Nincs okosórád? Minden érték kézzel is beírható — ez a kártya nem kötelező.",

  // Round 8 — `components/InstallPrompt.tsx`. Nine by the count and eleven in
  // the file: the "installed" toast is inside an async callback and the card
  // title appears in both branches of the installable check. The two copies of
  // each collapse into one key, which is the point of having keys.
  "install.bannerTitle": "Telepítés kezdőképernyőre",
  "install.bannerBody":
    "Használd az appot saját ikonról, teljes képernyőn — minden adat továbbra is a készülékeden marad.",
  "install.bannerAction": "Telepítés",
  "install.bannerDismiss": "Megjelenítés elrejtése",
  "install.done": "Telepítve — jó naplózást! 🧭",
  "install.cardTitle": "Alkalmazásként",
  "install.notOffered":
    "A böngésződ még nem ajánlotta fel a telepítést. Az app így is teljes értékkel működik böngészőben — majd ha a telefon ajánlja, itt fel fog tűnni a gomb.",
  "install.offered":
    "Tedd ki az appot a kezdőképernyőre: teljes képernyős, offline is működik, és minden adat helyben marad.",
  "install.cardAction": "Telepítés most",

  // Round 8 — `components/IconSetPicker.tsx`. Nine by the count, ten here: the
  // "Licencek" heading is an `<h4>`, which the scanner does not collect.
  //
  // Round 15 catalogued the strings this comment named — see `iconPolicy.*`
  // below. The extractor still does not walk `.ts`, which is why the round
  // table has to say so in words; what changed is that the gap is closed
  // rather than described.
  "iconset.intro": "Amíg itt nem választasz, minden ugyanúgy néz ki, mint eddig.",
  "iconset.contentNote":
    "A tartalmi ikonok — hangulatok, tevékenységek, mérföldkövek — követik a készletet. A gombok és űrlapok ({count} ikon) szándékosan vonalrajzok maradnak: egy 3D „+” vagy kulcskerítő nem olvashatóbb, csak zsúfoltabb.",
  "iconset.groupLabel": "Ikonkészlet kiválasztása",
  "iconset.noneLabel": "Nincs beállítva",
  "iconset.noneBlurb": "A jelenlegi megjelenés — ahogy eddig láttad.",
  "iconset.chromeSummary": "Miért marad {count} ikon vonalrajz? (a teljes lista)",
  "iconset.chromeBody":
    "Egy ikon akkor követné a készletet, ha van hozzá kép. A gombok és űrlapvezérlők nem ilyenek: a jel maga a felirat, és egy fényes illusztráció nagyobb felületen, rosszabbul olvasható. Ez a lista pontosan az, ami szándékosan marad vonalrajz, csoportonként az okával.",
  "iconset.licencesHeading": "Licencek",
  "iconset.inUse": "használva",

  // Round 9 — `components/MedicationTimesCard.tsx`. Eight by the count, ten in
  // the file: the toggle's hint and the " — " + dose line are the two it cannot
  // attribute. The dose line keeps its em dash in the markup — there is no word
  // in it to translate, only a separator and a value out of the data.
  //
  // `reminderLabel` takes `{name}` rather than being split, because the
  // medication name is the reader's own text and must never be reworded.
  "meds.times.title": "Gyógyszeridőpontok",
  "meds.times.empty":
    "Először adj meg gyógyszereket a Felfedezés fül Egészség szekciójában, aztán itt rendelhetsz időpontokat és kapcsolhatsz emlékeztetőt.",
  "meds.times.reminderNote":
    "Az emlékeztető akkor szólal meg, amikor az app fut — nincs szerver, ami a háttérben figyelne. Telepített alkalmazásként (PWA) ez akár a háttérben is működik; iPhone-on telepítés szükséges hozzá.",
  "meds.times.count": "{count}/{max} időpont",
  "meds.times.none": "Még nincs időpont megadva.",
  "meds.times.add": "Időpont",
  "meds.times.maxReached": "Elérted a maximumot ({max}).",
  "meds.times.reminderLabel": "Emlékeztető: {name}",
  "meds.times.reminderHint":
    "Kikapcsolod, ha nem szeretnéd emlékeztetést erről a gyógyszerről.",

  // Round 9 — `components/PinLockGate.tsx`. Seven, and the three that make the
  // "you cannot recover this" paragraph are split by a `<strong>` in the middle
  // of one sentence. The split is kept: "összes adat törlése" is the one phrase
  // in that paragraph that must not be skimmed past, and burying it inside a
  // placeholder would take away the emphasis that makes it land.
  //
  // `aria-label="PIN"` and `placeholder="••••"` stay raw. "PIN" is an acronym
  // the reader's device keyboard expects, and the bullets are a mask, not text.
  "pin.gate.label": "Zárolás feloldása",
  "pin.gate.title": "Belső Iránytű zárolva",
  "pin.gate.body": "Add meg a PIN-ed a folytatáshoz.",
  "pin.gate.submit": "Feloldás",
  "pin.gate.forgotBefore":
    "Elfelejtetted? A PIN-t nem tároljuk — sehol, senkinél. Így ha nem emléksz rá, az egyetlen lehetőség az",
  "pin.gate.forgotEmphasis": "összes adat törlése",
  "pin.gate.forgotAfter":
    "és az újrakezdés. Ha meg akarod tartani a naplódat, előbb exportáld a Beállítások → Adatok és mentés menüben.",

  // Round 10 — `components/WeeklyReflectionCard.tsx`. Three by the count and
  // four in the file: the "Elmentem" button is a line the scanner skipped.
  //
  // The prompt's own `theme`, `question` and `hint` are already catalogue
  // entries — they live in `lib/weeklyReflection.ts` and this card renders
  // whatever it is handed. Only the chrome around them is here.
  "week.textPlaceholder": "Írhatsz egy-két mondatot…",
  "week.textLabel": "Heti reflektálás",
  "week.save": "Elmentem",
  "week.skip": "Kihagyom erre a hétre",

  // Round 11 — `components/LagAnalysisCard.tsx`. Eight by the count, twelve in
  // the file: the card's summary is a ternary of two template literals, and the
  // four `title=` tooltips plus the two day-cell labels sit in a `.map`
  // callback the scanner does not walk.
  //
  // `lag.summary*` are two keys rather than one with a conditional inside it,
  // because they are two different claims: one says the chart is empty for a
  // reason, the other says what it now shows.
  "lag.summaryEmpty": "Legalább 4 bejegyzés és 2 azonos tevékenység kell",
  "lag.summaryFilled": "{count} tevékenység hatása a következő 2 napon",
  "lag.intro":
    "Egyes tevékenységek hatása csak 1–2 nappal később jelentkezik. Itt látszik, hogyan alakult a hangulat az adott tevékenység utáni napokon.",
  "lag.needsData": "Ehhez legalább 4 bejegyzés és legalább 2 azonos tevékenység kell.",
  "lag.daysLabel": "{count} nappal",
  "lag.cellDay0": "ma",
  "lag.titleDay0": "A tevékenység napján",
  "lag.cellDay1": "+1 nap",
  "lag.titleDay1": "A következő napon",
  "lag.cellDay2": "+2 nap",
  "lag.titleDay2": "Két nappal később",
  "lag.cellBaseline": "bázis",
  "lag.titleBaseline": "Egyéb napok átlaga",
  "lag.disclaimer":
    "A delta a tevékenység nélküli napok átlagához képest értendő (hangulat-pont, 0–100). Kevesebb mint két minta esetén nem számolunk.",

  // Round 11 — `components/ReportExport.tsx`. Seven by the count, eleven in the
  // file: the card summary is a template literal over the entry count, and the
  // download-cost paragraph is three fragments split around two numbers.
  //
  // `export.cost` is ONE key with both sizes as placeholders rather than three
  // fragments. It was three JSX text nodes with the numbers interpolated, and a
  // translator cannot reorder "kb. X kB letöltődik (Y kB tömörítetlenül)" when
  // the halves are separate keys and neither is a sentence.
  "export.summary": "PDF vagy CSV a(z) {count} bejegyzésből",
  "export.intro":
    "Nyomtartható összefoglaló szakembernek: összegzés, hangulat-görbe és az utóbbi napok táblázata — vagy teljes CSV a saját elemzéshez.",
  "export.busy": "Készítés…",
  "export.pdfAction": "PDF jelentés",
  "export.csvAction": "CSV export",
  "export.cost":
    "A PDF első készítésekor kb. {compressed} kB letöltődik ({raw} kB tömörítetlenül) — ez a legnagyobb, amit az app letölt, és csak egyszer. Utána a böngésződ tárolja, offline is működik. A CSV export semmit nem tölt le.",
  "export.disclaimer": "A jelentés a saját adataidból készül helyben — semmi nem kerül fel szerverre.",

  // Round 12 — `components/FontPicker.tsx`. Seven by the count, nine in the
  // file: the download badge's two branches are an expression, and the count
  // never saw them.
  //
  // The two preview samples are user-facing too — they are the first thing the
  // reader sees of a face — and the hand one is byte-identical to the normal
  // one, so it shares the key rather than repeating the sentence.
  "font.sample": "Így őrzöm a tűz emlékét.",
  "font.sampleBold": "Jó napot",
  //
  // NOT CATALOGUED HERE: `FONT_CATEGORY_LABELS`, `FONT_CATEGORY_NOTES` and each
  // font's own `label`/`hint` are shown to the reader and live in `lib/fonts.ts`,
  // which is a `.ts` file. Same blindness as `lib/icon-policy.ts` in round 8 —
  // recorded there, applies here too.
  "font.intro": "Válassz betűtípust — az egész app azonnal átvált.",
  "font.groupLabel": "Betűtípus kiválasztása",
  "font.handGroupLabel": "Kézírásos betűtípus",
  "font.handTitle": "Kézível írott",
  "font.handNote":
    "Csak a saját szövegedre vonatkozik. A gombok, a menük és a űrlapok mindig a fenti betűtípusban maradnak.",
  "font.selfHostedNote":
    "A betűtípusok a saját szerverünkről érkeznek, a gépéden maradnak — nem hívunk meg külső szolgáltatót.",
  "font.recommended": "Ajánlott",
  "font.noDownload": "nincs letöltés",
  "font.kbSize": "kb. {kb} kB",

  // Round 12 — `components/ReminderCard.tsx`. Six by the count, thirteen in the
  // file. The four permission states are one nested ternary the scanner cannot
  // attribute, and the toast is inside a callback. Four keys for the four
  // states, because each is a different sentence about a different thing the
  // reader has to do — or not do.
  //
  // `nextAt` keeps the colon INSIDE the key on the strength of a value ending
  // in ": " rather than a literal " — ", which the trim invariant would reject.
  "reminder.title": "Napi emlékeztető",
  "reminder.intro":
    "Egy kíméletes, napi emlékeztető — nincs push-szolgáltatás, nincs nyaggatás. Ha az app zárva van, a note egyszerűen vár a következő nyitásig.",
  "reminder.toggleLabel": "Emlékeztető bekapcsolása",
  "reminder.permissionDenied": "Az értesítés nincs engedélyezve — a beállítás némán marad.",
  "reminder.stateGranted": "Engedélyezve ✓",
  "reminder.stateBlocked": "A böngészőben tiltva van — engedélyezd a címsorban.",
  "reminder.stateUnsupported": "Ez a böngésző nem támogatja az értesítést.",
  "reminder.stateAsk": "Engedélyt kérünk bekapcsoláskor.",
  "reminder.timeLabel": "Időpont",
  "reminder.messageLabel": "Emlékeztető üzenet",
  "reminder.nextAt": "Következő emlékeztető: {when} ({time})",
  // `when` above is itself one of these two. Split rather than one key with a
  // conditional, because "kb. 0 óra 7 perc" is the kind of sentence that reads
  // wrong in every language and a translator cannot fix it from inside a
  // placeholder.
  "reminder.inHoursMinutes": "kb. {h} óra {m} perc",
  "reminder.inMinutes": "kb. {m} perc",

  // Round 12 — `components/WeatherApiCard.tsx`. Six by the count, thirteen in
  // the file: `WHAT_LEAVES` is a concatenated module constant, the three fetch
  // failures are a ternary, and the city placeholder and both toggle hints are
  // props.
  //
  // `whatLeaves` is the one string in the app that tells the reader exactly
  // which data leaves the device, and its own comment says the point is that
  // "a reviewer can read exactly what the user was told". It stays ONE string.
  "weather.title": "Időjárás automatikusan",
  "weather.summary": "Automatikus kitöltés — alapból kikapcsolva.",
  "weather.whatLeaves":
    "Az open-meteo.com kapja meg a város nevét (vagy, ha bekapcsolod, a készülék koordinátáit) — és csak azt. Nincs fiók, nincs kulcs, nincs más adat.",
  "weather.toggleLabel": "Automatikus időjárás",
  "weather.toggleHint":
    "A napló űrlapja kitölti az időjárás-mezőket a lekért adattal. Kézzel bármikor felülírható.",
  "weather.errorNoLocation": "Előbb add meg a városneved.",
  "weather.errorDenied":
    "A böngésző nem adta meg a helymeghatározást — kézzel is beírhatod.",
  "weather.errorFetch": "Most nem sikerült lekérni — a kézi mezők változatlanul működnek.",
  "weather.cityLabel": "Város",
  "weather.cityPlaceholder": "pl. Budapest",
  "weather.cityNote":
    "Ez a kiinduló hely. Amíg be van kapcsolva, mindig ez az alapértelmezett.",
  "weather.gpsLabel": "Készülék helymeghatározása",
  "weather.gpsHint":
    "A városnév helyett a böngésző koordinátáit kéri el — külön engedély, csak ettől a kapcsolótól függ.",
  // The four that the scanner cannot see, because it does not count a template
  // literal, a ternary branch, or a record's values.
  //
  // `probeCached` and `probeFresh` are whole sentences with their own
  // punctuation, so the source can stop concatenating: `{value}` carries the
  // composed description and nothing else. `describe()`'s fallback is not an
  // error — it is what the status line says when the API answered with
  // numbers we cannot turn into words — so it is copy, not a blank.
  "weather.probeCached": "Mai adat a gyorsítótárból: {value}.",
  "weather.probeFresh": "Mai adat: {value}.",
  "weather.noReadableValue": "a szolgáltatás nem adott értelmezhető értéket",
  "weather.tryBusy": "Lekérés…",
  "weather.tryNow": "Mai adat lekérése most",
  // The provider's condition codes, as Hungarian words. Keyed by the code so a
  // new code cannot silently print English to the reader: an unknown code falls
  // through to `day.condition`, which is why these are a record and not an
  // array.
  "weather.conditionSunny": "napsütéses",
  "weather.conditionCloudy": "felhős",
  "weather.conditionRainy": "esős",
  "weather.conditionSnowy": "havazás",
  "weather.conditionFoggy": "ködös",
  // The second quadrant card has no section label behind it, so it gets its own
  // key rather than borrowing an unrelated one. Borrowing `insights.more.title`
  // here would have printed "További felismerések" on a sleep chart.
  "quadrants.sleepTitle": "Kvadráns és alvás",

  // -- Round 13: the insight cards, and the background-image picker ----------
  //
  // SIX BY THE COUNT for the quadrant file and NINE for the picker, but the
  // interesting strings are the ones a regex cannot see: a ternary of three
  // sentences, four template literals inside a `<td>`'s `title`, a count of
  // patterns, and a record of confidence words.
  //
  // "Még nincs elég adat" is FOUR strings across three of these files and one
  // shared key here, because it is one sentence about one state and the
  // extractor's count treats every appearance as its own problem.
  "insights.notEnoughData": "Még nincs elég adat",
  "quadrants.emotion.emptyHint":
    "Rögzíts ugyanazt az érzést legalább két napban, kontextussal — utána megmutatjuk, mivel jár együtt.",
  "quadrants.emotion.listLabel": "Érzés és kontextus együttjárás",
  // The count is one key with four placeholders rather than four fragments.
  // The row used to be `<strong>{emotion}</strong> — <em>{context}</em>
  // társaságában {together}/{days} napon ({percent}%)`, which reads as Hungarian
  // only because Hungarian puts the numbers last; splitting it would have made
  // that word order unrecoverable in every other language. The emphasis on the
  // emotion and the context goes with it — the same trade round 3 made on the
  // entry-detail stats, and for the same reason: a sentence a translator cannot
  // reorder is worth more than two words in bold.
  "quadrants.emotion.row": "{emotion} — {context} társaságában {together}/{days} napon ({percent}%)",
  "quadrants.sleep.emptyHint":
    "Két alvási adattal egy kvadránsban már összehasonlítjuk a többi nappal.",
  "quadrants.sleep.listLabel": "Átlagos alvás kvadráns szerint",
  // The same trade as the row above: the sleep value and its delta were two
  // expressions inside one sentence, and the delta only means something next to
  // the number it is compared against.
  "quadrants.sleep.fewData": "kevés adat",
  "quadrants.sleep.hours": "{hours} óra",
  "quadrants.sleep.delta": "({sign}{delta} a többihez képest)",

  // Pattern insights.
  "insights.patterns.confidenceStrong": "erős jel",
  "insights.patterns.confidenceMedium": "közepes jel",
  "insights.patterns.confidenceWeak": "gyenge jel",
  "insights.patterns.count": "{count} mintázat",
  "insights.patterns.basis":
    "A teljes naplódból, {count} bejegyzésből számítva — nem az above időszakból.",
  "insights.patterns.sample": "{count} nap alapján",
  // The SECOND refusal to name a diagnosis, said in different words because
  // this one is about correlation rather than about the analysis as a whole:
  // "these are relationships in your own data, not causes". Listed in
  // `FEATURE_NAME_ALLOWANCE` for the same reason as the first.
  "insights.patterns.disclaimer":
    "Ezek összefüggések a saját adataidban, nem okok. Nem orvosi tanács és nem diagnózis.",

  // The correlation grid. Every `title` in the table is a tooltip AND the cell's
  // accessible name, so they are copy, not decoration.
  "insights.grid.summary": "{rows} tevékenység × {cols} mérhető eredmény",
  "insights.grid.explain":
    "Sorok: tevékenységek · Oszlopok: mérhető eredmények. Minden cella azt mutatja, mennyivel különbözik az átlag azokon a napokon, amikor a tevékenység megvolt (▲ jó irány, ▼ rossz irány). Legalább {min} nap kell egy cellához.",
  "insights.grid.emptyHint":
    "Még nincs elég adat — jelöld meg a tevékenységeket a napi bejegyzésnél, és pár nap után itt megjelennek a minták.",
  // The region's own name, not the card's: a screen-reader user moving into the
  // table needs to hear what they have entered, and the card title is announced
  // by the disclosure above it.
  "insights.grid.tableLabel": "Hatásmátrix",
  "insights.grid.rowHeader": "Tevékenység",
  "insights.grid.tooFewSamples": "Kevesebb mint {min} adat",
  "insights.grid.flat": "Nincs érdemi különbség ({count} nap)",
  // The four directions. They are four keys rather than one with a suffix
  // because a translator has to place "ponttal" where their language puts the
  // unit, and "nagyobb"/"kisebb" are the words that carry the meaning — the
  // "better"/"worse" pair is a JUDGEMENT the app only makes when the outcome
  // itself declares a direction (`higherIsBetter`).
  "insights.grid.effectLarger": "ponttal nagyobb",
  "insights.grid.effectSmaller": "ponttal kisebb",
  "insights.grid.effectBetter": "ponttal jobb",
  "insights.grid.effectWorse": "ponttal rosszabb",
  // The cell's whole sentence, one key. "e nélkül" ("without it") case-agrees
  // with `{effect}`, so it has to travel inside the sentence rather than beside
  // it: assembled in the component, the two halves would come back in whatever
  // order the component concatenated them, and no translator could fix it.
  "insights.grid.cellEffect": "{label}: {delta} {effect} e nélkül ({count} nap)",

  // The background-image picker. Nine by the count; the two ternaries are six
  // whole sentences between them, and `ariaLabel` props are invisible to the
  // scanner in the same way the fit choice's own test was.
  "background.errorLoad": "A kép betöltése nem sikerült.",
  "background.busy": "Betöltés…",
  "background.replace": "Kép cseréje",
  "background.choose": "Kép kiválasztása",
  "background.emptyHint":
    "Válassz egy képet a készülékedről, és legyen az app háttere. A kép csak ezen az eszközön marad — semmi nem töltődik fel.",
  "background.sampleCard":
    "Minta kártya — 100% átlátszóságnál a háttérkép látszik át, a szöveg a takaráson marad.",
  "background.scrimLabel": "Háttérletakarás",
  "background.cardAlphaLabel": "Kártyák átlátszósága",
  // Rewritten with the decoupling: the slider no longer strengthens the
  // scrim — the old text described a compensation that made the two sliders
  // drive one surface, which is exactly what production reported.
  "background.cardAlphaHint":
    "A csúszka csak a kártyákat halványítja, a háttérletakarást nem mozgatja — 100%-nál a kép látszik át, a szöveget a Háttérletakarás csúszka teszi olvashatóvá.",
  "background.blurLabel": "Háttér életlenítése",
  "background.percent": "{value} százalék",
  "background.fitLabel": "Kép mérete",
  "background.fitAria": "Hogyan jelenjen meg a háttérkép",
  "background.fitCover":
    "Kitöltés: a kép megnyúlik, hogy a képernyőt kitöltsön — nagy képnél elmosódhat.",
  "background.fitContain":
    "Teljes kép: a kép egésze látszik, eredeti méretben, üres sávokkal.",
  "background.fitSoft":
    "Lágy kitöltés: az egész kép a maga méretében, a sávokat ugyanaz a kép tölti ki elmosva.",
  "background.paletteLabel": "A takarás színe",
  // "Miből vegye a háttértakarás a színét" said this in the FORMAL register, which
  // the app's own `tegezoRule` forbids and which no guard could see while the
  // string lived in the component. A noun phrase asks the same question without
  // addressing the reader at all, and it matches the sibling label's shape.
  "background.paletteAria": "A háttértakarás színének forrása",
  // "takrás" was a typo for "takarás", live in the shipped UI. It was invisible to
  // every guard here because a raw string in a component is not a key anyone
  // reads; it is now a key, which is what makes the misspelling checkable.
  "background.paletteHighContrast":
    "Nagy kontraszt bekapcsolva: a takarás átlátszatlan és a téma színét viseli, a kép színe nem számít bele.",
  "background.paletteImage":
    "A képből: a takarás a saját színét viseli, de a téma fénye vagy sötéte változatlan marad.",
  "background.paletteTheme":
    "Saját témám: egységes takarás, világos vagy sötét — a téma alapján.",
  "background.remove": "Kép eltávolítása",

  // -- Round 14: the last seven files, and the end of the sweep ---------------
  //
  // THIRTEEN counted literals across seven files. What is below is close to
  // forty keys, because the count does not see a four-branch greeting
  // ternary, a `title` attribute, a `summary` template, or a unit that rides
  // inside a label.
  //
  // The app's own NAME is the first one, and it was the only remaining raw
  // string that is load-bearing in a way no guard could see: `backup.passkeyRpId`
  // already holds it for the WebAuthn request, so the header and the credential
  // request had two independent copies of the product's name.
  "app.name": "Belső Iránytű",
  "app.greetingNight": "Jó éjt",
  "app.greetingMorning": "Jó reggelt",
  "app.greetingDay": "Szép napot",
  "app.greetingEvening": "Jó estét",
  // Two shapes, one for a named reader and one for an anonymous one. The comma
  // and the exclamation belong to the sentence, so a language that does not use
  // them can drop them without touching the component.
  "app.greetingNamed": "{part}, {name}!",
  "app.greetingAnonymous": "{part}!",
  "app.streakTitle": "Egymás utáni napok naplózással",
  "app.streakChip": "{count} nap",
  "app.navLabel": "Fő navigáció",

  // The lazy view boundary in `App.tsx`. Two messages: the chunk failed, or it
  // has not arrived yet. They are different sentences because one asks for an
  // action and the other describes a moment.
  "app.insightsFailed":
    "Az Elemzés nézet most nem tölthető be. Online egyszer nyisd meg újra.",
  "app.insightsLoading": "Elemzés betöltése…",

  // The period selectors. "Hónap"/"Év" are two keys each rather than one key
  // reused across two files: the grid's `<select>` labels and the picture's
  // `aria-label`s are the same words to a reader and two different controls to
  // a screen reader, and a translator may want to make one of them longer.
  "stats.monthLabel": "Hónap",
  "stats.yearLabel": "Év",
  "stats.summary": "{period} · {count} naplózott nap",
  "stats.yearAvgMood": "{year} éves átlag hangulat",
  "stats.yearDaysTotal": "{year} naplózott nap összesen",
  // Three labels in a `map` over an array literal — the shape an AST walk
  // reading JSXText cannot see, because the words are object values, not
  // markup. Found by the round-14 byte check, which reads every accented
  // literal in the file and asks which key it belongs to.
  //
  // The SCALE rides in the label, not beside the number, and that is the point
  // of putting it in a key: `0–100` and `1–10` are different ranges and a
  // translator who moved the number would otherwise have nothing to move with
  // it.
  "stats.avgMoodScale": "átlag hangulat (0–100)",
  "stats.avgStressScale": "átlag stressz (1–10)",
  "stats.avgEnergyScale": "átlag energia (1–10)",

  // The year-in-pixels picker, and the tile's own fallback when a day has no
  // entry at all — which is most of a first run, so it is copy the reader sees
  // before they have written anything.
  "yearInPixels.yearLabel": "Év",
  "yearInPixels.monthLabel": "Hónap",
  "yearInPixels.noEntry": "nincs bejegyzés",
  // The grid's own name, composed from the month caption — and the line that
  // stands in until a day is picked. The second one is the FIRST thing a
  // reader sees on this card, which is why it is copy and not a blank.
  "yearInPixels.gridLabel": "{month} hangulat-naptár",
  "yearInPixels.pickPrompt": "Válassz egy napot a naptárban.",

  // The achievements card. Two summaries and two empty-state sentences, all
  // four in ternaries or template literals around a count.
  "achievements.summary": "{earned} / {total} kitüntetés",
  "achievements.emptyTitle": "A rendszeres naplózás apró kitüntetéseket szerez — kezdd el a sorozatot!",
  "achievements.keepGoing": "{earned} kitüntetés megszerezve — folytasd, még több van!",

  // A badge, not a word: "ÚJ" marks what is new since the reader last looked.
  // It is set in caps in Hungarian because that is how the badge styles it, so
  // the key carries the caps and the guard's sentence-case sweep knows to skip
  // it — see `tests/lib/i18n.test.ts`.
  "achievements.newBadge": "ÚJ",

  // The tracker's own section heading, and the units that ride inside a field
  // label. A unit is not a word, so it is NOT a key: `(kg)` is the same in
  // every language the app will ever have, and translating it would be
  // translating a measurement.
  "trackers.sectionTitle": "Nyomonkövetés",
  "trackers.frameSummary": "{n} bejegyzés a mai naphoz",

  // -- Round 15: `lib/icon-policy.ts`, the first `.ts` file the sweep touches --
  //
  // This one is not a form or a card. It is a DECISION RECORD: 48 icons that
  // deliberately stay Lucide line art in every set, each with the reason a user
  // is shown in the Settings disclosure. The file's own header says why the
  // reasons are in Hungarian — "a policy nobody can read is a policy nobody
  // follows" — which is exactly the argument for cataloguing them.
  //
  // FORTY-SIX keys for FORTY-EIGHT icons, because two pairs genuinely share a
  // reason: `ChevronDown`/`ChevronRight` are both "irányjelző", and
  // `Ban`/`Radio` are both "adatvédelmi felsorolás". Two keys with the same
  // value would be two places to edit one fact, so each pair shares one key
  // and says so at the call site.
  //
  // The four `group:` values are ALSO keys, but not here: a group is a
  // structural id that `chromeByGroup()` matches on, and translating the id
  // would break the lookup. They live under `iconPolicy.group.*` and are
  // resolved at the display site, so the id stays Hungarian and stable while
  // the heading becomes translatable.
  "iconPolicy.group.gombok": "Gombok",
  "iconPolicy.group.jelzesek": "Jelzések",
  "iconPolicy.group.berendezes": "Berendezés",
  "iconPolicy.group.meroszamok": "Mérőszámok",

  "iconPolicy.reason.plus": "a „+” jel 3D-ben nem olvashatóbb",
  "iconPolicy.reason.x": "bezárás",
  "iconPolicy.reason.check": "kész",
  "iconPolicy.reason.trash": "törlés",
  "iconPolicy.reason.pencil": "szerkesztés",
  "iconPolicy.reason.save": "mentés",
  "iconPolicy.reason.upload": "feltöltés",
  "iconPolicy.reason.download": "letöltés",
  "iconPolicy.reason.mic": "hangfelvétel",
  "iconPolicy.reason.square": "leállítás",
  // Shared with `ChevronRight`: both are a direction marker and nothing else.
  "iconPolicy.reason.chevronDown": "irányjelző",
  "iconPolicy.reason.search": "keresőmező",
  "iconPolicy.reason.sliders": "állítás csúszkái",
  "iconPolicy.reason.eye": "megjelenítés vagy elrejtés",
  "iconPolicy.reason.lockIcon": "zár",
  "iconPolicy.reason.shieldAlert": "védelem",
  "iconPolicy.reason.bell": "emlékeztető",
  "iconPolicy.reason.mapPin": "hely",
  "iconPolicy.reason.paperclip": "melléklet",
  "iconPolicy.reason.link": "hivatkozás",
  "iconPolicy.reason.settings": "a menü ikonja",
  "iconPolicy.reason.calendar": "dátummező",
  "iconPolicy.reason.calendarDays": "nap kiválasztása",
  "iconPolicy.reason.clock": "időpont",
  "iconPolicy.reason.hourglass": "idővonal",
  "iconPolicy.reason.layoutGrid": "nézetváltó",
  "iconPolicy.reason.table": "táblázat",
  "iconPolicy.reason.palette": "színszerkesztő",
  "iconPolicy.reason.image": "a háttérkép kiválasztása",
  "iconPolicy.reason.type": "betűméret",
  "iconPolicy.reason.clipboardList": "lista nézet",
  "iconPolicy.reason.fileText": "fájl",
  "iconPolicy.reason.history": "előzmények",
  "iconPolicy.reason.barChart": "diagram kerete",
  "iconPolicy.reason.lightbulb": "ötlet",
  "iconPolicy.reason.smartphone": "telepítési kérés",
  "iconPolicy.reason.phone": "Segélyvonal",
  "iconPolicy.reason.messageCircle": "szövegbuborék",
  "iconPolicy.reason.briefcase": "a „Felfedezés” fül doboza",
  "iconPolicy.reason.wind": "lélegzetmozgás",
  // Shared with `Radio`: both name the privacy listing, and neither is a
  // subject matter a picture could improve.
  "iconPolicy.reason.ban": "adatvédelmi felsorolás",
  "iconPolicy.reason.scale": "az egyensúly-pontszám kártyája",
  "iconPolicy.reason.target": "cél",
  "iconPolicy.reason.zap": "energia",
  "iconPolicy.reason.activity": "stressz",
  "iconPolicy.reason.moon": "az alvás-összehasonlítás kártyája",

  // -- Round 16: `lib/fonts.ts`, and what in it is deliberately NOT a key -------
  //
  // TWENTY-ONE keys here, out of a file that holds far more Hungarian. The rest
  // is named, not swept, because it must not move:
  //
  //  - TEN family names (Inter, Montserrat, Dancing Script…) and the two
  //    RETIRED_FONT_LABELS. These are proper nouns. A translator who "fixed"
  //    them would be renaming a typeface, and `RETIRED_FONT_LABELS` exists
  //    precisely to remember the name the user READ — translating that defeats
  //    its whole purpose.
  //  - FIVE category headings: "Sans", "Serif", "Rounded", "Condensed",
  //    "Mono". These are the international typographic terms, the same ones
  //    Google Fonts and Adobe show in every locale. `FONT_CATEGORY_LABELS`'s
  //    own comment calls them "the Hungarian heading", which is a misnomer —
  //    round 16 fixed the comment rather than the values. Translating a
  //    category name away from the term every font tool uses makes the picker
  //    harder to use, not easier.
  //
  // What IS copy: the five category NOTES (one line each under a heading), the
  // twelve `hint:` lines, and the two Hungarian `label:` values — "Rendszer"
  // and "Kikapcsolva" — which name the system face and the off state rather
  // than a family.
  "font.categoryNote.sans":
    "Vonalas, szöveghez való. Egymás mellett alig lehet őket megkülönböztetni — ez a valódi különbségük.",
  "font.categoryNote.serif": "Kis karokkal írott, könyvszerű. Hosszú szöveget olvasni kellemes.",
  "font.categoryNote.rounded": "Lekerekített, barátságos. Kisfiúknak is szól.",
  "font.categoryNote.condensed": "Szűk, magas. Nagy szöveget kis helyen is elbír.",
  "font.categoryNote.mono": "Minden karakter ugyanolyan széles. Adatokhoz, számokhoz.",

  "font.systemLabel": "Rendszer",
  "font.systemHint": "A készülék saját betűtípusa. Nem tölt le semmit, bárhogyan nézel rá.",
  "font.interHint": "Semleges, nagyon olvasható. Újságokhoz és felületekhez készült.",
  "font.montserratHint": "Széles, geometrikus betűk. Modern és szabad levegős.",
  "font.robotoHint": "Ismert, visszafogott. Jól olvasódik kis szövegen is.",
  "font.latoHint": "Enyhén emberi, meleg vonalú sans. Magyar írásképben otthonosan olvasható.",
  "font.playfairDisplayHint":
    "Kis karokkal írott, nagyon elegáns. Címeknek kiváló, kis szövegnek nem.",
  "font.loraHint": "Meleg, irodalmi serif. Kőbútoros könyvek hangulata.",
  "font.quicksandHint": "Lekerekített, puha. Barátságos, kevésbé hivatalos.",
  "font.sairaCondensedHint": "Keskeny és magas. Ugyanaz a szöveg feleakkora helyen elfér.",
  "font.jetBrainsMonoHint": "Minden betű ugyanolyan széles. Kódos, technikus érzés.",
  "font.handOffLabel": "Kikapcsolva",
  "font.handOffHint":
    "A jegyzeteid ugyanabban a betűtípusban jelennek meg, mint az app.",
  "font.dancingScriptHint":
    "Kézírásos betűtípus, csak a saját jegyzeteidre. Gombokra és menükre nem.",
  // The two retired families' one-time announcement, keyed by id — the toast is
  // the only reader-facing place their sentence appears. The suffix is the id,
  // not the name the user read: `RETIRED_FONT_LABELS` stays proper-noun memory.
  "font.retiredReason.manrope": "még mindig megtalálható a Google betűtípusai között",
  "font.retiredReason.plusJakartaSans": "még mindig megtalálható a Google betűtípusai között",

  // -- Round 17: the first five `.ts` modules of the second walk ---------------
  //
  // The `.tsx` sweep finished at round 16. This is the other queue — the one
  // `docs/i18n-sweep-list.md` measures and cannot see: five modules whose copy
  // a reader meets in a notification, in a preview list, on a pill, in a
  // settings field or in the answer a model hands back. The audit named these
  // candidates (weather, the reminder/notice wording, the food-AI wording, the
  // health-import labels, the onboarding tracker labels). This round claims
  // them; the generated list records what each round held.
  //
  // WHY THE VALUES ARE TRIMMED AND THE SPACES MOVED TO THE CALL SITE
  // The food-AI system prompt used to be five literals ending in spaces, and
  // `tests/lib/i18n.test.ts` rejects a catalogue value with a leading or
  // trailing space — correctly, because a space is invisible in a diff and
  // changes the sentence. So the parts are stored trimmed and the joiner puts
  // the single space back: the prompt the model receives is byte-identical.
  "weather.placeGps": "Helymeghatározás",

  // notifications.ts. The three messages a reader can pick, and the sentence
  // they chose is STORED as the string it was shown as — which is why these are
  // plain values and not keys resolved at the display site: the stored blob and
  // the shown sentence have to keep matching for the choice list to work.
  "reminder.messageMood": "Egy perc — hogyan érzed magad most? 🌱",
  "reminder.messageRecord": "Rögzítsd a mai napot, mielőtt elfelejted 💙",
  "reminder.messageTwoMinutes": "Két perc magadnak: hangulat és egy gondolat 🧭",
  // The notification TITLE is not here, on the same rule the app's own name
  // already follows: there is one `app.name`, and the dose reminder's `💊` is
  // glued on at the call site. A second copy of the product's name is exactly
  // the drift the catalogue exists to stop.

  // foodAi.ts. Two halves, and the difference matters: the PROMPT is what makes
  // the model answer in the reader's language, and the ERROR strings are what
  // the card shows when it cannot. Both are copy.
  "foodAi.promptIntro": "Te egy táplálkozási elemző vagy. A képen egy étkezés látható.",
  "foodAi.promptSchema": "Válaszolj kizárólag érvényes JSON-nal, ezzel a pontos mezőkészlettel:",
  "foodAi.promptFields":
    '{"calories": szám kcal, "protein": gramm, "carbs": gramm, "fat": gramm,',
  "foodAi.promptDescription":
    '"description": egy rövid magyar mondat arról, hogy mi látszik a képen}.',
  "foodAi.promptNotFood":
    "Ha nem élelmiszer látszik, minden szám legyen 0 és a description jelezze ezt.",
  "foodAi.promptQuestion": "Mi van a képen? Becsült tápértékek, magyar leírással.",
  // The macros line is composed at runtime out of three numbers, and it was a
  // template literal — the one kind of string the sweep's walk cannot see. It
  // is keyed here anyway: a module that is swept should not keep a sentence the
  // measurement happens to be blind to.
  "foodAi.macros": "Fehérje {protein} g · Szénhidrát {carbs} g · Zsír {fat} g",
  "foodAi.maskedKey": "{head}…•••• ({length} karakter)",
  "foodAi.errorNoKey": "Előbb add meg az OpenAI kulcsodat a Beállításokban.",
  "foodAi.errorInvalidKey": "Az OpenAI nem fogadta el a kulcsot — ellenőrizd a Beállításokban.",
  "foodAi.errorRateLimited": "Túl sok kérés rövid időn belül — próbáld újra egy perc múlva.",
  "foodAi.errorTimeout": "Időtúllépés — a kép elemzése túl sokáig tartott.",
  "foodAi.errorNetwork": "Hálózati hiba — most nem sikerült elemezni a képet.",
  "foodAi.errorBadResponse": "Az OpenAI válasza nem volt értelmezhető.",

  // healthImport/merge.ts. Four series names, PRINTED in the preview list beside
  // the counts. They stay tracker names — the card's own comment says the label
  // is data, not a sentence, and that is still true: the label is resolved once
  // here so the row's shape does not change, and `tests/batch9.test.ts` can keep
  // asserting on the same strings it always did.
  "healthImport.seriesHr": "Szívritmus",
  "healthImport.seriesSpo2": "Vértelítettség",
  "healthImport.seriesSleep": "Alvás (óra)",
  "healthImport.seriesSteps": "Lépésszám",

  // onboarding.ts. The four tracker pills the intro offers. Three carry an
  // accent and the sweep could see them; "Vitaminok" does not, and it is here
  // for that reason rather than in spite of it — a pill that stays Hungarian on
  // an English screen would be the one leftover the measurement cannot report.
  //
  // `Tünetek` names a FEATURE the reader switches on, and the clinical sweep
  // allows the noun and nothing else — the allowance for it is in
  // `tests/lib/i18n.test.ts`, beside the medication names, for the same reason.
  "onboarding.trackerSleep": "Alvás",
  "onboarding.trackerSymptoms": "Tünetek",
  "onboarding.trackerVitamins": "Vitaminok",
  "onboarding.trackerWeather": "Időjárás",

  // These two match a card title that is still a raw string in the component
  // (Phase 1 audit finding 2.3). They live here so the reorder panel says the
  // same words the card does; Phase 4 catalogues the cards and the two become
  // one key again.
  "settings.sections.lessons": "Mikro-lecke",
  // The Settings tab's eight groups. A group label is an EYEBROW above its
  // cards, and the rule this block has to keep is the one it once broke: a
  // label that repeats the title of the card directly below it is the reader
  // seeing one idea twice — and then clicking the wrong one, because only the
  // lower copy is a button. The two groups whose first card is named after the
  // whole area carry words of their own instead: "Menüsor" over the Navigáció
  // card, "Követett adatok" over Nyomonkövetés.
  "settings.groups.personal": "Személyes",
  "settings.groups.appearance": "Megjelenés",
  "settings.groups.navigation": "Menüsor",
  "settings.groups.tracking": "Követett adatok",
  "settings.groups.reminders": "Emlékeztetők",
  "settings.groups.security": "Biztonság",
  "settings.groups.data": "Mentés és export",
  "settings.groups.misc": "Egyéb",
  "settings.sections.reflection": "Heti reflektálás",
  "settings.sections.year": "Hangulat-naptár",
  "insights.year.summary": "Az év minden napja egy pixel",
  "settings.sections.lag": "Melyik tevékenység jött vissza később?",
  "settings.sections.quadrants": "Érzés és kontextus",
  "settings.sections.export": "Jelentés export",
  "settings.sections.stats": "Havi és éves statisztikák",
  "settings.sections.achievements": "Mérföldkövek",
  "settings.sections.grid": "Hatásmátrix",
  "settings.sections.patterns": "Minták a naplóidban",

  "settings.theme.title": "Téma",
  "settings.theme.fallback": "Világos",
  "settings.theme.note": "Válassz megjelenést — az egész app azonnal vált.",
  "settings.theme.group": "Téma kiválasztása",

  "settings.bg.title": "Háttérkép",
  "settings.bg.set": "Egyéni kép beállítva",
  "settings.bg.unset": "Nincs beállítva",
  "settings.bg.inkWarning":
    "A jelenlegi beállítások nem érik el a WCAG AA kontrasztot. Növeld a fátylat vagy csökkentsd a kártyaátlátszóságot.",
  "settings.bg.veilFloorNotice":
    "A háttérkép miatt a fátylat {value}%-ra emeltük, hogy a szöveg olvasható legyen.",

  "settings.nutrition.title": "Táplálkozási tippek",
  "settings.nutrition.summary": "Átláthatóság: mit írhat ki a napló?",
  "settings.nutrition.note":
    "A napló nem tanácsadó és nem diétaterv — csak visszatükrözi, amit rögzítettél. Két mondat jelenhet meg a Ma fülön, amikor egy szabály rájuk talál:",
  "settings.nutrition.example1": "Szép egyensúly. A zöldség és a fehérje jó kombináció.",
  "settings.nutrition.example2": "A gyorsétel néha belefér. Holnap próbálj egy zöldséges fogást is.",
  "settings.nutrition.weekNote":
    "A Heti összegzés kártya három napnál több kalóriabecslésből számol, és néha egy nyugodt megjegyzést jelenít meg:",

  "settings.sport.title": "Sportolási tippek",
  "settings.sport.summary": "Átláthatóság: mit írhat ki a mozgásbejegyzés?",
  "settings.sport.note":
    "A mozgásbejegyzés mellé legalább egy mondat jelenhet meg — elismerés, vagy egy pici következő lépés. Néhány a lehetségesek közül:",
  "settings.sport.example1": "30 perc futás – szép. A regeneráció is számít: igyál vizet.",
  "settings.sport.example2": "Séta 15 perc – minden mozgás számít.",
  "settings.sport.programsNote":
    "Az Edzésprogramok kártya a hét mozgás-bejegyzései alapján mutatja, melyik program illik hozzád — mindig csak ajánlásként.",

  "settings.trackers.title": "Nyomonkövetés",
  "settings.trackers.summary": "{on} / {total} csoport bekapcsolva",
  "settings.trackers.note": "Kapcsold be, mit szeretnél naponta rögzíteni a bejegyzésedhez.",

  "settings.modules.title": "Modulok",
  "settings.modules.summary": "{on} / 5 modul bekapcsolva",
  "settings.modules.note": "Csak az jelenjen meg, amire szükséged van — a többi rejtve marad.",
  "settings.modules.energyLabel": "Energia csúszka",
  "settings.modules.energyHint": "Napi energiiszint rögzítése a hangulat mellett.",
  "settings.modules.reflectionLabel": "Önreflexió",
  "settings.modules.reflectionHint": "Három rövid kérdés a nap végére.",
  "settings.modules.vitalsLabel": "Testi mutatók (alvás, pulzus, HRV)",
  "settings.modules.vitalsHint": "Okosórából vagy kézzel is beírhatod.",
  // These two name a feature the reader switches ON, which is why they are the
  // only settings copy the clinical-vocabulary sweep allows through — and why
  // the allowance is pinned to the word `gyógyszer` in the test rather than
  // being a blanket exemption for the two keys.
  "settings.modules.medsLabel": "Gyógyszer-emlékeztető",
  "settings.modules.medsHint": "Azok a gyógyszerek, amelyeket naponta kell bevenned.",
  "settings.modules.assessLabel": "Önreflexiós kérdőív",
  "settings.modules.assessHint": "Kétperces önértékelés az elmúlt két hétről.",

  "settings.mood.title": "Hangulat rögzítése",
  "settings.mood.summaryNew": "Új: 4-kvadráns",
  "settings.mood.summaryOld": "Régi: 5 fokozat",
  "settings.mood.note": "Két mód közül választhatsz. A régi bejegyzések mindkettő alatt megjelennek.",
  "settings.mood.group": "Hangulat rögzítésének módja",
  "settings.mood.newName": "Új: 4-kvadráns",
  "settings.mood.newDesc": "Hangulatomérő, érzés és kontextus, három lépésben.",
  "settings.mood.oldName": "Régi: 5 fokozat",
  "settings.mood.oldDesc": "A megszokott mosolygók egy sorban.",

  "settings.disable.title": "Kikapcsolod?",
  "settings.disable.message": "A mentett önértékelések törlődnek. Ez nem visszaállítható.",
  "settings.disable.confirm": "Kikapcsolás és törlés",
  "settings.disable.cancel": "Mégse",

  // The PIN lock card. Swept in the i18n sweep, round 1.
  //
  // `chooseHint` is the one worth reading twice. It used to be written as
  // `Válassz {PIN_MIN}–{PIN_MAX} számjegyet, …`, which the JSX parser sees as
  // THREE nodes — two pieces of text around an expression — and no extractor
  // can tell from the pieces that they are one sentence. Splitting them into
  // two keys would be the obvious move and it is wrong: the number belongs
  // between two Hungarian words, and a translator asked for one half gets a
  // fragment that cannot be reordered into a sentence. One key, two
  // placeholders, one word order the catalogue owns.
  //
  // The three errors and the three toasts are here for the same reason as the
  // visible labels: they are Hungarian the reader reads. They sit in function
  // bodies rather than in JSX, so the raw-literal extractor cannot see them —
  // which is a blind spot in the extractor, not a reason to leave them behind.
  "settings.pin.title": "Zárolás",
  "settings.pin.privacyNote":
    "A PIN a készülékeden belül marad, és a böngészőtárolóba csak egy titkosított lenyomat kerül — a PIN-t magát nem tároljuk. Ez kényelmi és adatvédelmi védelem a kíváncsiskodó ellen, nem titkosítás: a napló maga továbbra is olvasható marad a készülék tárolójában.",
  "settings.pin.start": "PIN beállítása",
  "settings.pin.chooseHint": "Válassz {min}–{max} számjegyet, ami nem ismétlődő és nem 1234-szerű sor.",
  "settings.pin.newPlaceholder": "Új PIN",
  "settings.pin.repeatPlaceholder": "PIN újra",
  "settings.pin.newRepeatPlaceholder": "Új PIN újra",
  "settings.pin.currentPlaceholder": "Jelenlegi PIN",
  "settings.pin.save": "Mentés",
  "settings.pin.cancel": "Mégse",
  "settings.pin.change": "PIN módosítása",
  "settings.pin.turnOff": "Kikapcsolás",
  "settings.pin.turnOffNote": "A kikapcsoláshoz add meg a jelenlegi PIN-ed.",
  "settings.pin.turnOffConfirm": "Zárolás kikapcsolása",
  "settings.pin.sessionNote":
    "Feloldás a munkamenet idejére szól: 15 percet használatlanul zárol vissza, illetve a következő napon. Elfelejtett PIN esetén nincs visszaút — csak az összes adat törlése, ezért előbb exportálj, ha meg akarod tartani a naplót.",
  "settings.pin.lengthError": "A PIN {min}–{max} számjegy legyen.",
  "settings.pin.weakError": "Ez a PIN túl könnyű kitalálni — válassz mást.",
  "settings.pin.mismatchError": "A két PIN nem egyezik.",
  "settings.pin.setDone": "PIN beállítva 🔒",
  "settings.pin.changedDone": "PIN megváltoztatva 🔒",
  "settings.pin.turnedOff": "Zárolás kikapcsolva.",

  "settings.voice.title": "Hangból bejegyzés",
  "settings.voice.badge": "Kísérleti",
  "settings.voice.summary": "Hangból hangulat, stressz, energia és tevékenység",
  "settings.voice.note":
    "Beszéld el a napod, és az app kinyeri belőle a hangulatot, stresszt, energiát és a tevékenységeket.",
  "settings.voice.noteLlm": "A felismerés mesterséges intelligenciával történik.",
  "settings.voice.noteOffline": "Kulcs nélkül egyszerű, offline szövegelemzést használ.",
  "settings.voice.emptyWarn": "Előbb diktálj vagy írj valamit.",
  "settings.voice.savedLlm": "Hang alapján frissítve (MI) 🎙️",
  "settings.voice.savedOffline": "Hang alapján frissítve (offline elemzés) 🎙️",
  "settings.voice.unsupported":
    "Ez a böngésző nem támogatja a beszédfelismerést. Írd be inkább szövegesen — a feldolgozás ugyanúgy működik.",
  "settings.voice.textAreaLabel": "A naplóbejegyzés szövege",
  "settings.voice.placeholder": "Írd le a napod egy mondatban…",
  "settings.voice.makeEntry": "Bejegyzés készítése",
  "settings.voice.start": "Beszéd indítása",
  "settings.voice.stop": "Leállítás",
  "settings.voice.vitalsNote": "A pulzust és az alvást is kinyeri, ha elmondod.",
  "settings.voice.resultLabel": "A felismert szöveg, szerkeszthető",
  "settings.voice.resultPlaceholder": "Itt jelenik meg, amit mondtál — szerkeszthető.",
  "settings.voice.makeEntryFrom": "Bejegyzés készítése belőle",
  "settings.voice.vitalsToggleLabel": "Testi mutatók modul",
  "settings.voice.vitalsToggleHint": "Pulzus és alvás kinyerése a szövegből.",

  "settings.data.title": "Adatok és mentés",
  "settings.data.badge": "Részletek",
  "settings.data.summary": "Export, import és minden adat törlése",
  "settings.data.csvExport": "CSV export",
  "settings.data.jsonExport": "JSON mentés",
  "settings.data.fileImport": "Fájl import",
  "settings.data.importNote":
    "Az import az azonos dátumú bejegyzéseket összevonja, így semmi nem vész el.",
  "settings.data.deleteAll": "Minden adat törlése",
  "settings.data.csvDone": "CSV letöltve 📤",
  "settings.data.jsonDone": "JSON mentés letöltve 📤",
  "settings.data.jsonRestoredWith":
    "JSON visszatöltve: {entries} bejegyzés, {assessments} önértékelés ✅",
  "settings.data.jsonRestored": "JSON visszatöltve: {entries} bejegyzés ✅",
  "settings.data.jsonNoEntries": "A JSON nem tartalmaz bejegyzéseket.",
  "settings.data.importNone": "Nem találtam importálható sort.",
  "settings.data.imported": "{count} bejegyzés importálva ✅",
  "settings.data.importFailed": "A fájl feldolgozása nem sikerült.",
  "settings.data.resetTitle": "Mindent törlöl?",
  "settings.data.resetMessage":
    "Az összes bejegyzés, cél és beállítás eltávolításra kerül erről a készülékről. Előtte érdemes JSON mentést csinálni.",
  "settings.data.resetConfirm": "Igen, minden törlése",
  "settings.data.resetDone": "Minden adat törölve.",

  "settings.privacy.title": "Adatvédelem",
  "settings.privacy.summary": "Minden adat ezen a készüléken marad.",
  "settings.privacy.local": "Minden adat a saját készülékeden tárolódik (böngésző-tároló).",
  "settings.privacy.noAccount": "Nincs fiók, nincs feltöltés — az app nem küld adatot sehova.",
  "settings.privacy.noAds": "Hirdetések és követés nincs.",
  "settings.privacy.export": "Bármikor exportálhatod CSV-ben, vagy törölhetsz mindent.",

  // ---- Today. The Ma fül, one namespace per card and per toolbox item. ----
  //
  // NOT HERE, for the same two reasons as the settings page. The strings this
  // page RENDERS but does not OWN: `SAFETY_NOTE`, the nutrition and sport tip
  // sentences and the weekly suggestion (`lib/nutritionTips`, `lib/sportTips`),
  // and `QUADRANT_LABELS` (`lib/quadrant`). And REGISTRIES: the mood levels
  // (`lib/mood`), the default activities (`lib/store`), and the twenty-odd
  // child components the toolbox mounts.
  //
  // THE SIX DAILY QUESTIONS ARE HERE, and the contrast with `lib/meditations`
  // is the whole argument. A practice is a hundred words of prose that would
  // need its own extraction, its own review and its own translator; a one-line
  // prompt the card asks once a day is chrome the same way a button label is.
  // Where the line falls is not "short or long" — it is "does this module own
  // it, and is it a control or a passage".
  "today.title": "Mai check-in",
  "today.hint": "Három lépés: hangulat, érzések, mentés.",
  "today.heroHint": "Ez a mai bejegyzésed helye. Válasz hangulatot, majd ments el — kevesebb, mint egy perc.",
  "today.saved": "Mentve. Szép munka! 🌱",
  "today.savedBadge": "✅ Elmentve",
  "today.save": "💾 Mentés",
  "today.moodRequired": "Előbb válassz hangulatot a mosolygók közül.",

  // The quadrant line's colour sits on the WORD and not on "Ma: ", so the
  // sentence cannot be one string: the label has to stay its own element. The
  // colon label is therefore its own key and the caller joins it with a space,
  // the same way the settings summaries join their clauses.
  "today.mood.title": "Hogy vagy ma?",
  "today.mood.summaryLabel": "Ma:",
  "today.mood.prompt": "Jelöld meg, hogyan érzed magad most — kevesebb, mint egy perc.",
  "today.mood.record": "Hangulat rögzítése",
  "today.mood.group": "Hangulat kiválasztása",

  // Two shapes for one sentence rather than a `{temp}` that is sometimes empty.
  // An empty placeholder renders "Időjárás betöltve ( °C).", which is a
  // different — and wrong — statement about the weather.
  "today.weather.denied": "A helymeghatározás nem engedélyezett — az időjárás kézzel is beírható.",
  "today.weather.unavailable": "Az időjárás most nem volt lekérhető — kézzel is beírhatod.",
  "today.weather.cached": "Időjárás a gyorsítótárból töltve.",
  "today.weather.cachedTemp": "Időjárás a gyorsítótárból töltve ({temp} °C).",
  "today.weather.live": "Időjárás betöltve.",
  "today.weather.liveTemp": "Időjárás betöltve ({temp} °C).",

  "today.slider.stress": "Stressz",
  "today.slider.energy": "Energia",
  "today.noteLabel": "Jegyzet (nem kötelező)",
  "today.notePlaceholder": "Mi történt ma? Miért érzed így magad?",

  "today.balance.title": "Egyensúly pontszám",
  "today.balance.high": "Kiegyensúlyozott napnak tűnik. 🌟",
  "today.balance.mid": "Elfogadható nap — apró lépések számítanak. 🌱",
  "today.balance.low": "Ma nehezebb nap volt. Ez is adat, holnap új lap. 💙",

  "today.activities.title": "Mi hatott rád ma?",
  "today.activities.note": "Ezekből számolja ki az app, mely tevékenységek emelik vagy rontják a hangulatod.",

  "today.weeklyNutrition.title": "Heti összegzés",
  "today.weeklyNutrition.summary": "{days} nap a héten, átlag {avg} kcal.",
  "today.weeklyNutrition.summarySafety": "Biztonsági jelzés aktív",

  "today.reflection.saved": "Reflexió elmentve 🧠",
  "today.reflection.title": "Rövid önreflexió",
  "today.reflection.feeling": "Mi volt a legerősebb érzésed ma?",
  "today.reflection.stressReason": "Mi okozta a legtöbb feszültséget?",
  "today.reflection.need": "Mire van szükséged most?",
  "today.reflection.save": "Reflexió mentése",
  "today.reflection.summaryFilled": "Kitöltve",
  "today.reflection.summaryEmpty": "Még nincs kitöltve",

  "today.vitals.saved": "Testi adatok elmentve 📈",
  "today.vitals.title": "Testi mutatók",
  "today.vitals.sleep": "Alvás (óra)",
  "today.vitals.restingHr": "Nyugalmi pulzus (ütem/perc)",
  "today.vitals.hrv": "HRV (ms)",
  "today.vitals.save": "Adatok mentése",
  "today.vitals.note": "Ezeket később rávetítjük az érzelmi görbére.",
  "today.vitals.summary": "{n}/3 érték rögzítve",

  // The one place besides the settings module where a Hungarian word is a
  // FEATURE NAME rather than prose about the reader. `tests/lib/i18n.test.ts`
  // pins which of these may carry it, and to which word.
  "today.meds.added": "Gyógyszer hozzáadva 💊",
  "today.meds.title": "Gyógyszerek",
  "today.meds.empty": "Add hozzá a gyógyszereid, és jelöld be, ha bevetted őket.",
  "today.meds.nameLabel": "Új gyógyszer neve",
  "today.meds.placeholderExample": "pl. D-vitamin",
  "today.meds.placeholderMore": "További gyógyszer…",
  "today.meds.add": "Hozzáadás",
  "today.meds.nextDose": "Következő adag: {time} · {name}",
  "today.meds.nextDoseWithAmount": "Következő adag: {time} · {name} — {amount}",
  "today.meds.summary": "{on}/{total} adag bevéve",

  "today.question.title": "Mai kérdés",
  "today.question.bestMoment": "Mi volt ma a legjobb pillanatod?",
  "today.question.stress": "Mi okozott ma feszültséget?",
  "today.question.need": "Mire lett volna nagyobb szükséged?",
  "today.question.learning": "Mit tanultál ma magadról?",
  "today.question.energy": "Mi adott ma energiát?",
  "today.question.gratitude": "Miért vagy hálás ma?",
  "today.question.answerLabel": "Válasz a napi kérdésre",
  "today.question.answerPlaceholder": "Írd le röviden…",
  "today.question.save": "Válasz mentése",
  "today.question.saved": "Válasz elmentve 💭",
  "today.question.summaryAnswered": "Megválaszolva",
  "today.question.summaryOpen": "Még nem megválaszolva",

  // ---- Journal. The Napló: calendar, filter, list, empty state. ----
  //
  // NOT HERE: `moodLabel` and `moodByLevel`'s label (`lib/mood`), and the four
  // date helpers — `WEEKDAYS_SHORT`, `monthLabel`, `formatHuman` and `todayISO`
  // (`lib/dates`). The last is worth naming: `formatHuman` is a FORMATTER, not
  // a word, and it is read by four surfaces. A locale changes its pattern; a
  // catalogue does not own its output.
  "journal.streak": "{streak} napos sorozat",
  "journal.streakNote": "Minden kitöltött nap közelebb visz önmagadhoz.",
  "journal.prevMonth": "Előző hónap",
  "journal.today": "Ma",
  "journal.nextMonth": "Következő hónap",
  "journal.calendarGroup": "Hangulat naptár",
  "journal.calendar.summary": "Egy hónap hangulatai, naponta egy négyzet",
  "journal.dayWithMood": "{date}: {mood}",
  "journal.dayEmpty": "{date}: nincs bejegyzés",
  "journal.search.title": "Keresés és szűrés",
  "journal.search.badge": "Részletek",
  "journal.search.placeholder": "Keresés a jegyzetekben, hangulatokban…",
  "journal.search.label": "Keresés a naplóban",
  "journal.search.filterGroup": "Szűrés hangulat szerint",
  "journal.filter.all": "Mind",
  "journal.filter.good": "Jó napok",
  "journal.filter.mid": "Közepesek",
  "journal.filter.rough": "Nehéz napok",
  "journal.results": "{found} találat a(z) {total} bejegyzésből.",
  "journal.entriesTitle": "Bejegyzések",
  "journal.empty.title": "Itt még üres a lap",
  "journal.empty.hint": "A Ma fülön rögzített bejegyzések gyűlnek össze itt.",
  "journal.empty.cta": "Ma fül megnyitása",

  // ---- Attachments. Swept in the i18n sweep, round 2. ----
  //
  // `attachments.photoAlt` is the one this group exists to be careful about.
  // The string `Csatolt fénykép` is written in TWO components — this picker's
  // thumbnail and `EntryDetail`'s — and they are byte-identical, verified with
  // `od -c` rather than by eye, because "they look the same" is exactly the
  // reasoning that produced six disagreeing regex counts earlier in this
  // project. So it gets ONE key, in a namespace both components can reach,
  // rather than an `attachments.picker.*` copy and an `entryDetail.*` twin
  // that would drift the first time a translator reworded one of them.
  //
  // The five errors are here for the same reason as the visible labels: they
  // are Hungarian the reader reads. They sit in catch blocks rather than in
  // JSX, so the raw-literal extractor cannot see them — a blind spot in the
  // extractor, not a reason to leave them behind.
  "attachments.title": "Csatolmányok",
  "attachments.photo": "Fénykép",
  "attachments.stopRecording": "Felvétel leállítása",
  "attachments.recordAudio": "Hang felvétele",
  "attachments.audioFile": "Hangfájl",
  "attachments.video": "Videó",
  "attachments.videoHint": "Rövid videó: max. 5 MB (kb. 10–30 másodperc).",
  "attachments.photoAlt": "Csatolt fénykép",
  "attachments.removeLabel": "Csatolmány törlése",
  "attachments.photoSaveError": "A fénykép mentése nem sikerült.",
  "attachments.videoSaveError": "A videó mentése nem sikerült.",
  "attachments.audioSaveError": "A hang mentése nem sikerült.",
  "attachments.recordUnsupported": "Ez a készülék/böngésző nem támogatja a hangrögzítést — válassz fájlt helyette.",
  "attachments.micFailed": "Nem sikerült elindítani a mikrofont.",

  // ---- The recording flow. Swept in the i18n sweep, round 4. ----
  //
  // This file is where the extractor's blind spots stack up. Of everything the
  // reader sees here, the measured count was thirteen; the rest is copy the
  // walk cannot reach, and all of it moves:
  //
  //  - ACCENT-FREE LABELS. `Energia ↑`, `Vissza`, `Kihagyom`, `Kontextus` and
  //    `Hogy vagy most?` carry no accented vowel, so a Hungarian test built on
  //    one never sees them.
  //  - TITLES IN AN EXPRESSION. The step headings are a ternary of string
  //    literals, not JSX text.
  //  - TEMPLATE LITERALS. Both aria strings and the announce message compose
  //    a value between Hungarian words, which is the same problem the mood
  //    sentence had in the PIN card: the number belongs where it belongs and
  //    the catalogue owns the word order.
  "recording.aria": "Hangulat rögzítése",
  "recording.meterAria": "Hangulatomérő",
  "recording.energyAxis": "Energia ↑",
  "recording.pleasantnessAxis": "Kellemesség →",
  "recording.step1Title": "Hogy vagy most?",
  "recording.step2Title": "Melyik érzés?",
  "recording.step3Title": "Mi a helyzet?",
  "recording.step1Sub": "Jelöld a pontot a térképen — energia fentről le, kellemesség balról jobbra.",
  "recording.step3Sub": "Bármi kihagyható — csak ami igaz.",
  "recording.liveStep1": "Hangulatomérő: energia {energy}, kellemesség {pleasantness}",
  "recording.liveStep2": "Érzés választás",
  "recording.liveStep3": "Kontextus",
  "recording.meterValueText": "Energia {energy} / 10, kellemesség {pleasantness} / 10, {quadrant}",
  "recording.emotionsAria": "Érzések",
  "recording.other": "Egyéb",
  "recording.customPlaceholder": "Saját szó…",
  "recording.add": "Hozzáadás",
  "recording.added": "Hozzáadva: {label}",
  "recording.intensityLabel": "Mennyire erősen? {value}/10",
  "recording.back": "Vissza",
  "recording.next": "Tovább",
  "recording.skip": "Kihagyom",
  "recording.saveWithoutContext": "Kontextus nélkül mentés",
  "recording.save": "Mentés",

  // ---- The micro-lesson card. Swept in the i18n sweep, round 5. ----
  //
  // `cardTitle` and `dismiss` carry no accented vowel, so the measured count
  // for this file was two — `Kész` and `Kipróbálom` — and it was the only
  // other button on the card.
  "lesson.cardTitle": "Mikro-lecke",
  "lesson.try": "Kipróbálom",
  "lesson.done": "Kész",
  "lesson.dismiss": "Kihagyom",

  // ---- The custom theme editor. Swept in the i18n sweep, round 5. ----
  //
  // `colorLabel` was a template literal wrapping a token label, so the
  // sentence a screen reader hears — the token's own name, then the words
  // around it — had no key at all. The wrapper is the part that needs
  // translating; the label inside it is data and stays whatever the registry
  // says it is.
  "theme.custom.title": "Saját téma szerkesztése",
  "theme.custom.note": "Módosítsd a színeket — minden változás azonnal látszik. A beállítás mentődik, és újraindítás után is megmarad.",
  "colorPicker.family.red": "Piros",
  "colorPicker.family.orange": "Narancs",
  "colorPicker.family.yellow": "Sárga",
  "colorPicker.family.green": "Zöld",
  "colorPicker.family.blue": "Kék",
  "colorPicker.family.purple": "Lila",
  "colorPicker.family.pink": "Rózsaszín",
  "colorPicker.family.brown": "Barna",
  "colorPicker.family.gray": "Szürke",
  "colorPicker.family.black": "Fekete",
  "colorPicker.shade.light": "világos",
  "colorPicker.shade.pale": "halvány",
  "colorPicker.shade.medium": "közepes",
  "colorPicker.shade.dark": "sötét",
  "colorPicker.shade.darkest": "nagyon sötét",
  "colorPicker.custom": "Egyéni szín",
  "theme.custom.colorLabel": "{label} színválasztó",
  "theme.custom.primary.bg": "Alap háttér színe",
  "theme.custom.primary.surface": "A kártyák színe",
  "theme.custom.primary.ink": "A szöveg színe",
  "theme.custom.primary.accent": "A kiemelő szín",
  "theme.custom.sectionMain": "Alapszínek",
  "theme.custom.sectionDetail": "Minden más szín",
  "theme.custom.previewTitle": "Előnézet",
  "theme.custom.previewBody": "Így fog kinézni a napló a választott színekkel.",
  "theme.custom.reset": "Visszaállítás",
  "theme.custom.save": "Mentés",
  "theme.custom.savedToast": "Saját téma elmentva 🎨",
  "theme.custom.resetToast": "Saját téma visszaállítva.",

  // ---- Insights. The Elemzés page. ----
  //
  // NOT HERE: the chart SERIES KEYS — `Hangulat`, `Stressz`, `Energia`,
  // `Alvás` — are `recharts` `dataKey` names, which are simultaneously object
  // property names. Translating one would mean translating a key in a record
  // the library reads, and the chart draws no legend, so the reader never sees
  // them. They are data wearing a Hungarian coat, not copy.
  //
  // `personalInsights()`'s sentences stay for the reason every other module's
  // prose does: they are `lib/analysis` output, not this view's words.
  "insights.title": "Elemzés",
  "insights.hintEmpty": "Itt jelennek meg a minták a bejegyzéseidből.",
  "insights.hintFull": "Minták és összefüggések a saját adataidból.",

  "insights.empty.title": "Még nincs adat",
  "insights.empty.hint": "Rögzíts néhány napot a Ma fülön, és három bejegyzés után megjelennek a felismerések.",
  "insights.empty.cta": "Ma fül megnyitása",

  "insights.week.title": "Ez a hét",
  "insights.week.summary": "Átlagos hangulat: {score} pont, {days} nap",
  "insights.week.avgMood": "átlag hangulat (0–100)",
  "insights.week.days": "naplózott nap",
  "insights.week.avgStress": "átlag stressz",
  "insights.week.avgEnergy": "átlag energia",

  "insights.trend.title": "Hogyan alakult?",
  "insights.trend.rangeGroup": "Időszak kiválasztása",
  "insights.trend.rangeWeek": "1 hét",
  "insights.trend.rangeMonth": "30 nap",
  "insights.trend.rangeAll": "Mind",
  "insights.trend.tooFew": "Legalább két bejegyzés kell a görbéhez ebben az időszakban.",
  "insights.trend.scaleNote": "Hangulat 0–100 pont; stressz és energia 10× skálán, hogy egy grafikonon látszódjanak.",
  "insights.trend.summary": "Hangulat, stressz és energia görbéje",

  "insights.correlation.title": "Mi hat rád?",
  "insights.correlation.summary": "Címkénkénti átlag és eltérés a többi naptól",
  "insights.correlation.empty": "Jelölj tevékenységeket a napi check-in-nél, és itt megmutatjuk, melyik emeli vagy rontja a hangulatod.",
  "insights.correlation.row": "{count} nap · átlag hangulat {avg}",
  "insights.correlation.ariaUp": "Átlagosan {delta} ponttal jobb hangulat",
  "insights.correlation.ariaDown": "Átlagosan {delta} ponttal rosszabb hangulat",

  "insights.more.title": "További felismerések",
  "insights.more.badge": "Részletek",
  // The one line in the app that names a diagnosis ON PURPOSE, in order to say
  // it is not offering one. See the allowance in `tests/lib/i18n.test.ts`: the
  // word is the disclaimer, and dropping it would make the sentence claim the
  // very thing it exists to disclaim.
  "insights.more.disclaimer":
    "Az elemzés a saját bejegyzéseidet vizsgálja — nem orvosi tanács és nem diagnózis.",

  // -- The toolbox ------------------------------------------------------------
  // Nine tools mounted in the Ma view's Eszköztár. What deliberately stays out
  // is written down rather than waved through, because both exclusions below
  // are content that a reviewer must be able to find and argue with:
  //
  //   WorkoutPrograms keeps its four PROGRAMS inline — names, days, exercises,
  //   nutrition tips. That is editorial content, the same shape as `lib/mood`'s
  //   labels or `lib/dates`' month names, so it stays a registry.
  //   ExperimentCard writes " bevált" into `verdict.note` on purpose. That
  //   string is persisted and never rendered; translating it would let a
  //   language switch rewrite what a reader already recorded.
  //
  // A word that JOINS two fragments (a suffix, a badge) carries no leading
  // space here, and the component supplies it. A catalogue value that trimmed
  // differs from itself is a bug the tests catch, and rightly: a translator
  // cannot tell a sentence from a fragment, and a fragment with padding baked
  // in survives into the next language where the padding is in the wrong
  // place. Where two fragments really do make one sentence, they are two whole
  // keys — see `tools.cbt.records` and `tools.cbt.recordsWithAvg`.

  // -- Onboarding and the self-assessment questionnaire -----------------------
  // The four-step welcome, and the consent screen, the runner, the result and
  // the past-results list of the PHQ-8 style questionnaire.
  //
  // Two things stay out, both for the same reason as above. `lib/assessments.ts`
  // owns the questions and their scoring, which is a registry; and
  // `SOURCE_ATTRIBUTION` — "PHQ-8 magyar fordítása, Pfizer/MAPI 2005" — is a
  // citation. A citation names the instrument it came from, and translating the
  // word "fordítása" would change what the source is rather than how it reads.

  "onboarding.done": "Kész! Minden nap egy koppintás 🌱",
  "onboarding.dialogLabel": "Üdvözlő bemutató",
  "onboarding.welcome": "Üdvözlünk a Belső Iránytűben!",
  "onboarding.intro": "Egy hangulatnapló, ami percek alatt megtanulja, mi emeli vagy rontja a közérzetedet. Minden adat a készülékeden marad.",
  "onboarding.hint": "Három gyors kérdés, és indulhatunk.",
  "onboarding.start": "Kezdjük!",
  "onboarding.trackerQuestion": "Mit szeretnél naponta rögzíteni?",
  "onboarding.trackerHint": "Később a Beállításokban bármikor válthatsz.",
  "onboarding.themeQuestion": "Milyen színben legyen?",
  "onboarding.themeHint": "Azonnal megtekinthető — később is változtatható.",
  "onboarding.themeLight": "Világos",
  "onboarding.themeDark": "Sötét",
  "onboarding.themeVibrant": "Üde",
  "onboarding.howTitle": "Naplózás három lépésben",
  "onboarding.howMood": "Válassz hangulatot",
  "onboarding.howTag": "Koppints rá, mi hatott rád (opcionális)",
  "onboarding.howSave": "Mentés — ennyi, kevesebb mint 5 másodperc",
  // One sentence split three ways because three glyphs sit inside it. The
  // spaces around them belong to the markup, not to the words.
  "onboarding.extrasPhoto": "Fotó,",
  "onboarding.extrasVoice": "hang és",
  "onboarding.extrasTrack": "napkövető a bejegyzésnél érhető el.",
  "onboarding.back": "Vissza",
  "onboarding.next": "Tovább",
  "onboarding.begin": "Kezdem a naplót",

  "assessment.consentTitle": "Mielőtt elkezded",
  // The one place in the app that says what the questionnaire is NOT, in the
  // sentence where it says it. Allowed in the test by the word, like the other
  // two refusals: delete "diagnózist" and it stops declining to diagnose.
  "assessment.consentBody":
    "A következő kérdőív egy önkitöltős lista az elmúlt két hétről. Nem vizsgál, nem szűr, és nem állít fel semmilyen diagnózist.\n\nAz eredményeid a készülékeden maradnak. Semmi nem kerül ki az eszközödről.\n\nAmit kapsz, az egy összegzés arról, hogyan érezted magad az elmúlt két hétben.\n\nBármikor kikapcsolhatod a Beállításokban. Kikapcsolás után a már megadott válaszaid is törlődnek.\n\nForrás: {source}",
  "assessment.consentConfirm": "Értem, bekapcsolom",
  "assessment.consentCancel": "Mégse",
  "assessment.moduleTitle": "Önreflexiós kérdőív",
  "assessment.moduleStart": "Kitöltöm",
  "assessment.summaryEmpty": "Nincs még bejegyzés",
  "assessment.summaryLast": "Legutóbb: {date} · {score} pont",
  "assessment.moduleBack": "Vissza a listához",
  "assessment.itemGroup": "{index}. kérdés",
  "assessment.logTitle": "Korábbi önértékelések",
  "assessment.logEmpty": "Még nincs kitöltött önértékelés.",
  "assessment.resultRetake": "Újra kitöltöm",
  "assessment.resultShowAll": "Válaszok elrejtése",
  "assessment.resultHideAll": "Válaszok megjelenítése",
  "assessment.notScored": "Ez a kérdés nem számít bele az összpontszámba.",
  "assessment.skip": "Kihagyom",
  "assessment.impactGroup": "Hatás",
  "assessment.save": "Mentés",
  "assessment.next": "Tovább",
  "assessment.exit": "Kilépés",
  "assessment.maxScore": "{max} pont a legmagasabb összpontszám.",

  // -- Encrypted backup, and the one line of the help surface ---------------
  // `BackupSettingsCard` is the whole encrypted-backup UI: the off state, the
  // two ways of unlocking it, the twelve-word recovery code, the restore panel
  // and every message it can report. The one constant that lived in
  // `lib/backup.ts` moved here too, because this card was its only reader —
  // a string with a single consumer is this surface's copy, not the module's.
  //
  // Two things nearby deliberately did NOT move, and the reason differs in each:
  // `RESOURCES`, `RESOURCES_TITLE` and `DISCLAIMER` in `lib/assessments.ts`
  // are shared by five surfaces including the PDF export, so moving them is a
  // cross-surface change rather than this card's business. `RESOURCES` is data
  // in any case — helpline names, numbers and hours — and a second list of
  // crisis numbers is the one duplication that could hurt somebody.
  //
  // `lib/backupKey.ts` used to sit in this list and no longer does. Its twelve
  // Hungarian strings are in this catalogue now, under `backup.passkey*` and
  // `backup.password*`. The reason it was ever defensible — that half of a
  // password-policy module is worse than none of it — turned out to be about
  // the key-derivation constants rather than the prose, and those never moved:
  // `PASSKEY_INFO`, `PASSWORD_INFO`, `RECOVERY_INFO` and `PRF_SALT` are bytes.

  "backup.cloudNote": "A mentés a te felhődbe kerül. Mi soha nem látjuk.",
  "backup.lossNote": "Ha elveszíted a jelszót vagy a 12 szavas kódot, a mentés visszaállíthatatlan.",
  "backup.notOurs": "Ez nem a Belső Iránytű titkosított mentése.",
  "backup.runningNote": "Az alkalmazás szól, ha ideje van. Háttérben nem futunk: új fájl csak akkor készül, ha az app nyitva van.",
  "backup.touchNote": "A böngésző nem tud kattintás nélkül fájlt írni, ezért a mentést mindig egy gomb indítja.",
  "backup.scopeNote": "A csatolmányok, a háttérkép, a megadott API-kulcs, a képernyőzár, a kártyaelrendezés és az értesítési nyomok nem kerülnek a mentésbe. Azok az eszközön maradnak.",
  "backup.openFailed": "A mentés nem nyitható meg ezzel a titokkal.",
  "backup.keyFailed": "A titkosító kulcs nem készíthető el. Próbáld újra.",
  "backup.fileFailed": "A mentés nem készíthető el. Próbáld újra.",
  "backup.mismatch": "A két jelszó nem egyezik.",
  "backup.noSource": "A fájl nem olvasható.",

  "backup.restored": "Visszaállítva: {entries} bejegyzés, {assessments} önértékelés, {keys} beállítás.",
  "backup.restoredSkipped": "Visszaállítva: {entries} bejegyzés, {assessments} önértékelés, {keys} beállítás. ({skipped} felhasználhatatlan adat.)",
  "backup.savedAtNever": "Még nem készült mentés.",
  "backup.lastSaved": "Utolsó mentés: {when}",
  "backup.saved": "Mentés készült: {when}",

  "backup.offIntro": "A naplódból egy titkosított fájl készül, amit bárhol tárolhatsz — Drive, iCloud, pendrive. A tartalmát csak a kulcsaid tudják feloldani.",
  "backup.summary": "Titkosított mentés a saját tárhelyeden",
  "backup.enable": "Titkosított mentés bekapcsolása",
  "backup.setupIntro": "Válaszd ki, mivel nyithatod meg a mentést. Két titok készül: amit most választasz, és egy 12 szavas kód, amit ezután egyszer látni fogsz.",
  "backup.setupPasskey": "Passkey létrehozása",
  "backup.noPrf": "Ez a böngésző nem ad titkosító kulcsot (PRF) passkey-jal, ezért jelszóval védjük a mentést.",
  "backup.passwordLabel": "Jelszó",
  "backup.passwordPlaceholder": "Legalább {min} karakter",
  "backup.passwordAgainLabel": "Jelszó újra",
  "backup.usePassword": "Jelszavas védelem",

  "backup.recoveryLead": "Írd le a 12 szót",
  "backup.recoveryRest": "— ez a mentés második kulcsa. Ha a passkey vagy a jelszó elfogy, csak ezzel tudod megnyitni.",
  "backup.ackLabel": "Leírtam, és biztos helyen tartom",
  "backup.ackHint": "Ez a kód csak egyszer jelenik meg. Ha elveszik, a fájl nem nyitható meg.",
  "backup.save": "Mentés",
  "backup.cancel": "Mégse",

  "backup.saveNow": "Mentés most",
  "backup.saveCount": "· {count} mentés eddig",
  "backup.savePasswordLabel": "Jelszó a mentéshez",
  "backup.saveWithPassword": "Mentés jelszóval",

  "backup.restoreFromFile": "Visszaállítás fájlból",
  "backup.fileLabel": "Fájl: {name}",
  "backup.fileFallback": "A kiválasztott fájl",
  "backup.openWith": "— ezekkel nyitható:",
  "backup.restorePasskey": "Visszaállítás passkey-jal",
  "backup.restorePasswordLabel": "A fájl jelszava",
  "backup.restorePassword": "Visszaállítás jelszóval",
  "backup.restoreCodeLabel": "A 12 szavas kód",
  "backup.restoreCodePlaceholder": "szó szó szó …",
  "backup.restoreCode": "Visszaállítás a kóddal",
  "backup.disable": "Felhőmentés kikapcsolása",
  "backup.back": "Vissza",

  "backup.cancelled": "A mentés megszakadt, így nem készült fájl.",
  "backup.ready": "Titkosított mentés kész ✅",
  "backup.savedNotify": "Mentés készült ✅",
  "backup.restoredNotify": "Visszaállítva ✅",
  "backup.disabled": "A felhőmentés ki van kapcsolva. A fájl változatlanul megmaradt.",

  // ---- The passkey layer's own words, out of `lib/backupKey.ts`. ----
  //
  // The eleven strings below used to be module constants, which is why the
  // catalogue could not reach them: they are returned from inside a WebAuthn
  // ceremony and a key-derivation check, not rendered by a card. They are the
  // words the reader sees when the passkey path fails, so they belong here on
  // the same terms as every other message in this namespace.
  //
  // What did NOT move, deliberately: PASSKEY_INFO, PASSWORD_INFO,
  // RECOVERY_INFO and PRF_SALT are HKDF context strings and key material
  // labels, not prose. Translating them would change derived keys or show an
  // authenticator a translated relying-party name on one locale only.
  //
  // `passkeyRpName` is the exception that proves the rule: it IS prose, it IS
  // shown by the browser and the OS credential manager, and it is the product
  // name rather than a message — so it is keyed here but kept identical to the
  // app's own title.
  "backup.passkeyRpName": "Belső Iránytű",
  "backup.passkeyUnsupported": "Ez a böngésző nem támogatja a passkey-alapú mentést. Válaszd a jelszavas védelmet.",
  "backup.passkeyNoPrf": "Ez a hitelesítő nem ad titkosítási kulcsot (PRF). Válassz jelszavas védelmet.",
  "backup.passkeyCreateFailed": "A passkey létrehozása nem sikerült.",
  "backup.passkeyInvalidId": "Érvénytelen passkey-azonosító.",
  "backup.passkeyAborted": "A passkey-kérés megszakadt vagy nem engedélyezték. Próbáld újra.",
  "backup.passkeyUnsupportedDevice": "Ez az eszköz nem támogatja a passkey-t.",
  "backup.passkeyAlreadyRegistered": "Ez a passkey már regisztrálva van ezen az eszközön.",
  "backup.passkeyInsecureContext": "Biztonsági hiba: a mentés csak HTTPS-en vagy localhoston működik.",
  "backup.passkeyFailed": "A passkey-művelet nem sikerült. Próbáld újra.",
  "backup.passwordTooSimple": "Ez a jelszó túl könnyű kitalálni — válassz mást.",
  // The twelfth, and the only one with a placeholder: the floor itself is
  // `PASSWORD_MIN_LENGTH`, so the number is interpolated rather than written
  // down here. `backup.passwordPlaceholder` is a different string — the card's
  // field placeholder — and the two must not be merged into one.
  "backup.passwordTooShort": "A jelszó legalább {min} karakter legyen.",

  "backup.title": "Titkosított felhőmentés",  // The only sentence CrisisCard owns. Everything else it shows — the numbers,
  // the hours,  the heading, the disclaimer — is imported, so there was nothing
  // here to take.
  //
  // It no longer says "the disclaimer" is imported: two more sentences came with
  // it. FIVE surfaces read these two — CrisisCard, the PHQ-8 result, the
  // assessment consent, the entry-detail footer and the PDF export footer — which
  // is exactly why they sat as constants in `lib/assessments.ts` for so long, and
  // also exactly why they cannot stay there: a catalogue that cannot name them
  // is a catalogue that cannot translate them, and one that cannot translate them
  // is one translation away from five drifting copies.
  //
  // `assessments.ts` still exports `DISCLAIMER` and `RESOURCES_TITLE`, now derived
  // from these keys. Every existing import keeps working and keeps reading the
  // same value; what changed is that there is now ONE owner of the wording, and
  // it is the same place that owns every other sentence in the app.
  //
  // `RESOURCES` itself did NOT move and must not: it is data — helpline names,
  // numbers, hours — and a second list of crisis numbers is the one duplication
  // that could hurt somebody.
  "crisis.resourcesTitle": "Ha segítségre van szükséged",
  "crisis.disclaimer": "Ez nem diagnózis, hanem összegzés arról, amit írtál be. Ha valami aggaszt, érdemes szakemberrel beszélni.",

  "crisis.helpNote": "Ingyenes és éjjel-nappal elérhető. Nem kell előtte bejelentkezned.",

  "tools.activity.title": "Saját tevékenység",
  "tools.activity.intro": "Készíts saját címkét — megjelenik a napi tevékenységek között.",
  "tools.activity.iconGroup": "Ikon választása",
  "tools.activity.nameLabel": "Új tevékenység neve",
  "tools.activity.placeholder": "Név, pl. Kertészkedés",
  "tools.activity.add": "Hozzáadás",
  "tools.activity.added": "Hozzáadva: {icon} {label}",
  "tools.activity.dupOrLimit": "Ilyen címke már létezik, vagy elérted a maximumot (24).",
  "tools.activity.needName": "Adj meg egy nevet a tevékenységnek.",
  "tools.activity.removeLabel": "{label} törlése",
  "tools.activity.summary": "{n} saját címke",
  "tools.activity.summaryEmpty": "Nincs saját címke",

  "tools.breathing.title": "Légzésgyakorlat",
  "tools.breathing.summary": "Vezetett légzőgyakorlat: gyors és teljes mód",
  "tools.breathing.modeGroup": "Légzés módja",
  "tools.breathing.quick": "Gyors mód",
  "tools.breathing.full": "Minta választás",
  "tools.breathing.patternGroup": "Légzésminta",
  "tools.breathing.custom": "Saját",
  "tools.breathing.inLabel": "Belégzés (mp)",
  "tools.breathing.holdLabel": "Benttartás (mp)",
  "tools.breathing.outLabel": "Kilégzés (mp)",
  "tools.breathing.apply": "Minta beállítása",
  "tools.breathing.roundDone": "Teljes kör megtétele: {count}",
  "tools.breathing.length": "Hossz: {seconds} mp",
  "tools.breathing.finish": "Befejezés",
  "tools.breathing.start": "Indítás",
  "tools.breathing.pause": "Megáll",
  "tools.breathing.resume": "Folytatás",

  "tools.habits.title": "Szokások és sorozatok",
  "tools.habits.intro": "Pipáld naponta — a 🔥 sorozat azt mutatja, hány napja megszakítás nélkül csinálod.",
  "tools.habits.streakDays": "🔥 {days} nap",
  "tools.habits.streakStart": "kezdj ma!",
  "tools.habits.weeklySuffix": "/7 e héten",
  "tools.habits.weekLabel": "{label} utóbbi 7 napja",
  "tools.habits.iconGroup": "Ikon",
  "tools.habits.nameLabel": "Új szokás neve",
  "tools.habits.placeholder": "Új szokás, pl. Esti olvasás",
  "tools.habits.add": "Hozzáadás",
  "tools.habits.added": "Hozzáadva: {icon} {label}",
  "tools.habits.dupOrLimit": "Ilyen már van, vagy elérted a limitet ({limit}).",
  "tools.habits.needName": "Adj nevet a szokásnak.",
  "tools.habits.removeLabel": "{label} törlése",

  "tools.cbt.title": "CBT gondolatrecord",
  "tools.cbt.summary": "Hét lépéses gondolatrecord, lépésről lépésre",
  "tools.cbt.stepSituation": "Mi történt? (helyzet)",
  "tools.cbt.stepThought": "Mi jutott eszedbe? (automatikus gondolat)",
  "tools.cbt.stepEmotion": "Mit éreztél, és mennyire volt nyomasztó?",
  "tools.cbt.stepFor": "Mi szól a gondolat MELLETTE?",
  "tools.cbt.stepAgainst": "Mi szól ellene?",
  "tools.cbt.stepBalanced": "Mi a kiegyensúlyozott gondolat?",
  "tools.cbt.stepAfter": "Mennyire nyomasztó most?",
  "tools.cbt.progressGroup": "Haladás",
  "tools.cbt.situationLabel": "Helyzet",
  "tools.cbt.situationPlaceholder": "Mi volt a helyzet? Hol, mikor, kivel?",
  "tools.cbt.thoughtLabel": "Automatikus gondolat",
  "tools.cbt.thoughtPlaceholder": "Mi futott át a fejedben?",
  "tools.cbt.emotionLabel": "Érzés neve",
  "tools.cbt.emotionPlaceholder": "Érzés, pl. szorongás",
  "tools.cbt.distressBefore": "Nyomasztóság:",
  "tools.cbt.forLabel": "A gondolatot alátámasztó tények",
  "tools.cbt.forPlaceholder": "Tények, amik alátámasztják a gondolatot…",
  "tools.cbt.againstLabel": "A gondolatot ellensúlyozó tények",
  "tools.cbt.againstPlaceholder": "Tények, amik ellensúlyozzák…",
  "tools.cbt.balancedLabel": "Kiegyensúlyozott gondolat",
  "tools.cbt.balancedPlaceholder": "Hogyan fogalmaznád meg igazságosan, mindkét oldalt látva?",
  "tools.cbt.distressAfter": "Nyomasztóság most:",
  "tools.cbt.shiftBefore": "Előtte {before} → most {after}.",
  "tools.cbt.shiftBetter": "Ennyivel könnyebb: {points} pont. 💪",
  "tools.cbt.shiftSame": "Néha a gondolat makacs — az is eredmény, hogy megnézted.",
  "tools.cbt.next": "Tovább",
  "tools.cbt.back": "Vissza",
  "tools.cbt.save": "Mentés",
  "tools.cbt.records": "{count} mentett record",
  "tools.cbt.recordsWithAvg": "{count} mentett record — átlagos könnyebbülés: {avg} pont",
  "tools.cbt.deleteLabel": "Record törlése",

  "tools.experiment.title": "Saját kísérlet",
  "tools.experiment.intro": "Egy dolgot próbálj ki három napig, és minden este egy számot adj neki. A napok száma rögzített: nem hosszabbítható.",
  "tools.experiment.whatLabel": "Mit próbálsz ki?",
  "tools.experiment.whatPlaceholder": "pl. mindig 10 percet korábban feküdöm",
  "tools.experiment.whyLabel": "Miért gondolod, hogy segít? (nem kötelező)",
  "tools.experiment.start": "Három napos kísérlet indítása",
  "tools.experiment.historyTitle": "Befejezett kísérletek",
  "tools.experiment.ratingQuestion": "Ma hogy érezted magad? ({min}–{max})",
  "tools.experiment.ratingGroup": "Hányasra értékeled ma ({min}–{max})",
  "tools.experiment.noteLabel": "Jegyzet (nem kötelező)",
  "tools.experiment.notePlaceholder": "pl. többet mozogtam ma",
  "tools.experiment.savedToday": "Mai értékelés elmentve",
  "tools.experiment.avgSuffix": "— eddigi átlag: {avg}",
  "tools.experiment.workedButton": "Bevált",
  "tools.experiment.notWorkedButton": "Nem bevált",
  "tools.experiment.abandon": "Abbahagyom",
  "tools.experiment.verdictYes": "bevált",
  "tools.experiment.verdictNo": "nem bevált",
  "tools.experiment.deleteLabel": "Kísérlet törlése: {what}",

  "tools.library.title": "Könyvtár",
  // The second sentence declines to diagnose, exactly as `insights.more.disclaimer`
  // does; see the allowance in `tests/lib/i18n.test.ts`.
  "tools.library.intro": "Rövid, hétköznapi szövegek arról, ami a naplóban felmerül. Nem diagnózis, csak magyarázat — ha valami aggaszt, érdemes szakemberrel beszélni.",
  "tools.library.takeawayLabel": "Ami számít:",
  "tools.library.actionLabel": "Próbáld ki:",
  "tools.library.backToArticle": "← Vissza",
  "tools.library.backToTopics": "← Témák",
  "tools.library.readMark": "Elolvastam",
  "tools.library.readDone": "Elolvastam ✓",

  "tools.gratitude.title": "Hálanapló",
  "tools.gratitude.intro": "Naponta egy gondolat: mire vagy ma hálás? A kis dolgok is számítanak.",
  "tools.gratitude.textareaLabel": "Mire vagy hálás ma?",
  "tools.gratitude.placeholder": "Ma hálás vagyok…",
  "tools.gratitude.saveButton": "Mai hála mentése",
  "tools.gratitude.total": "Összesen {count} bejegyzés",
  "tools.gratitude.saved": "Hála rögzítve 💛",
  "tools.gratitude.alreadyToday": "Mai nap már rögzítve — holnap is várunk! 🌅",
  "tools.gratitude.needText": "Írj egy rövid mondatot arról, amiért hálás vagy.",
  "tools.gratitude.deleteLabel": "Hála bejegyzés törlése",

  "tools.foodPhoto.title": "Étkezés fotóból",
  "tools.foodPhoto.summary": "Fotó alapú becslés — te nézed át, mielőtt bármit beír.",
  "tools.foodPhoto.explainer": "Fotó az étkezésről, és az AI becsült tápértéket ad — te nézed át, mielőtt bármi a naplóba kerül.",
  "tools.foodPhoto.captureLabel": "Étkezés megfotózása és elemzése",
  "tools.foodPhoto.analyzing": "Elemzés…",
  "tools.foodPhoto.takePhoto": "Fotó készítése",
  "tools.foodPhoto.manualStillWorks": "A kézi mezők változatlanul működnek.",
  "tools.foodPhoto.error": "A kép feldolgozása nem sikerült — próbáld újra.",
  "tools.foodPhoto.written": "Becsült értékek beírva — bármikor módosíthatod.",
  "tools.foodPhoto.calories": "Kalória (becsült)",
  "tools.foodPhoto.protein": "Fehérje g (becsült)",
  "tools.foodPhoto.carb": "Szénhidrát g (becsült)",
  "tools.foodPhoto.fat": "Zsír g (becsült)",
  "tools.foodPhoto.writeToJournal": "Beírás a naplóba",
  "tools.foodPhoto.discard": "Eldobás",

  "tools.workouts.title": "Edzésprogramok",
  "tools.workouts.intro": "Négy kész program. Válassz egyet, és akkor kezdd, amikor neked jó — a naplózási szokás mellé való, nem a helyére.",
  "tools.workouts.programTitle": "{label} — {days} nap",
  "tools.workouts.recommendedBadge": "· Ma ez ajánlott",
  "tools.workouts.nutritionTitle": "Táplálkozási tippek",
  // Names a chronic illness in order to hand the decision to a doctor, which is
  // the same refusal the other disclaimer makes; allowed in the test by word.
  "tools.workouts.disclaimer": "Ezek általános életmód-javaslatok — nem orvosi tanács. Ha sérülésed van, krónikus betegséged, vagy terhes vagy, előbb kérdezd meg orvosodat.",
  "tools.workouts.safetyNote":
    "Ha éles fájdalmat, mellkasi nyomást, szédülést vagy légszomjat érzel, állj le — és ha nem múlik, kérj segítséget. Kezdőként az első heteket vedd könnyebben.",

  // ---- The tools tab (Batch 14) ---------------------------------------------
  // The tab's own NAME, and it lives here rather than in the Today block it was
  // born in. `today.toolbox.title` was an accurate name while the toolbox was a
  // drawer at the bottom of the Ma fül; after Batch 14 it named a tab that is
  // not the day's, and the reader's name for that tab is this one. The key
  // moved with the thing it names — a name is the tab's copy, not the day's.
  //
  // The five titles below are the five drawers, and they name the WORK rather
  // than the components: what a reader is doing, not which card they open.
  "tools.title": "Felfedezés",
  "tools.hint": "Gyakorlatok, önismeret és egészség — egy helyen, a nap mellől kivéve.",
  "tools.therapy.title": "Terápia",
  "tools.self.title": "Önismeret",
  "tools.health.title": "Egészség",
  "tools.experiments.title": "Kísérletek",
  // The fifth drawer, and its name is NOT the library's name. "Oktatás" reads
  // like a school subject next to four drawers that name what a reader DOES,
  // and it stopped describing the drawer the day the name above it became
  // Felfedezés — a tab called discovery holding a drawer called education says
  // the same thing twice in two registers. "Tanulás" is the activity, it covers
  // the library AND the micro-lessons the recording flow hands out, and the
  // drawer's own id stays `education`: ids are the arrangement's vocabulary, and
  // a stored list that names one is not a label.
  "tools.learning.title": "Tanulás",
  // ---- The meal log and the allergen list (Batch 15) ------------------------
  // The food NAMES are content and live in `lib/nutrition` beside their numbers,
  // the way the tracker labels live in `lib/trackers`. What is here is chrome:
  // the four meal names, the ten allergen names a switch is labelled with, and
  // the sentences the two cards say. `allergen.*` is a namespace of its own
  // rather than `settings.allergen.*` because the warning the meal card prints
  // names the same ten words, and one list with two readers is the point.
  "nutrition.meal.breakfast": "Reggeli",
  "nutrition.meal.lunch": "Ebéd",
  "nutrition.meal.dinner": "Vacsora",
  "nutrition.meal.snack": "Snack",
  "nutrition.allergen.peanut": "Mogyoró",
  "nutrition.allergen.nut": "Dió",
  "nutrition.allergen.milk": "Tej",
  "nutrition.allergen.egg": "Tojás",
  "nutrition.allergen.gluten": "Glutén",
  "nutrition.allergen.soy": "Szója",
  "nutrition.allergen.fish": "Hal",
  "nutrition.allergen.shellfish": "Rákfélék",
  "nutrition.allergen.sesame": "Szezám",
  "nutrition.allergen.sulphite": "Szulfitok",
  "tools.nutrition.title": "Étkezés napló",
  "tools.nutrition.summary":
    "{kcal} kcal · {protein} g fehérje · {carb} g szénhidrát · {fat} g zsír",
  "tools.nutrition.intro":
    "Írd fel, mit ettél ma. A lista a saját gépeden marad, és semmit nem küld el.",
  "tools.nutrition.mealGroup": "Melyik étkezés",
  "tools.nutrition.foodLabel": "Étel",
  "tools.nutrition.foodPlaceholder": "Írd be az étel nevét…",
  "tools.nutrition.foodAutocomplete": "Ételjavaslatok",
  "tools.nutrition.servingsLabel": "Mennyiség — {name}",
  "tools.nutrition.add": "Hozzáad",
  "tools.nutrition.portionLine": "Egy adag: {portion}, {kcal} kcal.",
  "tools.nutrition.customPortion":
    "A tápértékét nem ismerjük, ezért csak a neve kerül a listára.",
  "tools.nutrition.allergyWarn": "Allergia: {allergens} — {name}",
  "tools.nutrition.allergyMark": "Allergia: {allergens}",
  "tools.nutrition.allergyNote":
    "A figyelmeztetés az étel NEVÉRE illeszkedik, nem a valódi összetevőkre — egy étteremben nem tudhatja, mi került a tányérra.",
  "tools.nutrition.allergyHint":
    "Allergiáidat a Beállítások Étrend és allergiák kártyáján jelölheted meg.",
  "tools.nutrition.mealKcal": "{kcal} kcal",
  "tools.nutrition.mealEmpty": "–",
  "tools.nutrition.itemKcal": "{kcal} kcal",
  "tools.nutrition.removeLabel": "{name} törlése a listáról",
  "tools.nutrition.empty": "Ma még nincs tétel a listán.",
  "tools.nutrition.customNote":
    "A saját ételek csak névvel kerülnek a listára, ezért a fenti összesítés nem tartalmazza őket.",
  "tools.nutrition.forgetCustom": "{name} elfelejtése",
  "tools.nutrition.note":
    "A kalória- és makróértékek tájékoztató becslések egy adagra, nem mérések.",
  "tools.nutrition.dietTitle": "Étrend-típus",
  "tools.nutrition.dietHint": "Válaszd ki, ami rád illik — bármikor átválthatsz.",
  "tools.nutrition.dietNone": "Még nincs kiválasztva étrend.",
  "tools.nutrition.dietActive": "Aktív étrend: {diet}",
  "tools.nutrition.dietClear": "Kiválasztás törlése",
  "tools.nutrition.diet.paleo": "Paleo",
  "tools.nutrition.diet.keto": "Keto",
  "tools.nutrition.diet.mediterranean": "Mediterrán",
  "tools.nutrition.diet.vegetarian": "Vegetáriánus",
  "tools.nutrition.diet.vegan": "Vegán",
  "tools.nutrition.diet.raw": "Nyers (raw)",
  "tools.nutrition.diet.low-carb": "Alacsony szénhidrát",
  "tools.nutrition.diet.high-protein": "Magas fehérje",
  "tools.nutrition.diet.gluten-free": "Gluténmentes",
  "tools.nutrition.diet.lactose-free": "Laktózmentes",
  "tools.nutrition.diet.pescatarian": "Peszkatariánus",
  "tools.nutrition.diet.other": "Egyéb",
  "tools.nutrition.dietNote":
    "Az étrendválasztás a te döntésed, nem orvosi tanács. Ha egészségügyi okból követed, egyeztesd orvossal vagy dietetikussal.",
  "tools.nutrition.menuTitle": "Heti menü",
  "tools.nutrition.menuHint": "Hét nap a választott étrendből — javaslat, nem előírás.",
  "tools.nutrition.menuNone": "Válassz étrendet fent, és itt megjelenik a heti menü.",
  "tools.nutrition.menuOther": "Az „Egyéb” étrendhez nincs kész menü — ez a lista nem ismeri a szabályait.",
  "tools.nutrition.menuAdd": "Ez legyen a mai nap",
  "tools.nutrition.menuNote": "A menü a fenti ételekből áll össze, ugyanazokkal a becslésekkel.",
  "tools.nutrition.menuSkipped": "Allergia miatt kihagyva: {items}",
  "settings.allergies.title": "Étrend és allergiák",
  "settings.allergies.summary": "{on} / {total} allergén megjelölve",
  "settings.allergies.off": "Nincs megjelölt allergén",
  "settings.allergies.note":
    "Amit itt megjelölsz, arra az étkezés napló figyelmeztet, ha egy étel neve tartalmazza.",
  "settings.allergies.legend": "Allergének",
  "settings.allergies.limit":
    "Ez a lista emlékeztető, nem orvosi tanács: a figyelmeztetést mindig ellenőrizd magad is.",

  // ---- The workout plans and the log (Batch 15) ----------------------------
  // The templates' own content — names, day labels, exercise names, doses —
  // lives in `lib/fitness` beside the rule that adopts them, like the editorial
  // programs in `WorkoutPrograms`. What is here is the card's chrome.
  "tools.fitness.title": "Edzéstervek és napló",
  "tools.fitness.summary": "{plans} terv · {sessions} edzés a naplóban",
  "tools.fitness.intro":
    "Válassz kész tervet, vagy építs sajátot napokból és gyakorlatokból. Minden a saját gépeden marad.",
  "tools.fitness.templates": "Ajánlott tervek",
  "tools.fitness.adopt": "Kiválaszt",
  "tools.fitness.adoptLabel": "{name} kiválasztása saját tervként",
  "tools.fitness.templateDays": "{days} nap",
  "tools.fitness.myPlans": "Saját terveid",
  "tools.fitness.noPlans": "Még nincs saját terved — válassz egy ajánlott tervet, vagy hozz létre újat.",
  "tools.fitness.planDays": "{days} nap",
  "tools.fitness.deletePlanLabel": "{name} törlése",
  "tools.fitness.newPlanLabel": "Új terv neve",
  "tools.fitness.newPlanPlaceholder": "pl. Reggeli kör",
  "tools.fitness.create": "Létrehoz",
  "tools.fitness.emptyPlan": "Ehhez a tervhez még nincs nap.",
  "tools.fitness.addDay": "Nap hozzáadása",
  "tools.fitness.newDayLabel": "Új nap neve",
  "tools.fitness.newDayPlaceholder": "pl. A nap — egész test",
  "tools.fitness.removeDayLabel": "{name} nap törlése",
  "tools.fitness.logDay": "Mai naplózás",
  "tools.fitness.logDayLabel": "{name} naplózása mára",
  "tools.fitness.exerciseName": "Gyakorlat neve",
  "tools.fitness.exercisePlaceholder": "pl. Guggolás",
  "tools.fitness.sets": "Sorozat",
  "tools.fitness.reps": "Ismétlés",
  "tools.fitness.weight": "Súly kg-ban",
  "tools.fitness.addExercise": "Gyakorlat hozzáadása",
  "tools.fitness.removeExerciseLabel": "{name} törlése a napból",
  "tools.fitness.progressLine": "{name}: {sessions} edzés, legjobb {best} kg",
  "tools.fitness.progressBody": "{name}: {sessions} edzés testsúllyal",
  "tools.fitness.progressReps": "{name}: {sessions} edzés, legjobb {best} ismétlés",
  "tools.fitness.progressHold": "{name}: {sessions} edzés, legjobb {best} másodperc tartás",
  "tools.fitness.nextWeight": "következőre {kg} kg",
  "tools.fitness.nextReps": "következőre {reps} ismétlés",
  "tools.fitness.nextHold": "következőre {seconds} másodperc",
  "tools.fitness.recent": "Legutóbbi edzések",
  "tools.fitness.type.strength": "Erő",
  "tools.fitness.type.cardio": "Kardió",
  "tools.fitness.type.mobility": "Mobilitás",
  "tools.fitness.type.hiit": "HIIT",
  "tools.fitness.type.yoga": "Jóga",
  "tools.fitness.type.walking": "Séta",
  "tools.fitness.restDay": "Pihenőnap",
  "tools.fitness.markRest": "Pihenőnapnak jelölöm",
  "tools.fitness.unmarkRest": "Mégis edzésnap",
  "tools.fitness.restNote": "Pihenőnap — nincs mit naplózni. A nap a tervben marad.",
  "tools.fitness.suggestTitle": "Mai javaslat",
  "tools.fitness.suggestNone": "Nincs mit javasolni — válassz egy sablont vagy építs egy tervet, és itt megjelenik a következő kör.",
  "tools.fitness.suggestFirst": "Ez lenne az első kör a naplóban: {plan} — {day}.",
  "tools.fitness.suggestTrain": "Legutóbb {days} napja edzettél. A következő kör: {plan} — {day}.",
  "tools.fitness.suggestRest": "Ma már feljegyeztél egy edzést — pihenj. A következő kör: {plan} — {day}.",
  "tools.fitness.progressTitle": "Haladás gyakorlatonként",
  "tools.fitness.progressNone": "Jegyezz fel edzéseket, és itt látszik majd, hogyan haladsz az egyes gyakorlatokkal.",
  "tools.fitness.chartTitle": "Haladás: {name}",
  "tools.fitness.chartNoteKg": "A grafikon a feljegyzett súlyokat mutatja edzésenként.",
  "tools.fitness.chartNoteReps": "A grafikon a feljegyzett ismétléseket (vagy másodperceket) mutatja edzésenként.",
  "tools.fitness.noLog": "Még nincs feljegyzett edzés.",
  "tools.fitness.exerciseSuffix": "{n} gyakorlat",
  "tools.fitness.volume": "{volume} kg volumen",
  "tools.fitness.removeLogLabel": "{name} ({date}) törlése a naplóból",
  "tools.fitness.planNote":
    "A tervek mozdulatsorok, nem személyre szabott edzésterv. Ha bizonytalan vagy, kérdezz szakembert.",
  // ---- The seven-question check-in (Batch 14) -----------------------------
  // It lives in the Egészség drawer and it is NOT the questionnaire, so it gets
  // its own namespace rather than borrowing `assessment.*`. The two things it
  // does share are deliberate and named where they happen: the four response
  // options and the maximum-score sentence are the questionnaire's keys and its
  // constants, imported rather than copied, because the scale IS the same
  // scale and a second copy of "21 pont a legmagasabb összpontszám" is a second
  // sentence to keep in step.
  //
  // `gad7.intro` and `gad7.resultNote` are the load-bearing pair: this card
  // stores nothing, and both sentences say so — one before the first tap, one
  // beside the total, because "where did my score go" is asked after the run.
  //
  // `gad7.provenance` is the ONLY place in user-facing copy where the
  // instrument is named, and the name is there because the app does not want to
  // borrow it: the card prints what it was adapted from and says, in the same
  // breath, that the wording is the app's own.
  "gad7.title": "Feszültség és aggodalom",
  "gad7.summary": "{n}/7 kitöltve",
  "gad7.intro":
    "Hét kérdés az elmúlt két hétről. Semmi nem kerül mentésre: a válaszaid addig élnek, amíg ez a kártya nyitva van.",
  "gad7.itemGroup": "{index}. kérdés",
  "gad7.incomplete": "Válaszolj mind a hét kérdésre, és utána összegzem.",
  "gad7.submit": "Összegzés",
  "gad7.score": "{score} pont / {max}",
  "gad7.resultNote":
    "Ez az összegzés nem kerül mentésre, és nem lesz belőle előzmény. Ha újra kitöltöd, csak az új válaszokat látod.",
  "gad7.again": "Újra kitöltöm",
  "gad7.provenance":
    "A kérdéssor a GAD-7 (Spitzer, Kroenke, Williams és Löwe, 2006) saját megfogalmazású átdolgozása. Az eredeti kérdőív közkincs.",

  // ---- Round 18. The twelve `.ts` modules the second walk still owed. ----
  //
  // The second walk in `docs/i18n-sweep-list.md` classified every `.ts` module a
  // reader sees copy from, and named thirteen as `chrome — a round is owed`.
  // This is that round: the twelve that turned out to be copy, plus `lib/csv.ts`,
  // which is not copy at all — its Hungarian words are the header aliases the
  // importer MATCHES on (`idx("date", "dátum", …)`), so translating one would
  // stop a file the app itself wrote from being read back. It moved family
  // instead of moving string, and the sweep document says so.
  //
  // Every value here is the byte-for-byte sentence that was in the module, so
  // the Hungarian build is unchanged by this round — asserted by
  // `tests/i18n-round18.test.ts`, which compares each module's EXPORT against
  // the catalogue value rather than trusting the move.

  // `lib/imageBackground.ts` — the two segmented controls' captions and the
  // three sentences the picker can throw. The captions are short because they
  // sit inside a button; the explanations beside them are the card's own keys
  // (`background.fitSoft` and friends), which is why the two sets are separate.
  "background.fitChoiceSoft": "Lágy kitöltés",
  "background.fitChoiceCover": "Kitöltés",
  "background.fitChoiceContain": "Teljes kép",
  "background.paletteChoiceImage": "A képből",
  "background.paletteChoiceTheme": "Saját témám",
  "background.errorStorage": "Nincs elég tárolóhely a háttérképhez.",
  "background.errorType": "Csak kép választható (image/*).",
  "background.errorTooLarge": "A háttérkép túl nagy (maximum 8 MB).",

  // `lib/voice.ts` — the model's system prompt and the six activity tags the
  // offline parser writes. The prompt is ONE value rather than the five parts
  // round 17 split `foodAi`'s into, because it is not one sentence: it is a
  // paragraph, a JSON schema and a closing line, and the module already
  // assembled those with newlines. A value may carry a `\n`; what it may not
  // carry is a leading or trailing space, and this one does not.
  "voice.systemPrompt":
    "Egy magyar nyelvű naplóbejegyzést kapsz.\nFeldolgozása: vond ki a strukturált mutatókat, és válaszolj KIZÁRÓLAG érvényes JSON-nal, magyar szöveggel a \"note\" mezőben.\nSéma:\n{\n  \"mood\": 1-5 (1=nagyon rossz, 3=közepes, 5=nagyon jó; null ha nem egyértelmű),\n  \"stress\": 1-10 (null ha nincs említve),\n  \"energy\": 1-10 (null ha nincs említve),\n  \"sleepHours\": szám (null ha nincs említve),\n  \"restingHr\": szám, nyugalmi pulzus (null ha nincs említve),\n  \"activities\": max 4 rövid főnévi tevékenység-címke (pl. \"Mozgás\", \"Munka\", \"Család\"),\n  \"note\": a bejegyzés 1-2 monatos, visszafogott összefoglalója\n}",
  // The six tags are a SET — the offline parser's own vocabulary — so they are
  // six keys in one namespace rather than five shared with a drawer's title.
  // `Tanulás` in particular reads as a drawer name elsewhere in the app; here it
  // is an activity a reader is being told they logged.
  "voice.activityExercise": "Mozgás",
  "voice.activityWork": "Munka",
  "voice.activityFamily": "Család",
  "voice.activitySocial": "Társaság",
  "voice.activityRest": "Pihenés",
  "voice.activityStudy": "Tanulás",

  // `lib/reportPdf.ts` — the PDF's own headings, its four summary lines, its
  // table header and the four quadrant names. The footer names a diagnosis in
  // order to refuse one, which is the `report.footer` allowance in
  // `tests/lib/i18n.test.ts`.
  //
  // The quadrant names were ASCII-spelled HUNGARIAN abbreviations of the UI's
  // labels (the PDF's built-in font has no `ő`), so they are copy like any
  // other heading and translate with the rest.
  "report.title": "Belső Iránytű — közérzet-jelentés",
  "report.made": "Készült: {date}",
  "report.summary": "Összegzés",
  "report.days": "Napok száma: {count}",
  "report.avgMood": "Átlag hangulat (0–100): {value}",
  "report.avgStress": "Átlag stressz (1–10): {value}",
  "report.avgEnergy": "Átlag energia (1–10): {value}",
  "report.quadrantDays": "4-kvadrans napok: {list}",
  "report.moodChart": "Hangulat alakulása",
  "report.recent": "Utóbbi napok",
  "report.colDate": "Dátum",
  "report.colMood": "Hangulat",
  "report.colStress": "Stressz",
  "report.colEnergy": "Energia",
  "report.trackers": "Nyomonkövetés",
  "report.assessments": "Önreflexiós összegzés",
  "report.footer":
    "A jelentés a saját naplóadatokból készült — nem orvosi tanács, nem diagnózis.",
  "report.quadrantHighNeg": "feszult-aktív",
  "report.quadrantHighPos": "derus-aktiv",
  "report.quadrantLowNeg": "lehangolt-nyugtalan",
  "report.quadrantLowPos": "nyugott-elegedett",

  // `lib/analysis.ts` — the nine insight sentences. Their numbers became
  // placeholders, and the low-9 opening quote is the module's, kept as it was:
  // `„{tag}"` closes with a straight quote, which is the app's existing habit
  // and not something a translation round should quietly restyle.
  "analysis.needMore":
    "Még pár bejegyzés kell, hogy felismeréseket adjak — három után indul az elemzés.",
  "analysis.highStress":
    "Az átlagos stressz-ed magas ({stress}/10). Nézd meg, mely tevékenységek vagy napok húzzák fel.",
  "analysis.lowStress": "Alacsony az átlag stressz-ed ({stress}/10) — jó irány.",
  "analysis.lowEnergy": "Az energiád gyakran alacsony. Több pihenés vagy mozgás segíthet.",
  "analysis.sameMood": "Az utolsó 3 bejegyzésed hangulata ugyanaz ({mood}).",
  "analysis.bestTag": "„{tag}\" napjaidon átlagosan {delta} ponttal jobb a hangulatod.",
  "analysis.worstTag": "„{tag}\" után rendszerint {delta} ponttal rosszabb a hangulatod.",
  "analysis.stressDays": "{days} napon jelzettél 8-as vagy magasabb stresszt.",
  "analysis.balanced": "Kiegyensúlyozott időszakot látsz — figyeld tovább a mintákat.",

  // `lib/dates.ts` — the calendar's seven weekday initials, and
  // `lib/yearInPixels.ts` — its twelve month abbreviations. The months are
  // three letters because that is the shortest unambiguous Hungarian form; the
  // German and English cuts choose their own, which is the point of keying them.
  "dates.weekdayMon": "Hé",
  "dates.weekdayTue": "Ke",
  "dates.weekdayWed": "Sze",
  "dates.weekdayThu": "Cs",
  "dates.weekdayFri": "Pé",
  "dates.weekdaySat": "Szo",
  "dates.weekdaySun": "Vas",
  "yearInPixels.monthJan": "jan",
  "yearInPixels.monthFeb": "feb",
  "yearInPixels.monthMar": "márc",
  "yearInPixels.monthApr": "ápr",
  "yearInPixels.monthMay": "máj",
  "yearInPixels.monthJun": "jún",
  "yearInPixels.monthJul": "júl",
  "yearInPixels.monthAug": "aug",
  "yearInPixels.monthSep": "szept",
  "yearInPixels.monthOct": "okt",
  "yearInPixels.monthNov": "nov",
  "yearInPixels.monthDec": "dec",

  // `lib/correlationGrid.ts` — the four outcome names the grid labels its tags
  // with, and `lib/cardStates.ts` — what a collapsed card says when the day is
  // empty. The em dash in the latter is the card's, not punctuation: the two
  // sides of a collapsed card line up on it.
  "correlation.mood": "Hangulat",
  "correlation.stress": "Stressz",
  "correlation.energy": "Energia",
  "correlation.sleep": "Alvás",
  "cardStates.noData": "— ma még nincs adat",

  // `lib/appLock.ts` — the lock's own sentences. Two of the five are already in
  // the settings card's catalogue and are deliberately NOT copied here: a PIN
  // that is too short and a PIN that is too easy are the same two conditions
  // whether the card or the module asks, so `settings.pin.lengthError` and
  // `settings.pin.weakError` are what the module now returns. That is the one
  // place where a round should not mint a key.
  "lock.noPin": "Nincs beállított PIN.",
  "lock.tooManyAttempts": "Túl sok próbálkozás — kis szünetet kérek.",
  "lock.wrongPin": "Hibás PIN.",

  // `lib/attachments.ts` — the three sentences the attachment store throws, and
  // `lib/backupDaemon.ts` — the one line the backup scheduler shows. The
  // daemon's line names the settings card so the reader knows where to go; the
  // card's own title is a different key and stays one.
  "attachments.errorStorage": "Nincs elég tárolóhely a csatolmányhoz.",
  "attachments.errorTooLarge": "A fájl túl nagy (maximum 5 MB).",
  "attachments.errorVideoType": "Csak videófájl választható (video/*).",
  "backup.dueNote": "Itt az ideje újra menteni. Beállítások → Titkosított felhőmentés.",

  // `lib/backupStorage.ts` — the file surface's five ways to fail, plus the
  // save dialog's own description. `A fájl nem olvasható.` is one of them and it
  // is NOT re-minted: the backup card has shipped that exact sentence as
  // `backup.noSource` since the encrypted backup landed, and two keys holding
  // one sentence is how a translation drifts apart from itself.
  "backup.writeFailed": "A mentés nem sikerült. Próbáld újra.",
  "backup.pickerMissing": "Ez a böngésző nem tud fájlt kiválasztani.",
  "backup.notAllowed": "A böngésző nem engedélyezte a fájlműveletet.",
  "backup.ioFailed": "A fájlművelet nem sikerült. Próbáld újra.",
  "backup.pickerDescription": "Belső Iránytű mentés",

  // THE MANUAL UPDATE — `components/AppUpdateCard.tsx`. Five keys, and the card
  // is the one place a reader can act on "I still see the old version": the
  // button drops every cache and reloads, and the note says so BEFORE it is
  // pressed rather than after.
  "update.cardTitle": "Cache törlése és újratöltés",
  "update.note":
    "Ha úgy látod, hogy a legújabb verzió nem érkezett meg — régi felület, régi szöveg —, ez a gomb mindent eldob: törli a gyorsítótárakat, leállítja a háttérben futó alkalmazás-példányt, és újratölti az oldalt.",
  "update.action": "Alkalmazás frissítése",
  "update.busy": "Frissítés…",
  "update.failed":
    "A böngésző nem engedte újratölteni az oldalt. Zárd be a lapot, és nyisd meg újra — a gyorsítótárak addigra már törölve lettek.",
  "update.stuckGuide":
    "Ha ez sem segít: 1) zárd be az összes lapot, és nyisd meg újra az alkalmazást; 2) ha még mindig a régi verziót látod, nyisd meg a fejlesztői eszközöket (F12), és ott Application → Service Workers → Unregister, majd Application → Storage → Clear site data; 3) végül Ctrl+Shift+R.",

  // THE STUCK-WORKER BANNER — `components/StaleWorkerNotice.tsx`. Two keys: the
  // warning and what the button will do. The manual route is deliberately the
  // SAME key as the card's, so the one text that matters cannot drift.
  "stale.title": "Ez a lap régi verziót futtat",
  "stale.body":
    "Egy háttérfolyamat (service worker) egy korábbi verziót szolgál ki. Ez a gomb minden gyorsítótárat töröl, és egy új címre tölti be az oldalt.",

  // ---- Phase 4 — the AI engine and its weekly summary. ----
  //
  // Three owners: `components/AiSettingsCard.tsx` reads the settings half,
  // `components/WeeklyAiSummaryCard.tsx` the summary half, and `lib/ai.ts` the
  // prompt and the failure lines. The shaping rules are the ones the file's
  // header states — no value starts or ends with a space, placeholders rather
  // than concatenation — plus one that belongs to this block alone:
  //
  // THE PROMPT'S LANGUAGE LINE IS CATALOGUE COPY. `ai.promptIntro` is the
  // sentence a model reads first, and it names the language the answer has to
  // be written in. It sits here rather than in `lib/ai.ts` so the switch
  // actually reaches the one screen that writes its own prose: the Hungarian
  // value asks for Hungarian, the English for English. An English prompt
  // hard-coded in the module would summarise every reader's week in English
  // whatever language they chose.
  //
  // The failure lines (`ai.error*`) are the engine's own, so a reader is told
  // WHICH half failed — switched off, no key, no network — rather than handed a
  // generic "nem sikerült".
  "ai.title": "AI-asszisztens",
  "ai.summary": "Heti összefoglaló saját kulccsal vagy helyben futó modellel",
  "ai.modeGroup": "Hogyan működjön?",
  "ai.modeOff": "Kikapcsolva",
  "ai.modeOffHint": "Nincs letöltés és nincs hálózati kérés: az app nem küld sehova semmit.",
  "ai.modeOnDevice": "Eszközön fut",
  "ai.modeOnDeviceHint":
    "Egy kis nyelvi modell a böngésződben dolgozik. Egyszer le kell tölteni, utána hálózat nélkül is működik.",
  "ai.modeByok": "Saját kulccsal",
  "ai.modeByokHint":
    "A saját kulcsoddal egy külső szolgáltatónál kérünk szöveget, csak a hét bejegyzéseiből.",
  "ai.providerGroup": "Szolgáltató",
  "ai.providerOpenai": "OpenAI",
  "ai.providerDeepseek": "DeepSeek",
  "ai.hostNotice": "A kérés a {host} címre megy, és csak a hét adatait viszi.",
  "ai.keyLabel": "API-kulcs",
  "ai.saveKey": "Kulcs mentése",
  "ai.clearKey": "Kulcs törlése",
  "ai.keySaved": "Mentve: {masked}",
  "ai.keySessionNote":
    "A kulcs csak addig marad meg, amíg ez a lap nyitva van — nem kerül a naplódba, a mentésbe, és nem írjuk ki sehova.",
  "ai.download": "Modell letöltése ({mb} MB)",
  "ai.downloading": "Letöltés: {percent}%",
  "ai.modelReady": "A modell kész, helyben fut.",
  "ai.delete": "Modell törlése",
  "ai.deleteConfirm": "Biztosan törlöd a letöltött modellt? Ez felszabadítja a helyet, de a következő használathoz újra le kell tölteni.",
  "ai.deleted": "Modell törölve.",
  "ai.deleteError": "A modell törlése nem sikerült.",
  "ai.errorOff": "Az AI ki van kapcsolva. A Beállítások → Egyéb lapon kapcsolhatod be.",
  "ai.errorNoKey": "Nincs mentett API-kulcs.",
  "ai.errorInvalidKey": "A kulcsot a szolgáltató elutasította.",
  "ai.errorRateLimited": "Túl sok kérés érkezett — próbáld újra kicsit múlva.",
  "ai.errorNetwork": "Hálózati hiba, most nem sikerült.",
  "ai.errorTimeout": "Időtúllépés: a kérés túl sokáig tartott.",
  "ai.errorBadResponse": "A válasz nem volt használható.",
  "ai.errorModel": "A helyi modell nem tölthető be.",
  "ai.promptIntro": "A te naplód heti összefoglalóját írod, magyarul.",
  "ai.promptStyle": "Írj 3–5 rövid mondatot, baráti hangon, egyetlen bekezdésben.",
  "ai.promptGround":
    "Csak a megadott adatokból dolgozz, ne találj ki részletet, és jelezd, ha kevés az adat.",
  "ai.promptQuestion": "Írd meg a heti összefoglalót ezekből az adatokból:",
  "insights.ai.section": "Heti AI-összefoglaló",
  "insights.ai.title": "Heti AI-összefoglaló",
  "insights.ai.summary": "A hét bejegyzéseiből ír egy rövid szöveget",
  "insights.ai.generate": "Összefoglaló készítése",
  "insights.ai.busy": "Gondolkozik…",
  "insights.ai.off":
    "Az AI ki van kapcsolva. A Beállítások → Egyéb lapon kapcsolhatod be, ha kérsz egy szöveget a hétről.",
  "insights.ai.empty": "Erre a hétre nincs egyetlen bejegyzés sem.",
  "insights.ai.privacyNote": "A modell csak ennek a hétnek az adatait látja.",
  "insights.ai.machineNote": "Gépi szöveg — olvasd el kritikus szemmel.",

} as const;

export type TranslationKey = keyof typeof HU;

type Catalogue = Partial<Record<TranslationKey, string>>;

/**
 * One entry per supported locale, each allowed to be incomplete. English and
 * German carry a few keys on purpose: a partial catalogue that falls back
 * correctly is the case worth having tested, and a complete-looking one would
 * hide it.
 */
export const MESSAGES: Record<Locale, Catalogue> = {
  hu: HU,
  en: {
    "meditation.title": "Meditations",
    "tools.meditation.summary": "Short timed practices in silence",
    "meditation.group": "Practice",
    "meditation.progress": "Elapsed",
    "meditation.start": "Start",
    "meditation.finish": "Finish",
    "meditation.restart": "Restart",
    "meditation.pause": "Pause",
    "meditation.resume": "Resume",
    "meditation.remaining": "Remaining: {time}",
    "meditation.summary": "{minutes} min · {total} total",
    "meditation.complete": "Done. If you have a moment, let the silence sit for a few seconds.",
    "settings.title": "Settings",
    "settings.hint": "Make the app your own.",
    "settings.profile.title": "Profile",
    "settings.profile.summary": "Add your name and goal",
    "settings.profile.nameLabel": "Your name (what we call you)",
    "settings.profile.namePlaceholder": "e.g. Anna",
    "settings.profile.goalLabel": "Why do you use the app?",
    "settings.profile.goalPlaceholder": "e.g. to look after myself better",
    "settings.profile.save": "Save",
    "settings.profile.saved": "Settings saved ⚙️",
    "settings.accessibility.title": "Easier to use",
    "settings.accessibility.size": "{size} text size",
    "settings.accessibility.contrastSummary": "high contrast",
    "settings.accessibility.note": "Bigger text and stronger contrast — you can switch any time.",
    "settings.accessibility.sizeGroup": "Text size",
    "settings.accessibility.contrastLabel": "High-contrast mode",
    "settings.accessibility.contrastHint": "Stronger colours, clearer text.",
    "settings.size.normal": "Normal",
    "settings.size.large": "Large",
    "settings.size.xlarge": "Very large",
    "settings.language.title": "Language",
    "settings.language.summary": "{language} interface",
    "settings.language.note": "Every word in the app switches to this language. The switch reloads the page so the weekday and month names change too.",
    "settings.language.group": "The interface language",
    "language.hu": "Magyar",
    "language.en": "English",
    "language.de": "Deutsch",
    "settings.font.title": "Typeface",
    "settings.font.summary": "{main} · handwriting: {hand}",
    "settings.iconset.title": "Icons and emoji",
    "settings.nav.title": "Navigation",
    "settings.nav.summaryAuto": "The bottom bar hides as you scroll",
    "settings.nav.summaryFixed": "The bottom bar is always visible",
    "settings.nav.summaryReordered": "tabs rearranged",
    "settings.nav.note": "The bottom bar is always visible by default. Turn this on and it hides as you scroll down, then comes back as soon as you scroll up.",
    "settings.nav.hideLabel": "Hide the bottom bar while scrolling",
    "settings.nav.hideHint": "More room to read. It stays off when your system asks for reduced motion.",
    "settings.nav.tabOrderGroup": "Tab order",
    "settings.nav.tabOrderTitle": "Tab order",
    "settings.nav.tabOrderNote": "The order of the buttons in the bottom bar. Use the arrows to rearrange them.",
    "settings.nav.tabUp": "{n}. Move {name} earlier",
    "settings.nav.tabDown": "{n}. Move {name} later",
    "settings.nav.resetNotify": "Default order restored.",
    "settings.nav.reset": "Restore the default order",
    "settings.sections.orderTitle": "Order",
    "settings.sections.orderNote": "The order of the cards. Use the arrows to rearrange them.",
    "settings.sections.moveUp": "{n}. Move {name} earlier",
    "settings.sections.moveDown": "{n}. Move {name} later",
    "settings.sections.reset": "Restore the default order",
    "settings.sections.start": "Rearrange cards",
    "settings.sections.stop": "Done",
    "settings.sections.resetDone": "Default order restored.",
    "entry.deleteTitle": "Delete this entry?",
    "entry.detail.aria": "Entry details",
    "entry.detail.close": "Close",
    "entry.detail.sleep": "Sleep: {hours} hours",
    "entry.detail.stressField": "Stress: {value}/10",
    "entry.detail.energyField": "Energy: {value}/10",
    "entry.detail.pulse": "Pulse: {value}",
    "entry.detail.noteLabel": "Note",
    "entry.detail.trackersTitle": "Tracking",
    "entry.detail.reflectionTitle": "Reflection",
    "entry.detail.feeling": "Feeling: {value}",
    "entry.detail.stressReason": "Tension: {value}",
    "entry.detail.need": "Need: {value}",
    "entry.detail.delete": "Delete",
    "entry.detail.edit": "Edit",
    "entry.detail.moodAria": "Change mood",
    "entry.detail.cancel": "Cancel",
    "entry.detail.save": "Save",
    "entry.detail.deleteMessage": "This entry will be removed for good. This step cannot be undone.",
    "entry.detail.savedToast": "Entry updated ✏️",
    "entry.detail.deletedToast": "Entry deleted 🗑",
    "tracker.deleteTitle": "Delete this tracker?",
    "customTrackers.title": "Your own trackers",
    "customTrackers.intro": "Tracking something the built-in ones don't cover? Add your own daily tracker — it shows up in the daily entry (max. {max}).",
    "customTrackers.emojiLabel": "Emoji",
    "customTrackers.nameLabel": "Tracker name",
    "customTrackers.namePlaceholder": "e.g. Water, Pain, Dose…",
    "customTrackers.kindLabel": "Tracker type",
    "customTrackers.kindSlider": "Slider",
    "customTrackers.kindCheckbox": "Checkbox",
    "customTrackers.kindText": "Text",
    "customTrackers.minLabel": "Lowest value",
    "customTrackers.maxLabel": "Highest value",
    "customTrackers.limitReached": "You've reached the limit of {max} trackers.",
    "customTrackers.duplicateName": "A tracker with that name already exists.",
    "customTrackers.added": "{icon} {label} added ✅",
    "customTrackers.kindSliderShort": "slider",
    "customTrackers.sliderRange": "{kind} ({min}–{max})",
    "customTrackers.kindCheckboxShort": "checkbox",
    "customTrackers.kindTextShort": "text",
    "customTrackers.deleteLabel": "Delete {label}",
    "customTrackers.deleteMessage": "The “{label}” tracker disappears from the daily entry. Values saved in older entries are kept.",
    "customTrackers.confirmDelete": "Yes, delete",
    "customTrackers.deleted": "Tracker deleted.",
    "goals.title": "Today's goals",
    "goals.empty": "Set 1–3 small, reachable goals for today.",
    "goals.progress": "{done}/{total} done — {percent}%",
    "goals.deleteLabel": "Delete \"{text}\"",
    "goals.newLabel": "New daily goal",
    "goals.newPlaceholder": "New goal, e.g. a 10-minute walk",
    "common.add": "Add",
    "foodAi.title": "Food AI — photo analysis",
    "foodAi.summary": "Photo-based estimate — off by default.",
    "foodAi.toggleLabel": "Turn on Food AI",
    "foodAi.toggleHint": "Estimated nutrition from a photo, into the meal fields. Off by default.",
    "foodAi.dataBefore": "The photo you upload and your key go to {host}",
    "foodAi.dataAfter": "and nowhere else, to nobody else. The key is stored in your browser, never forwarded, and can be deleted any time.",
    "foodAi.costLabel": "Cost:",
    "foodAi.costBody": "each analysis is about $0.01–0.02 on your OpenAI bill (the {model} model).",
    "foodAi.keyLabel": "OpenAI API key",
    "foodAi.saveKey": "Save key",
    "foodAi.clearKey": "Delete key",
    "foodAi.savedKey": "Saved key: {key}",
    "healthImport.title": "Smartwatch import",
    "healthImport.summary": "Read in Apple Health or Google Fit data — optional.",
    "healthImport.intro": "Read in an Apple Health (.xml) or Google Fit (.json) export. The data stays in your browser; we only fill in days you already have — anything you typed by hand always wins.",
    "healthImport.hrLabel": "Heart rate and blood oxygen",
    "healthImport.hrHint": "Two new trackers behind one switch. Off by default — the import only writes to them if you turn this on.",
    "healthImport.stubsLabel": "Create empty days for the imported dates",
    "healthImport.stubsHint": "Off by default: only days you already wrote an entry for are updated.",
    "healthImport.fileLabel": "Export file",
    "healthImport.errorUnparseable": "The file can't be read — are you sure it's an export file?",
    "healthImport.errorUnrecognized": "The file is in an unrecognised format.",
    "healthImport.errorTooLarge": "The file is too large for the browser.",
    "healthImport.previewTitle": "Preview",
    "healthImport.previewLead": "— what would change:",
    "healthImport.previewRow": ": {count} days in the export",
    "healthImport.previewApplies": "{count} can be filled in",
    "healthImport.previewPreserved": "{count} kept (yours stays)",
    "healthImport.skippedWillCreate": "{count} days have no entry — an entry will be created.",
    "healthImport.skippedSkipped": "{count} days have no entry — these are skipped.",
    "healthImport.apply": "Apply",
    "healthImport.nothingApplies": "No values can be filled in with this setting.",
    "healthImport.nothingToWrite": "Nothing to import — every value is already there.",
    "healthImport.optionalFooter": "No smartwatch? Every value can be typed by hand — this card is optional.",
    "install.bannerTitle": "Install to your home screen",
    "install.bannerBody": "Use the app from its own icon, full screen — all your data still stays on your device.",
    "install.bannerAction": "Install",
    "install.bannerDismiss": "Hide this",
    "install.done": "Installed — happy journaling! 🧭",
    "install.cardTitle": "As an app",
    "install.notOffered": "Your browser hasn't offered installation yet. The app works fully in the browser as it is — once your phone offers it, the button will appear here.",
    "install.offered": "Put the app on your home screen: full screen, works offline, and all your data stays local.",
    "install.cardAction": "Install now",
    "iconset.intro": "Until you pick one here, everything looks the way it did before.",
    "iconset.contentNote": "Content icons — moods, activities, milestones — follow the set. Buttons and form controls ({count} icons) deliberately stay line drawings: a 3D “+” or keyring isn't more readable, just busier.",
    "iconset.groupLabel": "Choose an icon set",
    "iconset.noneLabel": "None set",
    "iconset.noneBlurb": "The current look — the way you've seen it so far.",
    "iconset.chromeSummary": "Why do {count} icons stay line drawings? (the full list)",
    "iconset.chromeBody": "An icon would follow the set if there were an image for it. Buttons and form controls aren't like that: the mark itself is the label, and a glossy illustration reads worse over more of the screen. This list is exactly what deliberately stays a line drawing, with the reason for each group.",
    "iconset.licencesHeading": "Licences",
    "iconset.inUse": "in use",
    "meds.times.title": "Medication times",
    "meds.times.empty": "First add medications in the Health section of the Discover tab, then you can set times and turn on a reminder here.",
    "meds.times.reminderNote": "The reminder speaks while the app is running — there is no server watching in the background. Installed as an app (PWA) it can even work in the background; on iPhone you need to install it for that.",
    "meds.times.count": "{count}/{max} times",
    "meds.times.none": "No times set yet.",
    "meds.times.add": "Time",
    "meds.times.maxReached": "You've reached the maximum ({max}).",
    "meds.times.reminderLabel": "Reminder: {name}",
    "meds.times.reminderHint": "Turn it off if you don't want a reminder for this medication.",
    "pin.gate.label": "Unlock",
    "pin.gate.title": "Belső Iránytű is locked",
    "pin.gate.body": "Enter your PIN to continue.",
    "pin.gate.submit": "Unlock",
    "pin.gate.forgotBefore": "Forgotten it? We don't store the PIN — anywhere, for anyone. So if you don't remember it, the only option is to",
    "pin.gate.forgotEmphasis": "delete all data",
    "pin.gate.forgotAfter": "and start over. If you want to keep your journal, export it first in Settings → Data and backup.",
    "week.textPlaceholder": "You can write a sentence or two…",
    "week.textLabel": "Weekly reflection",
    "week.save": "Saved",
    "week.skip": "Skip this week",
    "lag.summaryEmpty": "Needs at least 4 entries and 2 of the same activity",
    "lag.summaryFilled": "How {count} activities affect the next 2 days",
    "lag.intro": "Some activities only show their effect 1–2 days later. Here you can see how mood moved in the days after each activity.",
    "lag.needsData": "This needs at least 4 entries and at least 2 of the same activity.",
    "lag.daysLabel": "{count} days later",
    "lag.cellDay0": "today",
    "lag.titleDay0": "On the day of the activity",
    "lag.cellDay1": "+1 day",
    "lag.titleDay1": "The next day",
    "lag.cellDay2": "+2 days",
    "lag.titleDay2": "Two days later",
    "lag.cellBaseline": "baseline",
    "lag.titleBaseline": "Average of other days",
    "lag.disclaimer": "The delta is measured against the average of days without the activity (mood points, 0–100). With fewer than two samples we don't calculate it.",
    "export.summary": "PDF or CSV from {count} entries",
    "export.intro": "A printable summary for a professional: an overview, a mood curve and a table of recent days — or a full CSV for your own analysis.",
    "export.busy": "Preparing…",
    "export.pdfAction": "PDF report",
    "export.csvAction": "CSV export",
    "export.cost": "The first time a PDF is made, about {compressed} kB is downloaded ({raw} kB uncompressed) — the largest download the app makes, and only once. After that your browser stores it and it works offline. The CSV export downloads nothing.",
    "export.disclaimer": "The report is built locally from your own data — nothing goes to a server.",
    "font.sample": "This is how I keep the memory of the fire.",
    "font.sampleBold": "Good day",
    "font.intro": "Pick a typeface — the whole app switches immediately.",
    "font.groupLabel": "Choose a typeface",
    "font.handGroupLabel": "Handwriting typeface",
    "font.handTitle": "Handwritten",
    "font.handNote": "It applies only to your own text. Buttons, menus and forms always stay in the typeface above.",
    "font.selfHostedNote": "The typefaces come from our own server and stay on your machine — no external service is called.",
    "font.recommended": "Recommended",
    "font.noDownload": "no download",
    "font.kbSize": "approx. {kb} kB",
    "reminder.title": "Daily reminder",
    "reminder.intro": "A gentle daily reminder — no push service, no nagging. If the app is closed, the note simply waits until you next open it.",
    "reminder.toggleLabel": "Turn on the reminder",
    "reminder.permissionDenied": "Notifications aren't allowed — the setting stays silent.",
    "reminder.stateGranted": "Allowed ✓",
    "reminder.stateBlocked": "Blocked in the browser — allow it in the address bar.",
    "reminder.stateUnsupported": "This browser doesn't support notifications.",
    "reminder.stateAsk": "We'll ask for permission when you turn it on.",
    "reminder.timeLabel": "Time",
    "reminder.messageLabel": "Reminder message",
    "reminder.nextAt": "Next reminder: {when} ({time})",
    "reminder.inHoursMinutes": "in about {h} h {m} min",
    "reminder.inMinutes": "in about {m} min",
    "weather.title": "Weather automatically",
    "weather.summary": "Automatic fill-in — off by default.",
    "weather.whatLeaves": "open-meteo.com receives the city name (or, if you turn it on, your device's coordinates) — and only that. No account, no key, no other data.",
    "weather.toggleLabel": "Automatic weather",
    "weather.toggleHint": "The journal form fills the weather fields with the fetched data. You can overwrite it by hand any time.",
    "weather.errorNoLocation": "Add your city first.",
    "weather.errorDenied": "The browser didn't give us your location — you can type it in by hand.",
    "weather.errorFetch": "Couldn't fetch it just now — the manual fields work as before.",
    "weather.cityLabel": "City",
    "weather.cityPlaceholder": "e.g. Budapest",
    "weather.cityNote": "This is the starting location. While it's on, this is always the default.",
    "weather.gpsLabel": "Device location",
    "weather.gpsHint": "Asks the browser for coordinates instead of the city name — a separate permission, tied only to this switch.",
    "weather.probeCached": "Today's data from the cache: {value}.",
    "weather.probeFresh": "Today's data: {value}.",
    "weather.noReadableValue": "the service returned no readable value",
    "weather.tryBusy": "Fetching…",
    "weather.tryNow": "Fetch today's data now",
    "weather.conditionSunny": "sunny",
    "weather.conditionCloudy": "cloudy",
    "weather.conditionRainy": "rainy",
    "weather.conditionSnowy": "snow",
    "weather.conditionFoggy": "foggy",
    "quadrants.sleepTitle": "Quadrant and sleep",
    "insights.notEnoughData": "Not enough data yet",
    "quadrants.emotion.emptyHint": "Log the same feeling on at least two days, with context — then we'll show you what it goes together with.",
    "quadrants.emotion.listLabel": "Feeling and context going together",
    "quadrants.emotion.row": "{emotion} — with {context} on {together}/{days} days ({percent}%)",
    "quadrants.sleep.emptyHint": "With two sleep readings in one quadrant we already compare them with the other days.",
    "quadrants.sleep.listLabel": "Average sleep by quadrant",
    "quadrants.sleep.fewData": "little data",
    "quadrants.sleep.hours": "{hours} hours",
    "quadrants.sleep.delta": "({sign}{delta} vs the others)",
    "insights.patterns.confidenceStrong": "strong signal",
    "insights.patterns.confidenceMedium": "medium signal",
    "insights.patterns.confidenceWeak": "weak signal",
    "insights.patterns.count": "{count} patterns",
    "insights.patterns.basis": "Calculated from your whole journal, {count} entries — not just the period above.",
    "insights.patterns.sample": "based on {count} days",
    "insights.patterns.disclaimer": "These are relationships in your own data, not causes. Not medical advice and not a diagnosis.",
    "insights.grid.summary": "{rows} activities × {cols} measurable outcomes",
    "insights.grid.explain": "Rows: activities · Columns: measurable outcomes. Each cell shows how much the average differs on days the activity happened (▲ good direction, ▼ bad direction). A cell needs at least {min} days.",
    "insights.grid.emptyHint": "Not enough data yet — mark your activities in the daily entry, and the patterns will show up here after a few days.",
    "insights.grid.tableLabel": "Effect matrix",
    "insights.grid.rowHeader": "Activity",
    "insights.grid.tooFewSamples": "Fewer than {min} readings",
    "insights.grid.flat": "No meaningful difference ({count} days)",
    "insights.grid.effectLarger": "points higher",
    "insights.grid.effectSmaller": "points lower",
    "insights.grid.effectBetter": "points better",
    "insights.grid.effectWorse": "points worse",
    "insights.grid.cellEffect": "{label}: {delta} {effect} without it ({count} days)",
    "background.errorLoad": "The image couldn't be loaded.",
    "background.busy": "Loading…",
    "background.replace": "Replace image",
    "background.choose": "Choose an image",
    "background.emptyHint": "Pick an image from your device and make it the app's background. The image stays only on this device — nothing is uploaded.",
    "background.sampleCard": "Sample card — at 100% transparency the background image shows through and the text stays on the scrim.",
    "background.scrimLabel": "Background scrim",
    "background.cardAlphaLabel": "Card transparency",
    "background.cardAlphaHint": "This slider only fades the cards, it doesn't move the scrim — at 100% the image shows through, and the Background scrim slider is what makes the text readable.",
    "background.blurLabel": "Background blur",
    "background.percent": "{value} percent",
    "background.fitLabel": "Image size",
    "background.fitAria": "How the background image is shown",
    "background.fitCover": "Fill: the image stretches to fill the screen — may blur with a large image.",
    "background.fitContain": "Whole image: all of the image shows, at its own size, with empty bands.",
    "background.fitSoft": "Soft fill: the whole image at its own size, with the bands filled by the same image, blurred.",
    "background.paletteLabel": "Scrim colour",
    "background.paletteAria": "Where the scrim colour comes from",
    "background.paletteHighContrast": "High contrast is on: the scrim is opaque and takes the theme's colour, so the image's colour doesn't count.",
    "background.paletteImage": "From the image: the scrim takes its own colour, but the theme's light or dark stays the same.",
    "background.paletteTheme": "My theme: one scrim, light or dark — following the theme.",
    "background.remove": "Remove image",
    "app.name": "Belső Iránytű",
    "app.greetingNight": "Good night",
    "app.greetingMorning": "Good morning",
    "app.greetingDay": "Good day",
    "app.greetingEvening": "Good evening",
    "app.greetingNamed": "{part}, {name}!",
    "app.greetingAnonymous": "{part}!",
    "app.streakTitle": "Consecutive days of journaling",
    "app.streakChip": "{count} days",
    "app.navLabel": "Main navigation",
    "app.insightsFailed": "The Insights view can't be loaded right now. Open it again once while online.",
    "app.insightsLoading": "Loading insights…",
    "stats.monthLabel": "Month",
    "stats.yearLabel": "Year",
    "stats.summary": "{period} · {count} days journaled",
    "stats.yearAvgMood": "{year} average mood for the year",
    "stats.yearDaysTotal": "{year} total days journaled",
    "stats.avgMoodScale": "average mood (0–100)",
    "stats.avgStressScale": "average stress (1–10)",
    "stats.avgEnergyScale": "average energy (1–10)",
    "yearInPixels.yearLabel": "Year",
    "yearInPixels.monthLabel": "Month",
    "yearInPixels.noEntry": "no entry",
    "yearInPixels.gridLabel": "{month} mood calendar",
    "yearInPixels.pickPrompt": "Pick a day in the calendar.",
    "achievements.summary": "{earned} / {total} badges",
    "achievements.emptyTitle": "Regular journaling earns you small badges — start the run!",
    "achievements.keepGoing": "{earned} badges earned — keep going, there are more!",
    "achievements.newBadge": "NEW",
    "trackers.sectionTitle": "Tracking",
    "trackers.frameSummary": "{n} entries for today",
    "iconPolicy.group.gombok": "Buttons",
    "iconPolicy.group.jelzesek": "Indicators",
    "iconPolicy.group.berendezes": "Controls",
    "iconPolicy.group.meroszamok": "Metrics",
    "iconPolicy.reason.plus": "a “+” isn't more readable in 3D",
    "iconPolicy.reason.x": "closing",
    "iconPolicy.reason.check": "done",
    "iconPolicy.reason.trash": "deleting",
    "iconPolicy.reason.pencil": "editing",
    "iconPolicy.reason.save": "saving",
    "iconPolicy.reason.upload": "uploading",
    "iconPolicy.reason.download": "downloading",
    "iconPolicy.reason.mic": "voice recording",
    "iconPolicy.reason.square": "stopping",
    "iconPolicy.reason.chevronDown": "a direction marker",
    "iconPolicy.reason.search": "the search field",
    "iconPolicy.reason.sliders": "the adjustment sliders",
    "iconPolicy.reason.eye": "showing or hiding",
    "iconPolicy.reason.lockIcon": "the lock",
    "iconPolicy.reason.shieldAlert": "protection",
    "iconPolicy.reason.bell": "the reminder",
    "iconPolicy.reason.mapPin": "a place",
    "iconPolicy.reason.paperclip": "an attachment",
    "iconPolicy.reason.link": "a link",
    "iconPolicy.reason.settings": "the menu's icon",
    "iconPolicy.reason.calendar": "the date field",
    "iconPolicy.reason.calendarDays": "picking a day",
    "iconPolicy.reason.clock": "a time",
    "iconPolicy.reason.hourglass": "a timeline",
    "iconPolicy.reason.layoutGrid": "the view switcher",
    "iconPolicy.reason.table": "a table",
    "iconPolicy.reason.palette": "the colour editor",
    "iconPolicy.reason.image": "choosing the background image",
    "iconPolicy.reason.type": "text size",
    "iconPolicy.reason.clipboardList": "the list view",
    "iconPolicy.reason.fileText": "a file",
    "iconPolicy.reason.history": "history",
    "iconPolicy.reason.barChart": "the chart's frame",
    "iconPolicy.reason.lightbulb": "an idea",
    "iconPolicy.reason.smartphone": "the install prompt",
    "iconPolicy.reason.phone": "the helpline",
    "iconPolicy.reason.messageCircle": "a speech bubble",
    "iconPolicy.reason.briefcase": "the Discover tab's box",
    "iconPolicy.reason.wind": "the breathing movement",
    "iconPolicy.reason.ban": "the privacy list",
    "iconPolicy.reason.scale": "the balance-score card",
    "iconPolicy.reason.target": "a goal",
    "iconPolicy.reason.zap": "energy",
    "iconPolicy.reason.activity": "stress",
    "iconPolicy.reason.moon": "the sleep-comparison card",
    "font.categoryNote.sans": "Clean, and made for text. Side by side they're hard to tell apart — that's their real difference.",
    "font.categoryNote.serif": "Book-like, with small strokes. Pleasant for long text.",
    "font.categoryNote.rounded": "Rounded and friendly. Friendly enough for children too.",
    "font.categoryNote.condensed": "Narrow and tall. Fits large text into a small space.",
    "font.categoryNote.mono": "Every character is the same width. For data and numbers.",
    "font.systemLabel": "System",
    "font.systemHint": "Your device's own typeface. Downloads nothing, however you look at it.",
    "font.interHint": "Neutral and very legible. Made for newspapers and interfaces.",
    "font.montserratHint": "Wide, geometric letters. Modern and airy.",
    "font.robotoHint": "Familiar and restrained. Reads well even in small text.",
    "font.latoHint": "Gently human, warmly drawn sans. Comfortable in Hungarian letterforms.",
    "font.playfairDisplayHint": "A very elegant serif. Excellent for headings, not for small text.",
    "font.loraHint": "A warm, literary serif. The feel of an old hardback.",
    "font.quicksandHint": "Rounded and soft. Friendly, less formal.",
    "font.sairaCondensedHint": "Narrow and tall. The same text fits in half the space.",
    "font.jetBrainsMonoHint": "Every letter is the same width. A coded, technical feel.",
    "font.handOffLabel": "Off",
    "font.handOffHint": "Your notes appear in the same typeface as the app.",
    "font.dancingScriptHint": "A handwriting typeface, for your own notes only. Not for buttons or menus.",
    "font.retiredReason.manrope": "still available among Google's fonts",
    "font.retiredReason.plusJakartaSans": "still available among Google's fonts",
    "weather.placeGps": "Location",
    "reminder.messageMood": "One minute — how do you feel right now? 🌱",
    "reminder.messageRecord": "Log today before you forget 💙",
    "reminder.messageTwoMinutes": "Two minutes for yourself: a mood and a thought 🧭",
    "foodAi.promptIntro": "You are a nutrition analyst. The image shows a meal.",
    "foodAi.promptSchema": "Answer with valid JSON only, with exactly this set of fields:",
    "foodAi.promptFields": "{\"calories\": number of kcal, \"protein\": grams, \"carbs\": grams, \"fat\": grams,",
    "foodAi.promptDescription": "\"description\": one short sentence in English about what is visible in the image}.",
    "foodAi.promptNotFood": "If the image isn't food, every number should be 0 and the description should say so.",
    "foodAi.promptQuestion": "What's in the image? Estimated nutrition, with a description in English.",
    "foodAi.macros": "Protein {protein} g · Carbs {carbs} g · Fat {fat} g",
    "foodAi.maskedKey": "{head}…•••• ({length} characters)",
    "foodAi.errorNoKey": "Add your OpenAI key in Settings first.",
    "foodAi.errorInvalidKey": "OpenAI didn't accept the key — check it in Settings.",
    "foodAi.errorRateLimited": "Too many requests in a short time — try again in a minute.",
    "foodAi.errorTimeout": "Timed out — analysing the image took too long.",
    "foodAi.errorNetwork": "Network error — couldn't analyse the image just now.",
    "foodAi.errorBadResponse": "OpenAI's answer couldn't be read.",
    "healthImport.seriesHr": "Heart rate",
    "healthImport.seriesSpo2": "Blood oxygen",
    "healthImport.seriesSleep": "Sleep (hours)",
    "healthImport.seriesSteps": "Step count",
    "onboarding.trackerSleep": "Sleep",
    "onboarding.trackerSymptoms": "Symptoms",
    "onboarding.trackerVitamins": "Vitamins",
    "onboarding.trackerWeather": "Weather",
    "settings.sections.lessons": "Micro-lesson",
    "settings.groups.personal": "Personal",
    "settings.groups.appearance": "Appearance",
    "settings.groups.navigation": "Menu bar",
    "settings.groups.tracking": "Tracked data",
    "settings.groups.reminders": "Reminders",
    "settings.groups.security": "Security",
    "settings.groups.data": "Backup and export",
    "settings.groups.misc": "Other",
    "settings.sections.reflection": "Weekly reflection",
    "settings.sections.year": "Mood calendar",
    "insights.year.summary": "Every day of the year, one pixel",
    "settings.sections.lag": "Which activity came back later?",
    "settings.sections.quadrants": "Feeling and context",
    "settings.sections.export": "Report export",
    "settings.sections.stats": "Monthly and yearly statistics",
    "settings.sections.achievements": "Milestones",
    "settings.sections.grid": "Effect matrix",
    "settings.sections.patterns": "Patterns in your journal",
    "settings.theme.title": "Theme",
    "settings.theme.fallback": "Light",
    "settings.theme.note": "Pick a look — the whole app switches immediately.",
    "settings.theme.group": "Choose a theme",
    "settings.bg.title": "Background image",
    "settings.bg.set": "Custom image set",
    "settings.bg.unset": "None set",
    "settings.bg.inkWarning":
      "The current settings do not reach WCAG AA contrast. Increase the veil or lower the card transparency.",
    "settings.bg.veilFloorNotice":
      "The picture needed a stronger veil: it has been raised to {value}% so the text stays readable.",
    "settings.nutrition.title": "Nutrition tips",
    "settings.nutrition.summary": "Transparency: what can the journal say?",
    "settings.nutrition.note": "The journal isn't an adviser and it isn't a diet plan — it only reflects back what you logged. One of two sentences can appear on the Today tab when a rule matches:",
    "settings.nutrition.example1": "A nice balance. Vegetables and protein are a good combination.",
    "settings.nutrition.example2": "Fast food fits sometimes. Try a vegetable dish tomorrow too.",
    "settings.nutrition.weekNote": "The Weekly summary card calculates from more than three days of calorie estimates, and sometimes shows one calm remark:",
    "settings.sport.title": "Exercise tips",
    "settings.sport.summary": "Transparency: what can a workout entry say?",
    "settings.sport.note": "At least one sentence can appear beside a workout entry — recognition, or a small next step. A few of the possible ones:",
    "settings.sport.example1": "A 30-minute run — nice. Recovery counts too: drink some water.",
    "settings.sport.example2": "A 15-minute walk — every bit of movement counts.",
    "settings.sport.programsNote": "The Workout programs card looks at this week's workout entries to show which programme suits you — always as a suggestion only.",
    "settings.trackers.title": "Tracking",
    "settings.trackers.summary": "{on} / {total} groups on",
    "settings.trackers.note": "Turn on what you'd like to log with your entry each day.",
    "settings.modules.title": "Modules",
    "settings.modules.summary": "{on} / 5 modules on",
    "settings.modules.note": "Show only what you need — the rest stays hidden.",
    "settings.modules.energyLabel": "Energy slider",
    "settings.modules.energyHint": "Log your daily energy level alongside your mood.",
    "settings.modules.reflectionLabel": "Self-reflection",
    "settings.modules.reflectionHint": "Three short questions for the end of the day.",
    "settings.modules.vitalsLabel": "Body metrics (sleep, pulse, HRV)",
    "settings.modules.vitalsHint": "Type them in from a smartwatch or by hand.",
    "settings.modules.medsLabel": "Medication reminder",
    "settings.modules.medsHint": "The medications you need to take every day.",
    "settings.modules.assessLabel": "Self-reflection questionnaire",
    "settings.modules.assessHint": "A two-minute self-assessment about the last two weeks.",
    "settings.mood.title": "Recording mood",
    "settings.mood.summaryNew": "New: 4-quadrant",
    "settings.mood.summaryOld": "Old: 5-point",
    "settings.mood.note": "You can choose between two modes. Older entries show up under both.",
    "settings.mood.group": "How mood is recorded",
    "settings.mood.newName": "New: 4-quadrant",
    "settings.mood.newDesc": "A mood meter, a feeling and context, in three steps.",
    "settings.mood.oldName": "Old: 5-point",
    "settings.mood.oldDesc": "The familiar smileys in a row.",
    "settings.disable.title": "Turn it off?",
    "settings.disable.message": "Saved self-assessments will be deleted. This can't be undone.",
    "settings.disable.confirm": "Turn off and delete",
    "settings.disable.cancel": "Cancel",
    "settings.pin.title": "Lock",
    "settings.pin.privacyNote": "The PIN stays on your device, and only an encrypted fingerprint goes into browser storage — we don't store the PIN itself. This is a convenience and privacy shield against someone curious, not encryption: the journal itself stays readable in your device's storage.",
    "settings.pin.start": "Set a PIN",
    "settings.pin.chooseHint": "Choose {min}–{max} digits that don't repeat and aren't a sequence like 1234.",
    "settings.pin.newPlaceholder": "New PIN",
    "settings.pin.repeatPlaceholder": "PIN again",
    "settings.pin.newRepeatPlaceholder": "New PIN again",
    "settings.pin.currentPlaceholder": "Current PIN",
    "settings.pin.save": "Save",
    "settings.pin.cancel": "Cancel",
    "settings.pin.change": "Change PIN",
    "settings.pin.turnOff": "Turn off",
    "settings.pin.turnOffNote": "Enter your current PIN to turn it off.",
    "settings.pin.turnOffConfirm": "Turn the lock off",
    "settings.pin.sessionNote": "Unlocking lasts for the session: it locks again after 15 minutes unused, and on the next day. A forgotten PIN has no way back — only deleting all data — so export first if you want to keep your journal.",
    "settings.pin.lengthError": "The PIN must be {min}–{max} digits.",
    "settings.pin.weakError": "This PIN is too easy to guess — choose another.",
    "settings.pin.mismatchError": "The two PINs don't match.",
    "settings.pin.setDone": "PIN set 🔒",
    "settings.pin.changedDone": "PIN changed 🔒",
    "settings.pin.turnedOff": "Lock turned off.",
    "settings.voice.title": "Entry from voice",
    "settings.voice.badge": "Experimental",
    "settings.voice.summary": "Mood, stress, energy and activities from speech",
    "settings.voice.note": "Talk through your day and the app pulls out your mood, stress, energy and activities.",
    "settings.voice.noteLlm": "The recognition is done with artificial intelligence.",
    "settings.voice.noteOffline": "Without a key it uses simple, offline text analysis.",
    "settings.voice.emptyWarn": "Dictate or write something first.",
    "settings.voice.savedLlm": "Updated from voice (AI) 🎙️",
    "settings.voice.savedOffline": "Updated from voice (offline analysis) 🎙️",
    "settings.voice.unsupported": "This browser doesn't support speech recognition. Type it in instead — the processing works the same.",
    "settings.voice.textAreaLabel": "The journal entry's text",
    "settings.voice.placeholder": "Describe your day in one sentence…",
    "settings.voice.makeEntry": "Create entry",
    "settings.voice.start": "Start speaking",
    "settings.voice.stop": "Stop",
    "settings.voice.vitalsNote": "It also extracts your pulse and sleep if you mention them.",
    "settings.voice.resultLabel": "The recognised text, editable",
    "settings.voice.resultPlaceholder": "What you said appears here — editable.",
    "settings.voice.makeEntryFrom": "Create an entry from it",
    "settings.voice.vitalsToggleLabel": "Body metrics module",
    "settings.voice.vitalsToggleHint": "Extract pulse and sleep from the text.",
    "settings.data.title": "Data and backup",
    "settings.data.badge": "Details",
    "settings.data.summary": "Export, import and deleting all data",
    "settings.data.csvExport": "CSV export",
    "settings.data.jsonExport": "JSON backup",
    "settings.data.fileImport": "File import",
    "settings.data.importNote": "The import merges entries with the same date, so nothing is lost.",
    "settings.data.deleteAll": "Delete all data",
    "settings.data.csvDone": "CSV downloaded 📤",
    "settings.data.jsonDone": "JSON backup downloaded 📤",
    "settings.data.jsonRestoredWith": "JSON restored: {entries} entries, {assessments} self-assessments ✅",
    "settings.data.jsonRestored": "JSON restored: {entries} entries ✅",
    "settings.data.jsonNoEntries": "The JSON contains no entries.",
    "settings.data.importNone": "I found no importable rows.",
    "settings.data.imported": "{count} entries imported ✅",
    "settings.data.importFailed": "The file couldn't be processed.",
    "settings.data.resetTitle": "Delete everything?",
    "settings.data.resetMessage": "All entries, goals and settings will be removed from this device. It's worth making a JSON backup first.",
    "settings.data.resetConfirm": "Yes, delete everything",
    "settings.data.resetDone": "All data deleted.",
    "settings.privacy.title": "Privacy",
    "settings.privacy.summary": "All data stays on this device.",
    "settings.privacy.local": "All data is stored on your own device (browser storage).",
    "settings.privacy.noAccount": "No account, no upload — the app sends data nowhere.",
    "settings.privacy.noAds": "No ads and no tracking.",
    "settings.privacy.export": "You can export to CSV any time, or delete everything.",
    "today.title": "Today's check-in",
    "today.hint": "Three steps: mood, feelings, save.",
    "today.heroHint": "This is where today's entry goes. Pick a mood, then save — less than a minute.",
    "today.saved": "Saved. Nice work! 🌱",
    "today.savedBadge": "✅ Saved",
    "today.save": "💾 Save",
    "today.moodRequired": "Pick a mood from the smileys first.",
    "today.mood.title": "How are you today?",
    "today.mood.summaryLabel": "Today:",
    "today.mood.prompt": "Mark how you feel right now — less than a minute.",
    "today.mood.record": "Record mood",
    "today.mood.group": "Choose a mood",
    "today.weather.denied": "Location isn't allowed — the weather can be typed in by hand.",
    "today.weather.unavailable": "The weather couldn't be fetched just now — you can type it in by hand.",
    "today.weather.cached": "Weather loaded from the cache.",
    "today.weather.cachedTemp": "Weather loaded from the cache ({temp} °C).",
    "today.weather.live": "Weather loaded.",
    "today.weather.liveTemp": "Weather loaded ({temp} °C).",
    "today.slider.stress": "Stress",
    "today.slider.energy": "Energy",
    "today.noteLabel": "Note (optional)",
    "today.notePlaceholder": "What happened today? Why do you feel this way?",
    "today.balance.title": "Balance score",
    "today.balance.high": "This looks like a balanced day. 🌟",
    "today.balance.mid": "A workable day — small steps count. 🌱",
    "today.balance.low": "Today was a harder day. That's data too, and tomorrow is a new page. 💙",
    "today.activities.title": "What affected you today?",
    "today.activities.note": "The app works out from these which activities lift or lower your mood.",
    "today.weeklyNutrition.title": "Weekly summary",
    "today.weeklyNutrition.summary": "{days} days this week, {avg} kcal on average.",
    "today.weeklyNutrition.summarySafety": "Safety note active",
    "today.reflection.saved": "Reflection saved 🧠",
    "today.reflection.title": "A short self-reflection",
    "today.reflection.feeling": "What was your strongest feeling today?",
    "today.reflection.stressReason": "What caused the most tension?",
    "today.reflection.need": "What do you need right now?",
    "today.reflection.save": "Save reflection",
    "today.reflection.summaryFilled": "Filled in",
    "today.reflection.summaryEmpty": "Not filled in yet",
    "today.vitals.saved": "Body data saved 📈",
    "today.vitals.title": "Body metrics",
    "today.vitals.sleep": "Sleep (hours)",
    "today.vitals.restingHr": "Resting pulse (bpm)",
    "today.vitals.hrv": "HRV (ms)",
    "today.vitals.save": "Save data",
    "today.vitals.note": "We'll later plot these onto the mood curve.",
    "today.vitals.summary": "{n}/3 values logged",
    "today.meds.added": "Medication added 💊",
    "today.meds.title": "Medications",
    "today.meds.empty": "Add your medications and tick them off when you've taken them.",
    "today.meds.nameLabel": "New medication's name",
    "today.meds.placeholderExample": "e.g. vitamin D",
    "today.meds.placeholderMore": "Another medication…",
    "today.meds.add": "Add",
    "today.meds.nextDose": "Next dose: {time} · {name}",
    "today.meds.nextDoseWithAmount": "Next dose: {time} · {name} — {amount}",
    "today.meds.summary": "{on}/{total} medicines taken",
    "today.question.title": "Today's question",
    "today.question.bestMoment": "What was your best moment today?",
    "today.question.stress": "What caused tension today?",
    "today.question.need": "What would you have needed more of?",
    "today.question.learning": "What did you learn about yourself today?",
    "today.question.energy": "What gave you energy today?",
    "today.question.gratitude": "What are you grateful for today?",
    "today.question.answerLabel": "Answer to the daily question",
    "today.question.answerPlaceholder": "Write it briefly…",
    "today.question.save": "Save answer",
    "today.question.saved": "Answer saved 💭",
    "today.question.summaryAnswered": "Answered",
    "today.question.summaryOpen": "Not answered yet",
    "journal.streak": "{streak}-day streak",
    "journal.streakNote": "Every day you fill in brings you closer to yourself.",
    "journal.prevMonth": "Previous month",
    "journal.today": "Today",
    "journal.nextMonth": "Next month",
    "journal.calendarGroup": "Mood calendar",
    "journal.calendar.summary": "A month of moods, one square per day",
    "journal.dayWithMood": "{date}: {mood}",
    "journal.dayEmpty": "{date}: no entry",
    "journal.search.title": "Search and filter",
    "journal.search.badge": "Details",
    "journal.search.placeholder": "Search notes and moods…",
    "journal.search.label": "Search the journal",
    "journal.search.filterGroup": "Filter by mood",
    "journal.filter.all": "All",
    "journal.filter.good": "Good days",
    "journal.filter.mid": "Middle days",
    "journal.filter.rough": "Hard days",
    "journal.results": "{found} of {total} entries.",
    "journal.entriesTitle": "Entries",
    "journal.empty.title": "This page is still empty",
    "journal.empty.hint": "Entries you record on the Today tab collect here.",
    "journal.empty.cta": "Open the Today tab",
    "attachments.title": "Attachments",
    "attachments.photo": "Photo",
    "attachments.stopRecording": "Stop recording",
    "attachments.recordAudio": "Record audio",
    "attachments.audioFile": "Audio file",
    "attachments.video": "Video",
    "attachments.videoHint": "Short video: max 5 MB (about 10–30 seconds).",
    "attachments.photoAlt": "Attached photo",
    "attachments.removeLabel": "Delete attachment",
    "attachments.photoSaveError": "The photo couldn't be saved.",
    "attachments.videoSaveError": "The video couldn't be saved.",
    "attachments.audioSaveError": "The audio couldn't be saved.",
    "attachments.recordUnsupported": "This device or browser doesn't support audio recording — pick a file instead.",
    "attachments.micFailed": "The microphone couldn't be started.",
    "recording.aria": "Recording mood",
    "recording.meterAria": "Mood meter",
    "recording.energyAxis": "Energy ↑",
    "recording.pleasantnessAxis": "Pleasantness →",
    "recording.step1Title": "How do you feel right now?",
    "recording.step2Title": "Which feeling?",
    "recording.step3Title": "What's going on?",
    "recording.step1Sub": "Place the dot on the map — energy from top to bottom, pleasantness from left to right.",
    "recording.step3Sub": "Anything can be skipped — only what's true.",
    "recording.liveStep1": "Mood meter: energy {energy}, pleasantness {pleasantness}",
    "recording.liveStep2": "Choosing a feeling",
    "recording.liveStep3": "Context",
    "recording.meterValueText": "Energy {energy} / 10, pleasantness {pleasantness} / 10, {quadrant}",
    "recording.emotionsAria": "Feelings",
    "recording.other": "Other",
    "recording.customPlaceholder": "Your own word…",
    "recording.add": "Add",
    "recording.added": "Added: {label}",
    "recording.intensityLabel": "How strongly? {value}/10",
    "recording.back": "Back",
    "recording.next": "Next",
    "recording.skip": "Skip",
    "recording.saveWithoutContext": "Save without context",
    "recording.save": "Save",
    "lesson.cardTitle": "Micro-lesson",
    "lesson.try": "Try it",
    "lesson.done": "Done",
    "lesson.dismiss": "Skip",
    "theme.custom.title": "Edit your own theme",
    "theme.custom.note": "Change the colours — every change shows immediately. The setting is saved and survives a restart.",
    "colorPicker.family.red": "Red",
    "colorPicker.family.orange": "Orange",
    "colorPicker.family.yellow": "Yellow",
    "colorPicker.family.green": "Green",
    "colorPicker.family.blue": "Blue",
    "colorPicker.family.purple": "Purple",
    "colorPicker.family.pink": "Pink",
    "colorPicker.family.brown": "Brown",
    "colorPicker.family.gray": "Gray",
    "colorPicker.family.black": "Black",
    "colorPicker.shade.light": "light",
    "colorPicker.shade.pale": "pale",
    "colorPicker.shade.medium": "medium",
    "colorPicker.shade.dark": "dark",
    "colorPicker.shade.darkest": "very dark",
    "colorPicker.custom": "Custom colour",
    "theme.custom.colorLabel": "{label} colour picker",
    "theme.custom.primary.bg": "Background colour",
    "theme.custom.primary.surface": "Card colour",
    "theme.custom.primary.ink": "Text colour",
    "theme.custom.primary.accent": "Accent colour",
    "theme.custom.sectionMain": "Base colours",
    "theme.custom.sectionDetail": "Every other colour",
    "theme.custom.previewTitle": "Preview",
    "theme.custom.previewBody": "This is how the journal will look with your colours.",
    "theme.custom.reset": "Reset",
    "theme.custom.save": "Save",
    "theme.custom.savedToast": "Your theme saved 🎨",
    "theme.custom.resetToast": "Your theme reset.",
    "insights.title": "Insights",
    "insights.hintEmpty": "The patterns from your entries show up here.",
    "insights.hintFull": "Patterns and connections from your own data.",
    "insights.empty.title": "No data yet",
    "insights.empty.hint": "Record a few days on the Today tab, and the insights appear after three entries.",
    "insights.empty.cta": "Open the Today tab",
    "insights.week.title": "This week",
    "insights.week.summary": "Average mood: {score}, {days} days",
    "insights.week.avgMood": "average mood (0–100)",
    "insights.week.days": "days journaled",
    "insights.week.avgStress": "average stress",
    "insights.week.avgEnergy": "average energy",
    "insights.trend.title": "How has it been going?",
    "insights.trend.rangeGroup": "Choose a period",
    "insights.trend.rangeWeek": "1 week",
    "insights.trend.rangeMonth": "30 days",
    "insights.trend.rangeAll": "All",
    "insights.trend.tooFew": "The curve needs at least two entries in this period.",
    "insights.trend.scaleNote": "Mood 0–100 points; stress and energy on a ×10 scale so they show on one chart.",
    "insights.trend.summary": "Mood, stress and energy over time",
    "insights.correlation.title": "What affects you?",
    "insights.correlation.summary": "Average per tag and how it differs from other days",
    "insights.correlation.empty": "Mark activities in the daily check-in and we'll show you here which ones lift or lower your mood.",
    "insights.correlation.row": "{count} days · average mood {avg}",
    "insights.correlation.ariaUp": "On average {delta} points better mood",
    "insights.correlation.ariaDown": "On average {delta} points worse mood",
    "insights.more.title": "More insights",
    "insights.more.badge": "Details",
    "insights.more.disclaimer": "The analysis looks at your own entries — not medical advice and not a diagnosis.",
    "onboarding.done": "Done! One tap a day 🌱",
    "onboarding.dialogLabel": "Welcome tour",
    "onboarding.welcome": "Welcome to Belső Iránytű!",
    "onboarding.intro": "A mood journal that learns within minutes what lifts or lowers how you feel. All your data stays on your device.",
    "onboarding.hint": "Three quick questions and we're off.",
    "onboarding.start": "Let's start!",
    "onboarding.trackerQuestion": "What would you like to log each day?",
    "onboarding.trackerHint": "You can change it any time later in Settings.",
    "onboarding.themeQuestion": "How should it look?",
    "onboarding.themeHint": "You can see it right away — and change it later.",
    "onboarding.themeLight": "Light",
    "onboarding.themeDark": "Dark",
    "onboarding.themeVibrant": "Fresh",
    "onboarding.howTitle": "Journaling in three steps",
    "onboarding.howMood": "Pick a mood",
    "onboarding.howTag": "Tap what affected you (optional)",
    "onboarding.howSave": "Save — that's it, less than 5 seconds",
    "onboarding.extrasPhoto": "A photo,",
    "onboarding.extrasVoice": "voice and",
    "onboarding.extrasTrack": "a daily tracker are available in the entry.",
    "onboarding.back": "Back",
    "onboarding.next": "Next",
    "onboarding.begin": "Start journaling",
    "assessment.consentTitle": "Before you begin",
    "assessment.consentBody": "The questionnaire that follows is a self-report list about the last two weeks. It doesn't examine, screen or establish any diagnosis.\n\nYour results stay on your device. Nothing leaves it.\n\nWhat you get is a summary of how you felt over the last two weeks.\n\nYou can turn it off any time in Settings. Once you turn it off, the answers you've already given are deleted too.\n\nSource: {source}",
    "assessment.consentConfirm": "I understand, turn it on",
    "assessment.consentCancel": "Cancel",
    "assessment.moduleTitle": "Self-reflection questionnaire",
    "assessment.moduleStart": "Take it",
    "assessment.summaryEmpty": "No entries yet",
    "assessment.summaryLast": "Last: {date} · {score} pts",
    "assessment.moduleBack": "Back to the list",
    "assessment.itemGroup": "Question {index}",
    "assessment.logTitle": "Earlier self-assessments",
    "assessment.logEmpty": "No self-assessment completed yet.",
    "assessment.resultRetake": "Take it again",
    "assessment.resultShowAll": "Hide answers",
    "assessment.resultHideAll": "Show answers",
    "assessment.notScored": "This question doesn't count towards the total.",
    "assessment.skip": "Skip",
    "assessment.impactGroup": "Impact",
    "assessment.save": "Save",
    "assessment.next": "Next",
    "assessment.exit": "Exit",
    "assessment.maxScore": "{max} points is the highest total.",
    "backup.cloudNote": "The backup goes into your own cloud. We never see it.",
    "backup.lossNote": "If you lose the password or the 12-word code, the backup can't be restored.",
    "backup.notOurs": "This isn't a Belső Iránytű encrypted backup.",
    "backup.runningNote": "The app speaks up when it's time. We don't run in the background: a new file is only made while the app is open.",
    "backup.touchNote": "The browser can't write a file without a click, so a button always starts the backup.",
    "backup.scopeNote": "Attachments, the background image, the API key you set, the screen lock, the card layout and the notification traces don't go into the backup. They stay on the device.",
    "backup.openFailed": "The backup can't be opened with this secret.",
    "backup.keyFailed": "The encryption key couldn't be made. Try again.",
    "backup.fileFailed": "The backup couldn't be made. Try again.",
    "backup.mismatch": "The two passwords don't match.",
    "backup.noSource": "The file can't be read.",
    "backup.restored": "Restored: {entries} entries, {assessments} self-assessments, {keys} settings.",
    "backup.restoredSkipped": "Restored: {entries} entries, {assessments} self-assessments, {keys} settings. ({skipped} unusable items.)",
    "backup.savedAtNever": "No backup has been made yet.",
    "backup.lastSaved": "Last backup: {when}",
    "backup.saved": "Backup made: {when}",
    "backup.offIntro": "Your journal becomes an encrypted file you can store anywhere — Drive, iCloud, a USB stick. Only your keys can open it.",
    "backup.summary": "An encrypted backup on your own storage",
    "backup.enable": "Turn on encrypted backup",
    "backup.setupIntro": "Choose what you'll open the backup with. Two secrets are made: the one you choose now, and a 12-word code you'll see once afterwards.",
    "backup.setupPasskey": "Create a passkey",
    "backup.noPrf": "This browser doesn't give an encryption key (PRF) with a passkey, so we protect the backup with a password.",
    "backup.passwordLabel": "Password",
    "backup.passwordPlaceholder": "At least {min} characters",
    "backup.passwordAgainLabel": "Password again",
    "backup.usePassword": "Password protection",
    "backup.recoveryLead": "Write down the 12 words",
    "backup.recoveryRest": "— this is the backup's second key. If the passkey or the password is gone, only this can open it.",
    "backup.ackLabel": "I've written it down and keep it somewhere safe",
    "backup.ackHint": "This code appears only once. If it's lost, the file can't be opened.",
    "backup.save": "Save",
    "backup.cancel": "Cancel",
    "backup.saveNow": "Back up now",
    "backup.saveCount": "· {count} backups so far",
    "backup.savePasswordLabel": "Password for the backup",
    "backup.saveWithPassword": "Back up with password",
    "backup.restoreFromFile": "Restore from a file",
    "backup.fileLabel": "File: {name}",
    "backup.fileFallback": "The selected file",
    "backup.openWith": "— it can be opened with:",
    "backup.restorePasskey": "Restore with a passkey",
    "backup.restorePasswordLabel": "The file's password",
    "backup.restorePassword": "Restore with a password",
    "backup.restoreCodeLabel": "The 12-word code",
    "backup.restoreCodePlaceholder": "word word word …",
    "backup.restoreCode": "Restore with the code",
    "backup.disable": "Turn off cloud backup",
    "backup.back": "Back",
    "backup.cancelled": "The backup was cancelled, so no file was made.",
    "backup.ready": "Encrypted backup ready ✅",
    "backup.savedNotify": "Backup made ✅",
    "backup.restoredNotify": "Restored ✅",
    "backup.disabled": "Cloud backup is off. The file was left untouched.",
    "backup.passkeyRpName": "Belső Iránytű",
    "backup.passkeyUnsupported": "This browser doesn't support passkey-based backup. Choose password protection.",
    "backup.passkeyNoPrf": "This authenticator doesn't give an encryption key (PRF). Choose password protection.",
    "backup.passkeyCreateFailed": "The passkey couldn't be created.",
    "backup.passkeyInvalidId": "Invalid passkey identifier.",
    "backup.passkeyAborted": "The passkey request was cancelled or not allowed. Try again.",
    "backup.passkeyUnsupportedDevice": "This device doesn't support passkeys.",
    "backup.passkeyAlreadyRegistered": "This passkey is already registered on this device.",
    "backup.passkeyInsecureContext": "Security error: the backup only works over HTTPS or on localhost.",
    "backup.passkeyFailed": "The passkey operation failed. Try again.",
    "backup.passwordTooSimple": "This password is too easy to guess — choose another.",
    "backup.passwordTooShort": "The password must be at least {min} characters.",
    "backup.title": "Encrypted cloud backup",
    "crisis.resourcesTitle": "If you need help",
    "crisis.disclaimer": "This isn't a diagnosis, it's a summary of what you entered. If something worries you, it's worth talking to a professional.",
    "crisis.helpNote": "Free and available day and night. You don't have to check in first.",
    "tools.activity.title": "Your own activity",
    "tools.activity.intro": "Make your own label — it shows up among the daily activities.",
    "tools.activity.iconGroup": "Choose an icon",
    "tools.activity.nameLabel": "New activity's name",
    "tools.activity.placeholder": "Name, e.g. Gardening",
    "tools.activity.add": "Add",
    "tools.activity.added": "Added: {icon} {label}",
    "tools.activity.dupOrLimit": "That label already exists, or you've reached the maximum (24).",
    "tools.activity.needName": "Give the activity a name.",
    "tools.activity.removeLabel": "Delete {label}",
    "tools.activity.summary": "{n} custom labels",
    "tools.activity.summaryEmpty": "No custom labels",
    "tools.breathing.title": "Breathing exercise",
    "tools.breathing.summary": "Guided breathing: quick and full mode",
    "tools.breathing.modeGroup": "Breathing mode",
    "tools.breathing.quick": "Quick mode",
    "tools.breathing.full": "Choose a pattern",
    "tools.breathing.patternGroup": "Breathing pattern",
    "tools.breathing.custom": "Custom",
    "tools.breathing.inLabel": "Inhale (sec)",
    "tools.breathing.holdLabel": "Hold (sec)",
    "tools.breathing.outLabel": "Exhale (sec)",
    "tools.breathing.apply": "Set the pattern",
    "tools.breathing.roundDone": "Full rounds completed: {count}",
    "tools.breathing.length": "Length: {seconds} sec",
    "tools.breathing.finish": "Finish",
    "tools.breathing.start": "Start",
    "tools.breathing.pause": "Pause",
    "tools.breathing.resume": "Resume",
    "tools.habits.title": "Habits and streaks",
    "tools.habits.intro": "Tick it daily — the 🔥 streak shows how many days you've done it without a break.",
    "tools.habits.streakDays": "🔥 {days} days",
    "tools.habits.streakStart": "start today!",
    "tools.habits.weeklySuffix": "/7 this week",
    "tools.habits.weekLabel": "{label}'s last 7 days",
    "tools.habits.iconGroup": "Icon",
    "tools.habits.nameLabel": "New habit's name",
    "tools.habits.placeholder": "New habit, e.g. evening reading",
    "tools.habits.add": "Add",
    "tools.habits.added": "Added: {icon} {label}",
    "tools.habits.dupOrLimit": "One like this already exists, or you've reached the limit ({limit}).",
    "tools.habits.needName": "Give the habit a name.",
    "tools.habits.removeLabel": "Delete {label}",
    "tools.cbt.title": "CBT thought record",
    "tools.cbt.summary": "A seven-step thought record, step by step",
    "tools.cbt.stepSituation": "What happened? (situation)",
    "tools.cbt.stepThought": "What came to mind? (automatic thought)",
    "tools.cbt.stepEmotion": "What did you feel, and how distressing was it?",
    "tools.cbt.stepFor": "What speaks FOR the thought?",
    "tools.cbt.stepAgainst": "What speaks against it?",
    "tools.cbt.stepBalanced": "What is the balanced thought?",
    "tools.cbt.stepAfter": "How distressing is it now?",
    "tools.cbt.progressGroup": "Progress",
    "tools.cbt.situationLabel": "Situation",
    "tools.cbt.situationPlaceholder": "What was the situation? Where, when, with whom?",
    "tools.cbt.thoughtLabel": "Automatic thought",
    "tools.cbt.thoughtPlaceholder": "What ran through your head?",
    "tools.cbt.emotionLabel": "Name of the feeling",
    "tools.cbt.emotionPlaceholder": "A feeling, e.g. anxiety",
    "tools.cbt.distressBefore": "Distress:",
    "tools.cbt.forLabel": "Facts that support the thought",
    "tools.cbt.forPlaceholder": "Facts that support the thought…",
    "tools.cbt.againstLabel": "Facts that weigh against the thought",
    "tools.cbt.againstPlaceholder": "Facts that weigh against it…",
    "tools.cbt.balancedLabel": "Balanced thought",
    "tools.cbt.balancedPlaceholder": "How would you put it fairly, seeing both sides?",
    "tools.cbt.distressAfter": "Distress now:",
    "tools.cbt.shiftBefore": "Before {before} → now {after}.",
    "tools.cbt.shiftBetter": "That much lighter: {points} points. 💪",
    "tools.cbt.shiftSame": "Sometimes a thought is stubborn — looking at it is a result too.",
    "tools.cbt.next": "Next",
    "tools.cbt.back": "Back",
    "tools.cbt.save": "Save",
    "tools.cbt.records": "{count} saved records",
    "tools.cbt.recordsWithAvg": "{count} saved records — average relief: {avg} points",
    "tools.cbt.deleteLabel": "Delete record",
    "tools.experiment.title": "Your own experiment",
    "tools.experiment.intro": "Try one thing for three days and give it a number each evening. The number of days is fixed: it can't be extended.",
    "tools.experiment.whatLabel": "What are you trying?",
    "tools.experiment.whatPlaceholder": "e.g. going to bed 10 minutes earlier every night",
    "tools.experiment.whyLabel": "Why do you think it will help? (optional)",
    "tools.experiment.start": "Start a three-day experiment",
    "tools.experiment.historyTitle": "Finished experiments",
    "tools.experiment.ratingQuestion": "How did you feel today? ({min}–{max})",
    "tools.experiment.ratingGroup": "Your rating for today ({min}–{max})",
    "tools.experiment.noteLabel": "Note (optional)",
    "tools.experiment.notePlaceholder": "e.g. I moved more today",
    "tools.experiment.savedToday": "Today's rating saved",
    "tools.experiment.avgSuffix": "— average so far: {avg}",
    "tools.experiment.workedButton": "It worked",
    "tools.experiment.notWorkedButton": "It didn't work",
    "tools.experiment.abandon": "Give it up",
    "tools.experiment.verdictYes": "worked",
    "tools.experiment.verdictNo": "didn't work",
    "tools.experiment.deleteLabel": "Delete experiment: {what}",
    "tools.library.title": "Library",
    "tools.library.intro": "Short, everyday pieces about what comes up in the journal. Not a diagnosis, just an explanation — if something worries you, it's worth talking to a professional.",
    "tools.library.takeawayLabel": "What matters:",
    "tools.library.actionLabel": "Try this:",
    "tools.library.backToArticle": "← Back",
    "tools.library.backToTopics": "← Topics",
    "tools.library.readMark": "Mark as read",
    "tools.library.readDone": "Read ✓",
    "tools.gratitude.title": "Gratitude journal",
    "tools.gratitude.intro": "One thought a day: what are you grateful for today? Small things count too.",
    "tools.gratitude.textareaLabel": "What are you grateful for today?",
    "tools.gratitude.placeholder": "Today I'm grateful for…",
    "tools.gratitude.saveButton": "Save today's gratitude",
    "tools.gratitude.total": "{count} entries in total",
    "tools.gratitude.saved": "Gratitude recorded 💛",
    "tools.gratitude.alreadyToday": "Today is already recorded — see you tomorrow too! 🌅",
    "tools.gratitude.needText": "Write a short sentence about what you're grateful for.",
    "tools.gratitude.deleteLabel": "Delete gratitude entry",
    "tools.foodPhoto.title": "Meal from a photo",
    "tools.foodPhoto.summary": "Photo-based estimate — you review it before anything is written.",
    "tools.foodPhoto.explainer": "A photo of the meal and the AI gives an estimated nutrition — you review it before anything reaches the journal.",
    "tools.foodPhoto.captureLabel": "Photograph and analyse a meal",
    "tools.foodPhoto.analyzing": "Analysing…",
    "tools.foodPhoto.takePhoto": "Take a photo",
    "tools.foodPhoto.manualStillWorks": "The manual fields work as before.",
    "tools.foodPhoto.error": "The image couldn't be processed — try again.",
    "tools.foodPhoto.written": "Estimated values written in — you can change them any time.",
    "tools.foodPhoto.calories": "Calories (estimated)",
    "tools.foodPhoto.protein": "Protein g (estimated)",
    "tools.foodPhoto.carb": "Carbs g (estimated)",
    "tools.foodPhoto.fat": "Fat g (estimated)",
    "tools.foodPhoto.writeToJournal": "Write into the journal",
    "tools.foodPhoto.discard": "Discard",
    "tools.workouts.title": "Workout programmes",
    "tools.workouts.intro": "Four ready-made programmes. Pick one and start when it suits you — it's meant alongside your journaling habit, not instead of it.",
    "tools.workouts.programTitle": "{label} — {days} days",
    "tools.workouts.recommendedBadge": "· Recommended today",
    "tools.workouts.nutritionTitle": "Nutrition tips",
    "tools.workouts.disclaimer": "These are general lifestyle suggestions — not medical advice. If you have an injury, a chronic illness, or you're pregnant, ask your doctor first.",
    "tools.workouts.safetyNote":
      "If you feel sharp pain, chest pressure, dizziness or shortness of breath, stop — and get help if it does not pass. If you are starting out, keep the first weeks lighter.",
    "tools.title": "Discover",
    "tools.hint": "Practices, self-knowledge and health — in one place, set aside from the day.",
    "tools.therapy.title": "Therapy",
    "tools.self.title": "Self-knowledge",
    "tools.health.title": "Health",
    "tools.experiments.title": "Experiments",
    "tools.learning.title": "Learn",
    "nutrition.meal.breakfast": "Breakfast",
    "nutrition.meal.lunch": "Lunch",
    "nutrition.meal.dinner": "Dinner",
    "nutrition.meal.snack": "Snack",
    "nutrition.allergen.peanut": "Peanut",
    "nutrition.allergen.nut": "Nuts",
    "nutrition.allergen.milk": "Milk",
    "nutrition.allergen.egg": "Egg",
    "nutrition.allergen.gluten": "Gluten",
    "nutrition.allergen.soy": "Soy",
    "nutrition.allergen.fish": "Fish",
    "nutrition.allergen.shellfish": "Shellfish",
    "nutrition.allergen.sesame": "Sesame",
    "nutrition.allergen.sulphite": "Sulphites",
    "tools.nutrition.title": "Meal journal",
    "tools.nutrition.summary": "{kcal} kcal · {protein} g protein · {carb} g carbs · {fat} g fat",
    "tools.nutrition.intro": "Write down what you ate today. The list stays on your own machine and sends nothing.",
    "tools.nutrition.mealGroup": "Which meal",
    "tools.nutrition.foodLabel": "Food",
    "tools.nutrition.foodPlaceholder": "Type a food name…",
    "tools.nutrition.foodAutocomplete": "Food suggestions",
    "tools.nutrition.servingsLabel": "Amount — {name}",
    "tools.nutrition.add": "Add",
    "tools.nutrition.portionLine": "One serving: {portion}, {kcal} kcal.",
    "tools.nutrition.customPortion": "We don't know its nutrition, so only its name goes on the list.",
    "tools.nutrition.allergyWarn": "Allergy: {allergens} — {name}",
    "tools.nutrition.allergyMark": "Allergy: {allergens}",
    "tools.nutrition.allergyNote": "The warning matches the food's NAME, not the real ingredients — in a restaurant it can't know what went onto the plate.",
    "tools.nutrition.allergyHint": "You can mark your allergies on the Diet and allergies card in Settings.",
    "tools.nutrition.mealKcal": "{kcal} kcal",
    "tools.nutrition.mealEmpty": "–",
    "tools.nutrition.itemKcal": "{kcal} kcal",
    "tools.nutrition.removeLabel": "Remove {name} from the list",
    "tools.nutrition.empty": "Nothing on the list today yet.",
    "tools.nutrition.customNote": "Your own foods are logged by name only, so the totals above do not include them.",
    "tools.nutrition.forgetCustom": "Forget {name}",
    "tools.nutrition.note": "The calorie and macro values are indicative estimates per serving, not measurements.",
    "tools.nutrition.dietTitle": "Diet type",
    "tools.nutrition.dietHint": "Pick what suits you — you can switch any time.",
    "tools.nutrition.dietNone": "No diet chosen yet.",
    "tools.nutrition.dietActive": "Active diet: {diet}",
    "tools.nutrition.dietClear": "Clear selection",
    "tools.nutrition.diet.paleo": "Paleo",
    "tools.nutrition.diet.keto": "Keto",
    "tools.nutrition.diet.mediterranean": "Mediterranean",
    "tools.nutrition.diet.vegetarian": "Vegetarian",
    "tools.nutrition.diet.vegan": "Vegan",
    "tools.nutrition.diet.raw": "Raw",
    "tools.nutrition.diet.low-carb": "Low-carb",
    "tools.nutrition.diet.high-protein": "High-protein",
    "tools.nutrition.diet.gluten-free": "Gluten-free",
    "tools.nutrition.diet.lactose-free": "Lactose-free",
    "tools.nutrition.diet.pescatarian": "Pescatarian",
    "tools.nutrition.diet.other": "Other",
    "tools.nutrition.dietNote":
      "Choosing a diet is your decision, not medical advice. If you follow one for a health reason, check it with a doctor or dietitian.",
    "tools.nutrition.menuTitle": "Weekly menu",
    "tools.nutrition.menuHint": "Seven days from the diet you picked — a suggestion, not a prescription.",
    "tools.nutrition.menuNone": "Pick a diet above and the weekly menu appears here.",
    "tools.nutrition.menuOther": "There is no ready menu for \u201cOther\u201d — this list does not know its rules.",
    "tools.nutrition.menuAdd": "Let this be today",
    "tools.nutrition.menuNote": "The menu is composed from the foods above, with the same estimates.",
    "tools.nutrition.menuSkipped": "Left out because of an allergy: {items}",
    "settings.allergies.title": "Diet and allergies",
    "settings.allergies.summary": "{on} / {total} allergens marked",
    "settings.allergies.off": "No allergens marked",
    "settings.allergies.note": "Whatever you mark here is what the meal journal warns about when a food's name contains it.",
    "settings.allergies.legend": "Allergens",
    "settings.allergies.limit": "This list is a reminder, not medical advice: always check the warning yourself too.",
    "tools.fitness.title": "Workout plans and log",
    "tools.fitness.summary": "{plans} plans · {sessions} workouts in the log",
    "tools.fitness.intro": "Take a ready-made plan, or build your own from days and exercises. Everything stays on your own machine.",
    "tools.fitness.templates": "Suggested plans",
    "tools.fitness.adopt": "Choose",
    "tools.fitness.adoptLabel": "Choose {name} as your own plan",
    "tools.fitness.templateDays": "{days} days",
    "tools.fitness.myPlans": "Your own plans",
    "tools.fitness.noPlans": "No plans of your own yet — pick a suggested plan, or create a new one.",
    "tools.fitness.planDays": "{days} days",
    "tools.fitness.deletePlanLabel": "Delete {name}",
    "tools.fitness.newPlanLabel": "New plan's name",
    "tools.fitness.newPlanPlaceholder": "e.g. Morning circuit",
    "tools.fitness.create": "Create",
    "tools.fitness.emptyPlan": "This plan has no days yet.",
    "tools.fitness.addDay": "Add a day",
    "tools.fitness.newDayLabel": "New day's name",
    "tools.fitness.newDayPlaceholder": "e.g. Day A — full body",
    "tools.fitness.removeDayLabel": "Delete the day {name}",
    "tools.fitness.logDay": "Log today",
    "tools.fitness.logDayLabel": "Log {name} for today",
    "tools.fitness.exerciseName": "Exercise name",
    "tools.fitness.exercisePlaceholder": "e.g. Squat",
    "tools.fitness.sets": "Sets",
    "tools.fitness.reps": "Reps",
    "tools.fitness.weight": "Weight in kg",
    "tools.fitness.addExercise": "Add exercise",
    "tools.fitness.removeExerciseLabel": "Remove {name} from the day",
    "tools.fitness.progressLine": "{name}: {sessions} workouts, best {best} kg",
    "tools.fitness.progressBody": "{name}: {sessions} workouts with body weight",
    "tools.fitness.progressReps": "{name}: {sessions} workouts, best {best} reps",
    "tools.fitness.progressHold": "{name}: {sessions} workouts, best {best} seconds held",
    "tools.fitness.nextWeight": "next up {kg} kg",
    "tools.fitness.nextReps": "next up {reps} reps",
    "tools.fitness.nextHold": "next up {seconds} seconds",
    "tools.fitness.recent": "Recent workouts",
    "tools.fitness.type.strength": "Strength",
    "tools.fitness.type.cardio": "Cardio",
    "tools.fitness.type.mobility": "Mobility",
    "tools.fitness.type.hiit": "HIIT",
    "tools.fitness.type.yoga": "Yoga",
    "tools.fitness.type.walking": "Walking",
    "tools.fitness.restDay": "Rest day",
    "tools.fitness.markRest": "Mark as a rest day",
    "tools.fitness.unmarkRest": "Make it a training day",
    "tools.fitness.restNote": "Rest day — nothing to log. The day stays in the plan.",
    "tools.fitness.suggestTitle": "Today's suggestion",
    "tools.fitness.suggestNone": "Nothing to suggest yet — pick a template or build a plan and the next session shows up here.",
    "tools.fitness.suggestFirst": "This would be the first session in the log: {plan} — {day}.",
    "tools.fitness.suggestTrain": "Your last session was {days} days ago. Next up: {plan} — {day}.",
    "tools.fitness.suggestRest": "You already logged a session today — rest. Next up: {plan} — {day}.",
    "tools.fitness.progressTitle": "Progress by exercise",
    "tools.fitness.progressNone": "Log some workouts and this is where your progress per exercise shows up.",
    "tools.fitness.chartTitle": "Progress: {name}",
    "tools.fitness.chartNoteKg": "The chart shows the weights you logged, session by session.",
    "tools.fitness.chartNoteReps": "The chart shows the reps (or seconds) you logged, session by session.",
    "tools.fitness.noLog": "No workouts logged yet.",
    "tools.fitness.exerciseSuffix": "{n} exercises",
    "tools.fitness.volume": "{volume} kg volume",
    "tools.fitness.removeLogLabel": "Delete {name} ({date}) from the log",
    "tools.fitness.planNote": "The plans are movement sequences, not a personalised training plan. If you're unsure, ask a professional.",
    "gad7.title": "Tension and worry",
    "gad7.summary": "{n}/7 answered",
    "gad7.intro": "Seven questions about the last two weeks. Nothing is saved: your answers live only while this card is open.",
    "gad7.itemGroup": "Question {index}",
    "gad7.incomplete": "Answer all seven questions and I'll add it up.",
    "gad7.submit": "Sum up",
    "gad7.score": "{score} points / {max}",
    "gad7.resultNote": "This summary isn't saved and leaves no history. If you fill it in again, you'll only see the new answers.",
    "gad7.again": "Fill it in again",
    "gad7.provenance": "The questions are an adaptation in our own words of the GAD-7 (Spitzer, Kroenke, Williams & Löwe, 2006). The original questionnaire is in the public domain.",
    "background.fitChoiceSoft": "Soft fill",
    "background.fitChoiceCover": "Fill",
    "background.fitChoiceContain": "Whole image",
    "background.paletteChoiceImage": "From the image",
    "background.paletteChoiceTheme": "My theme",
    "background.errorStorage": "Not enough storage for the background image.",
    "background.errorType": "Only an image can be chosen (image/*).",
    "background.errorTooLarge": "The background image is too large (maximum 8 MB).",
    "voice.systemPrompt": "You receive a journal entry in English.\nYour job: extract the structured measures, and answer with valid JSON ONLY, with English text in the \"note\" field.\nSchema:\n{\n  \"mood\": 1-5 (1=very bad, 3=neutral, 5=very good; null if unclear),\n  \"stress\": 1-10 (null if not mentioned),\n  \"energy\": 1-10 (null if not mentioned),\n  \"sleepHours\": number (null if not mentioned),\n  \"restingHr\": number, resting pulse (null if not mentioned),\n  \"activities\": at most 4 short noun activity labels (e.g. \"Exercise\", \"Work\", \"Family\"),\n  \"note\": a 1-2 sentence, restrained summary of the entry\n}",
    "voice.activityExercise": "Exercise",
    "voice.activityWork": "Work",
    "voice.activityFamily": "Family",
    "voice.activitySocial": "Company",
    "voice.activityRest": "Rest",
    "voice.activityStudy": "Study",
    "report.title": "Belső Iránytű — wellbeing report",
    "report.made": "Made: {date}",
    "report.summary": "Summary",
    "report.days": "Number of days: {count}",
    "report.avgMood": "Average mood (0–100): {value}",
    "report.avgStress": "Average stress (1–10): {value}",
    "report.avgEnergy": "Average energy (1–10): {value}",
    "report.quadrantDays": "4-quadrant days: {list}",
    "report.moodChart": "How mood has been",
    "report.recent": "Recent days",
    "report.colDate": "Date",
    "report.colMood": "Mood",
    "report.colStress": "Stress",
    "report.colEnergy": "Energy",
    "report.trackers": "Tracking",
    "report.assessments": "Self-reflection summary",
    "report.footer": "The report was made from your own journal data — not medical advice, not a diagnosis.",
    "report.quadrantHighNeg": "tense-active",
    "report.quadrantHighPos": "bright-active",
    "report.quadrantLowNeg": "low-restless",
    "report.quadrantLowPos": "calm-content",
    "analysis.needMore": "A few more entries and I can give you insights — the analysis starts after three.",
    "analysis.highStress": "Your average stress is high ({stress}/10). Take a look at which activities or days push it up.",
    "analysis.lowStress": "Your average stress is low ({stress}/10) — a good direction.",
    "analysis.lowEnergy": "Your energy is often low. More rest or movement could help.",
    "analysis.sameMood": "The mood in your last 3 entries is the same ({mood}).",
    "analysis.bestTag": "On days marked “{tag}” your mood is on average {delta} points better.",
    "analysis.worstTag": "After “{tag}” your mood is usually {delta} points worse.",
    "analysis.stressDays": "You reported stress of 8 or higher on {days} days.",
    "analysis.balanced": "This looks like a balanced stretch — keep watching the patterns.",
    "dates.weekdayMon": "Mon",
    "dates.weekdayTue": "Tue",
    "dates.weekdayWed": "Wed",
    "dates.weekdayThu": "Thu",
    "dates.weekdayFri": "Fri",
    "dates.weekdaySat": "Sat",
    "dates.weekdaySun": "Sun",
    "yearInPixels.monthJan": "Jan",
    "yearInPixels.monthFeb": "Feb",
    "yearInPixels.monthMar": "Mar",
    "yearInPixels.monthApr": "Apr",
    "yearInPixels.monthMay": "May",
    "yearInPixels.monthJun": "Jun",
    "yearInPixels.monthJul": "Jul",
    "yearInPixels.monthAug": "Aug",
    "yearInPixels.monthSep": "Sep",
    "yearInPixels.monthOct": "Oct",
    "yearInPixels.monthNov": "Nov",
    "yearInPixels.monthDec": "Dec",
    "correlation.mood": "Mood",
    "correlation.stress": "Stress",
    "correlation.energy": "Energy",
    "correlation.sleep": "Sleep",
    "cardStates.noData": "— no data today yet",
    "lock.noPin": "No PIN is set.",
    "lock.tooManyAttempts": "Too many attempts — I need a short pause.",
    "lock.wrongPin": "Wrong PIN.",
    "attachments.errorStorage": "Not enough storage for the attachment.",
    "attachments.errorTooLarge": "The file is too large (maximum 5 MB).",
    "attachments.errorVideoType": "Only a video file can be chosen (video/*).",
    "backup.dueNote": "It's time to back up again. Settings → Encrypted cloud backup.",
    "backup.writeFailed": "The backup failed. Try again.",
    "backup.pickerMissing": "This browser can't pick a file.",
    "backup.notAllowed": "The browser didn't allow the file operation.",
    "backup.ioFailed": "The file operation failed. Try again.",
    "backup.pickerDescription": "Belső Iránytű backup",

    // THE MANUAL UPDATE — `components/AppUpdateCard.tsx`. Five keys, and the card
    // is the one place a reader can act on "I still see the old version": the
    // button drops every cache and reloads, and the note says so BEFORE it is
    // pressed rather than after.
    "update.cardTitle": "Clear cache and reload",
    "update.note":
      "If the newest version has not arrived — an old layout, old wording — this button drops everything: it clears the caches, stops the app instance running in the background and reloads the page.",
    "update.action": "Update the app",
    "update.busy": "Updating…",
    "update.failed":
      "The browser would not reload the page. Close the tab and open it again — the caches have already been cleared.",
    "update.stuckGuide":
      "If that does not help: 1) close every tab and reopen the app; 2) if you still see the old version, open the developer tools (F12) and use Application → Service Workers → Unregister, then Application → Storage → Clear site data; 3) finally Ctrl+Shift+R.",
    "stale.title": "This page is running an old version",
    "stale.body":
      "A background worker is serving an earlier version. This button clears every cache and loads the page at a fresh address.",
    "ai.title": "AI assistant",
    "ai.summary": "Weekly summary on-device or with your own key",
    "ai.modeGroup": "How should it work?",
    "ai.modeOff": "Off",
    "ai.modeOffHint": "No download and no network request: the app sends nothing anywhere.",
    "ai.modeOnDevice": "Runs on this device",
    "ai.modeOnDeviceHint":
      "A small language model runs in your browser. Download it once and it works without a network afterwards.",
    "ai.modeByok": "With your own key",
    "ai.modeByokHint":
      "Your own key asks an external provider for text, using only this week's entries.",
    "ai.providerGroup": "Provider",
    "ai.providerOpenai": "OpenAI",
    "ai.providerDeepseek": "DeepSeek",
    "ai.hostNotice": "The request goes to {host} and carries this week's data only.",
    "ai.keyLabel": "API key",
    "ai.saveKey": "Save key",
    "ai.clearKey": "Delete key",
    "ai.keySaved": "Saved: {masked}",
    "ai.keySessionNote":
      "The key lasts only as long as this tab is open — it never enters your journal or your backup, and it is never written anywhere else.",
    "ai.download": "Download the model ({mb} MB)",
    "ai.downloading": "Downloading: {percent}%",
    "ai.modelReady": "The model is ready and runs on this device.",
    "ai.delete": "Delete the model",
    "ai.deleteConfirm":
      "Delete the downloaded model? This frees the space, but you will have to download it again before the next use.",
    "ai.deleted": "Model deleted.",
    "ai.deleteError": "The model could not be deleted.",
    "ai.errorOff": "AI is off. You can switch it on under Settings → Other.",
    "ai.errorNoKey": "No API key saved.",
    "ai.errorInvalidKey": "The provider rejected the key.",
    "ai.errorRateLimited": "Too many requests — try again in a moment.",
    "ai.errorNetwork": "Network error, it did not work this time.",
    "ai.errorTimeout": "Timed out: the request took too long.",
    "ai.errorBadResponse": "The answer was not usable.",
    "ai.errorModel": "The local model could not be loaded.",
    "ai.promptIntro": "You are writing the weekly summary of the reader's own journal, in English.",
    "ai.promptStyle": "Write 3–5 short sentences, in a friendly tone, as a single paragraph.",
    "ai.promptGround":
      "Work only from the data given, invent no detail, and say when the data is thin.",
    "ai.promptQuestion": "Write the weekly summary from this data:",
    "insights.ai.section": "Weekly AI summary",
    "insights.ai.title": "Weekly AI summary",
    "insights.ai.summary": "Writes a short text from this week's entries",
    "insights.ai.generate": "Write the summary",
    "insights.ai.busy": "Thinking…",
    "insights.ai.off":
      "AI is off. Switch it on under Settings → Other if you want a text about this week.",
    "insights.ai.empty": "There is not a single entry for this week.",
    "insights.ai.privacyNote": "The model sees this week's data only.",
    "insights.ai.machineNote": "Machine-written — read it critically.",
  },
  de: {
    "meditation.title": "Meditationen",
    "tools.meditation.summary": "Kurze, zeitgesteuerte Übungen in Stille",
    "meditation.group": "Übung",
    "meditation.progress": "Verstrichene Zeit",
    "meditation.start": "Starten",
    "meditation.finish": "Beenden",
    "meditation.restart": "Neu starten",
    "meditation.pause": "Pause",
    "meditation.resume": "Weiter",
    "meditation.remaining": "Verbleibend: {time}",
    "meditation.summary": "{minutes} Min. · {total} insgesamt",
    "meditation.complete": "Fertig. Wenn du Zeit hast, lass die Stille ein paar Sekunden stehen.",
    "settings.title": "Einstellungen",
    "settings.hint": "Mach die App zu deiner.",
    "settings.profile.title": "Profil",
    "settings.profile.summary": "Name und Ziel angeben",
    "settings.profile.nameLabel": "Dein Name (wie wir dich nennen)",
    "settings.profile.namePlaceholder": "z. B. Anna",
    "settings.profile.goalLabel": "Warum nutzt du die App?",
    "settings.profile.goalPlaceholder": "z. B. um besser auf mich zu achten",
    "settings.profile.save": "Speichern",
    "settings.profile.saved": "Einstellungen gespeichert ⚙️",
    "settings.accessibility.title": "Leichter zu bedienen",
    "settings.accessibility.size": "{size} Schriftgröße",
    "settings.accessibility.contrastSummary": "hoher Kontrast",
    "settings.accessibility.note": "Größere Schrift und stärkerer Kontrast — jederzeit umschaltbar.",
    "settings.accessibility.sizeGroup": "Schriftgröße",
    "settings.accessibility.contrastLabel": "Hoher Kontrast",
    "settings.accessibility.contrastHint": "Stärkere Farben, klarere Schrift.",
    "settings.size.normal": "Normal",
    "settings.size.large": "Groß",
    "settings.size.xlarge": "Sehr groß",
    "settings.language.title": "Sprache",
    "settings.language.summary": "{language} Oberfläche",
    "settings.language.note": "Jeder Text der App wechselt in diese Sprache. Der Wechsel lädt die Seite neu, damit auch die Namen der Tage und Monate umstellen.",
    "settings.language.group": "Die Sprache der Oberfläche",
    "language.hu": "Magyar",
    "language.en": "English",
    "language.de": "Deutsch",
    "settings.font.title": "Schriftart",
    "settings.font.summary": "{main} · Handschrift: {hand}",
    "settings.iconset.title": "Symbole und Emoji",
    "settings.nav.title": "Navigation",
    "settings.nav.summaryAuto": "Die untere Leiste versteckt sich beim Scrollen",
    "settings.nav.summaryFixed": "Die untere Leiste ist immer sichtbar",
    "settings.nav.summaryReordered": "Tabs umsortiert",
    "settings.nav.note": "Die untere Leiste ist standardmäßig immer sichtbar. Wenn du das einschaltest, versteckt sie sich beim Scrollen nach unten und kommt zurück, sobald du nach oben scrollst.",
    "settings.nav.hideLabel": "Untere Leiste beim Scrollen verstecken",
    "settings.nav.hideHint": "Mehr Platz zum Lesen. Bleibt aus, wenn dein System reduzierte Bewegung verlangt.",
    "settings.nav.tabOrderGroup": "Reihenfolge der Tabs",
    "settings.nav.tabOrderTitle": "Reihenfolge der Tabs",
    "settings.nav.tabOrderNote": "Die Reihenfolge der Schaltflächen in der unteren Leiste. Mit den Pfeilen umsortierbar.",
    "settings.nav.tabUp": "{n}. {name} nach vorn",
    "settings.nav.tabDown": "{n}. {name} nach hinten",
    "settings.nav.resetNotify": "Standardreihenfolge wiederhergestellt.",
    "settings.nav.reset": "Standardreihenfolge wiederherstellen",
    "settings.sections.orderTitle": "Reihenfolge",
    "settings.sections.orderNote": "Die Reihenfolge der Karten. Mit den Pfeilen umsortierbar.",
    "settings.sections.moveUp": "{n}. {name} nach vorn",
    "settings.sections.moveDown": "{n}. {name} nach hinten",
    "settings.sections.reset": "Standardreihenfolge wiederherstellen",
    "settings.sections.start": "Karten umsortieren",
    "settings.sections.stop": "Fertig",
    "settings.sections.resetDone": "Standardreihenfolge wiederhergestellt.",
    "entry.deleteTitle": "Diesen Eintrag löschen?",
    "entry.detail.aria": "Eintragsdetails",
    "entry.detail.close": "Schließen",
    "entry.detail.sleep": "Schlaf: {hours} Stunden",
    "entry.detail.stressField": "Stress: {value}/10",
    "entry.detail.energyField": "Energie: {value}/10",
    "entry.detail.pulse": "Puls: {value}",
    "entry.detail.noteLabel": "Notiz",
    "entry.detail.trackersTitle": "Verfolgung",
    "entry.detail.reflectionTitle": "Reflexion",
    "entry.detail.feeling": "Gefühl: {value}",
    "entry.detail.stressReason": "Anspannung: {value}",
    "entry.detail.need": "Bedürfnis: {value}",
    "entry.detail.delete": "Löschen",
    "entry.detail.edit": "Bearbeiten",
    "entry.detail.moodAria": "Stimmung ändern",
    "entry.detail.cancel": "Abbrechen",
    "entry.detail.save": "Speichern",
    "entry.detail.deleteMessage": "Dieser Eintrag wird endgültig entfernt. Dieser Schritt lässt sich nicht rückgängig machen.",
    "entry.detail.savedToast": "Eintrag aktualisiert ✏️",
    "entry.detail.deletedToast": "Eintrag gelöscht 🗑",
    "tracker.deleteTitle": "Diesen Tracker löschen?",
    "customTrackers.title": "Eigene Tracker",
    "customTrackers.intro": "Verfolgst du etwas, das die eingebauten nicht abdecken? Füge einen eigenen Tagestracker hinzu — er erscheint im Tageseintrag (max. {max}).",
    "customTrackers.emojiLabel": "Emoji",
    "customTrackers.nameLabel": "Name des Trackers",
    "customTrackers.namePlaceholder": "z. B. Wasser, Schmerz, Dosis…",
    "customTrackers.kindLabel": "Typ des Trackers",
    "customTrackers.kindSlider": "Schieberegler",
    "customTrackers.kindCheckbox": "Häkchen",
    "customTrackers.kindText": "Text",
    "customTrackers.minLabel": "Kleinster Wert",
    "customTrackers.maxLabel": "Größter Wert",
    "customTrackers.limitReached": "Du hast das Limit von {max} Trackern erreicht.",
    "customTrackers.duplicateName": "Ein Tracker mit diesem Namen existiert schon.",
    "customTrackers.added": "{icon} {label} hinzugefügt ✅",
    "customTrackers.kindSliderShort": "Schieberegler",
    "customTrackers.sliderRange": "{kind} ({min}–{max})",
    "customTrackers.kindCheckboxShort": "Häkchen",
    "customTrackers.kindTextShort": "Text",
    "customTrackers.deleteLabel": "{label} löschen",
    "customTrackers.deleteMessage": "Der Tracker „{label}“ verschwindet aus dem Tageseintrag. Werte, die in älteren Einträgen gespeichert sind, bleiben erhalten.",
    "customTrackers.confirmDelete": "Ja, löschen",
    "customTrackers.deleted": "Tracker gelöscht.",
    "goals.title": "Heutige Ziele",
    "goals.empty": "Setz dir 1–3 kleine, erreichbare Ziele für heute.",
    "goals.progress": "{done}/{total} erledigt — {percent}%",
    "goals.deleteLabel": "\"{text}\" löschen",
    "goals.newLabel": "Neues Tagesziel",
    "goals.newPlaceholder": "Neues Ziel, z. B. 10 Minuten Spaziergang",
    "common.add": "Hinzufügen",
    "foodAi.title": "Essens-KI — Fotoanalyse",
    "foodAi.summary": "Schätzung per Foto — standardmäßig aus.",
    "foodAi.toggleLabel": "Essens-KI einschalten",
    "foodAi.toggleHint": "Geschätzte Nährwerte aus einem Foto, in die Mahlzeitenfelder. Standardmäßig aus.",
    "foodAi.dataBefore": "Das hochgeladene Bild und dein Schlüssel gehen an {host}",
    "foodAi.dataAfter": "und sonst nirgendwohin, an niemanden sonst. Der Schlüssel wird in deinem Browser gespeichert, nie weitergegeben und kann jederzeit gelöscht werden.",
    "foodAi.costLabel": "Kosten:",
    "foodAi.costBody": "jede Analyse kostet etwa $0.01–0.02 auf deiner OpenAI-Rechnung (Modell {model}).",
    "foodAi.keyLabel": "OpenAI-API-Schlüssel",
    "foodAi.saveKey": "Schlüssel speichern",
    "foodAi.clearKey": "Schlüssel löschen",
    "foodAi.savedKey": "Gespeicherter Schlüssel: {key}",
    "healthImport.title": "Smartwatch-Import",
    "healthImport.summary": "Apple-Health- oder Google-Fit-Daten einlesen — optional.",
    "healthImport.intro": "Einen Export von Apple Health (.xml) oder Google Fit (.json) einlesen. Die Daten bleiben in deinem Browser; wir füllen nur Tage auf, die du schon hast — was du von Hand eingetragen hast, gewinnt immer.",
    "healthImport.hrLabel": "Herzfrequenz und Blutsauerstoff",
    "healthImport.hrHint": "Zwei neue Tracker hinter einem Schalter. Standardmäßig aus — der Import schreibt nur hinein, wenn du das hier einschaltest.",
    "healthImport.stubsLabel": "Leere Tage für die importierten Daten anlegen",
    "healthImport.stubsHint": "Standardmäßig aus: nur Tage, für die du schon einen Eintrag geschrieben hast, werden aktualisiert.",
    "healthImport.fileLabel": "Exportdatei",
    "healthImport.errorUnparseable": "Die Datei ist nicht lesbar — ist das sicher eine Exportdatei?",
    "healthImport.errorUnrecognized": "Die Datei hat ein unbekanntes Format.",
    "healthImport.errorTooLarge": "Die Datei ist zu groß für den Browser.",
    "healthImport.previewTitle": "Vorschau",
    "healthImport.previewLead": "— was sich ändern würde:",
    "healthImport.previewRow": ": {count} Tage im Export",
    "healthImport.previewApplies": "{count} ausfüllbar",
    "healthImport.previewPreserved": "{count} beibehalten (deins bleibt)",
    "healthImport.skippedWillCreate": "{count} Tage haben keinen Eintrag — ein Eintrag wird angelegt.",
    "healthImport.skippedSkipped": "{count} Tage haben keinen Eintrag — diese werden übersprungen.",
    "healthImport.apply": "Übernehmen",
    "healthImport.nothingApplies": "Mit dieser Einstellung lässt sich kein Wert ausfüllen.",
    "healthImport.nothingToWrite": "Nichts zu importieren — jeder Wert ist schon da.",
    "healthImport.optionalFooter": "Keine Smartwatch? Jeder Wert lässt sich von Hand eintragen — diese Karte ist optional.",
    "install.bannerTitle": "Auf den Startbildschirm installieren",
    "install.bannerBody": "Nutze die App über ihr eigenes Symbol, im Vollbild — alle Daten bleiben weiterhin auf deinem Gerät.",
    "install.bannerAction": "Installieren",
    "install.bannerDismiss": "Ausblenden",
    "install.done": "Installiert — gutes Journaling! 🧭",
    "install.cardTitle": "Als App",
    "install.notOffered": "Dein Browser hat die Installation noch nicht angeboten. Die App funktioniert im Browser genauso vollständig — sobald dein Telefon sie anbietet, erscheint hier der Knopf.",
    "install.offered": "Leg die App auf den Startbildschirm: Vollbild, funktioniert offline, und alle Daten bleiben lokal.",
    "install.cardAction": "Jetzt installieren",
    "iconset.intro": "Solange du hier nichts wählst, sieht alles aus wie bisher.",
    "iconset.contentNote": "Inhaltssymbole — Stimmungen, Aktivitäten, Meilensteine — folgen dem Set. Knöpfe und Formularelemente ({count} Symbole) bleiben bewusst Strichzeichnungen: ein 3D-„+“ oder Schlüsselbund ist nicht lesbarer, nur voller.",
    "iconset.groupLabel": "Symbolset wählen",
    "iconset.noneLabel": "Nicht gesetzt",
    "iconset.noneBlurb": "Das aktuelle Aussehen — so wie du es bisher gesehen hast.",
    "iconset.chromeSummary": "Warum bleiben {count} Symbole Strichzeichnungen? (die ganze Liste)",
    "iconset.chromeBody": "Ein Symbol würde dem Set folgen, wenn es ein Bild dafür gäbe. Knöpfe und Formularelemente sind nicht so: das Zeichen selbst ist die Beschriftung, und eine glänzende Illustration liest sich auf mehr Fläche schlechter. Diese Liste ist genau das, was bewusst Strichzeichnung bleibt, mit dem Grund je Gruppe.",
    "iconset.licencesHeading": "Lizenzen",
    "iconset.inUse": "in Verwendung",
    "meds.times.title": "Medikamentenzeiten",
    "meds.times.empty": "Lege zuerst Medikamente im Bereich Gesundheit des Tabs Entdecken an, dann kannst du hier Zeiten festlegen und eine Erinnerung einschalten.",
    "meds.times.reminderNote": "Die Erinnerung meldet sich, solange die App läuft — es gibt keinen Server, der im Hintergrund wacht. Als installierte App (PWA) funktioniert das sogar im Hintergrund; auf dem iPhone musst du sie dafür installieren.",
    "meds.times.count": "{count}/{max} Zeiten",
    "meds.times.none": "Noch keine Zeit festgelegt.",
    "meds.times.add": "Uhrzeit",
    "meds.times.maxReached": "Du hast das Maximum erreicht ({max}).",
    "meds.times.reminderLabel": "Erinnerung: {name}",
    "meds.times.reminderHint": "Schalte sie aus, wenn du keine Erinnerung für dieses Medikament möchtest.",
    "pin.gate.label": "Sperre aufheben",
    "pin.gate.title": "Belső Iránytű ist gesperrt",
    "pin.gate.body": "Gib deine PIN ein, um fortzufahren.",
    "pin.gate.submit": "Entsperren",
    "pin.gate.forgotBefore": "Vergessen? Wir speichern die PIN nicht — nirgends, bei niemandem. Wenn du sie nicht mehr weißt, bleibt nur",
    "pin.gate.forgotEmphasis": "alle Daten löschen",
    "pin.gate.forgotAfter": "und neu anfangen. Wenn du dein Tagebuch behalten willst, exportiere es vorher unter Einstellungen → Daten und Sicherung.",
    "week.textPlaceholder": "Du kannst ein, zwei Sätze schreiben…",
    "week.textLabel": "Wöchentliche Reflexion",
    "week.save": "Gespeichert",
    "week.skip": "Diese Woche überspringen",
    "lag.summaryEmpty": "Braucht mindestens 4 Einträge und 2 gleiche Aktivitäten",
    "lag.summaryFilled": "Wie {count} Aktivitäten die nächsten 2 Tage beeinflussen",
    "lag.intro": "Manche Aktivitäten wirken erst 1–2 Tage später. Hier siehst du, wie sich die Stimmung an den Tagen nach der Aktivität entwickelt hat.",
    "lag.needsData": "Dafür braucht es mindestens 4 Einträge und mindestens 2 gleiche Aktivitäten.",
    "lag.daysLabel": "{count} Tage später",
    "lag.cellDay0": "heute",
    "lag.titleDay0": "Am Tag der Aktivität",
    "lag.cellDay1": "+1 Tag",
    "lag.titleDay1": "Am nächsten Tag",
    "lag.cellDay2": "+2 Tage",
    "lag.titleDay2": "Zwei Tage später",
    "lag.cellBaseline": "Basis",
    "lag.titleBaseline": "Durchschnitt der anderen Tage",
    "lag.disclaimer": "Das Delta bezieht sich auf den Durchschnitt der Tage ohne diese Aktivität (Stimmungspunkte, 0–100). Bei weniger als zwei Stichproben rechnen wir nicht.",
    "export.summary": "PDF oder CSV aus {count} Einträgen",
    "export.intro": "Eine druckbare Zusammenfassung für Fachpersonen: Überblick, Stimmungskurve und eine Tabelle der letzten Tage — oder eine vollständige CSV für deine eigene Auswertung.",
    "export.busy": "Wird erstellt…",
    "export.pdfAction": "PDF-Bericht",
    "export.csvAction": "CSV-Export",
    "export.cost": "Beim ersten Erstellen eines PDFs werden etwa {compressed} kB geladen ({raw} kB unkomprimiert) — der größte Download der App, und nur einmal. Danach speichert dein Browser ihn und er funktioniert offline. Der CSV-Export lädt nichts.",
    "export.disclaimer": "Der Bericht entsteht lokal aus deinen eigenen Daten — nichts geht auf einen Server.",
    "font.sample": "So bewahre ich die Erinnerung an das Feuer.",
    "font.sampleBold": "Guten Tag",
    "font.intro": "Wähle eine Schriftart — die ganze App wechselt sofort.",
    "font.groupLabel": "Schriftart wählen",
    "font.handGroupLabel": "Handschriftliche Schriftart",
    "font.handTitle": "Handgeschrieben",
    "font.handNote": "Gilt nur für deinen eigenen Text. Knöpfe, Menüs und Formulare bleiben immer in der Schriftart oben.",
    "font.selfHostedNote": "Die Schriftarten kommen von unserem eigenen Server und bleiben auf deinem Gerät — es wird kein externer Dienst aufgerufen.",
    "font.recommended": "Empfohlen",
    "font.noDownload": "kein Download",
    "font.kbSize": "ca. {kb} kB",
    "reminder.title": "Tägliche Erinnerung",
    "reminder.intro": "Eine sanfte tägliche Erinnerung — kein Push-Dienst, kein Drängen. Wenn die App geschlossen ist, wartet der Hinweis einfach bis zum nächsten Öffnen.",
    "reminder.toggleLabel": "Erinnerung einschalten",
    "reminder.permissionDenied": "Benachrichtigungen sind nicht erlaubt — die Einstellung bleibt stumm.",
    "reminder.stateGranted": "Erlaubt ✓",
    "reminder.stateBlocked": "Im Browser blockiert — erlaube es in der Adressleiste.",
    "reminder.stateUnsupported": "Dieser Browser unterstützt keine Benachrichtigungen.",
    "reminder.stateAsk": "Wir fragen beim Einschalten nach Erlaubnis.",
    "reminder.timeLabel": "Uhrzeit",
    "reminder.messageLabel": "Erinnerungstext",
    "reminder.nextAt": "Nächste Erinnerung: {when} ({time})",
    "reminder.inHoursMinutes": "in etwa {h} Std. {m} Min.",
    "reminder.inMinutes": "in etwa {m} Min.",
    "weather.title": "Wetter automatisch",
    "weather.summary": "Automatisches Ausfüllen — standardmäßig aus.",
    "weather.whatLeaves": "open-meteo.com bekommt den Ortsnamen (oder, wenn du es einschaltest, die Koordinaten deines Geräts) — und nur das. Kein Konto, kein Schlüssel, keine anderen Daten.",
    "weather.toggleLabel": "Automatisches Wetter",
    "weather.toggleHint": "Das Tagebuchformular füllt die Wetterfelder mit den abgerufenen Daten. Du kannst sie jederzeit von Hand überschreiben.",
    "weather.errorNoLocation": "Gib zuerst deinen Ort an.",
    "weather.errorDenied": "Der Browser hat den Standort nicht herausgegeben — du kannst ihn von Hand eintragen.",
    "weather.errorFetch": "Der Abruf hat gerade nicht geklappt — die manuellen Felder funktionieren wie bisher.",
    "weather.cityLabel": "Ort",
    "weather.cityPlaceholder": "z. B. Budapest",
    "weather.cityNote": "Das ist der Ausgangsort. Solange es eingeschaltet ist, ist er immer der Standard.",
    "weather.gpsLabel": "Standort des Geräts",
    "weather.gpsHint": "Fragt den Browser nach Koordinaten statt nach dem Ortsnamen — eine eigene Erlaubnis, nur an diesen Schalter gebunden.",
    "weather.probeCached": "Heutige Daten aus dem Cache: {value}.",
    "weather.probeFresh": "Heutige Daten: {value}.",
    "weather.noReadableValue": "der Dienst hat keinen lesbaren Wert geliefert",
    "weather.tryBusy": "Wird abgerufen…",
    "weather.tryNow": "Heutige Daten jetzt abrufen",
    "weather.conditionSunny": "sonnig",
    "weather.conditionCloudy": "bewölkt",
    "weather.conditionRainy": "regnerisch",
    "weather.conditionSnowy": "Schneefall",
    "weather.conditionFoggy": "neblig",
    "quadrants.sleepTitle": "Quadrant und Schlaf",
    "insights.notEnoughData": "Noch nicht genug Daten",
    "quadrants.emotion.emptyHint": "Halte dasselbe Gefühl an mindestens zwei Tagen mit Kontext fest — danach zeigen wir, womit es einhergeht.",
    "quadrants.emotion.listLabel": "Gefühl und Kontext gemeinsam",
    "quadrants.emotion.row": "{emotion} — mit {context} an {together}/{days} Tagen ({percent}%)",
    "quadrants.sleep.emptyHint": "Mit zwei Schlafwerten in einem Quadranten vergleichen wir sie schon mit den anderen Tagen.",
    "quadrants.sleep.listLabel": "Durchschnittlicher Schlaf nach Quadrant",
    "quadrants.sleep.fewData": "wenig Daten",
    "quadrants.sleep.hours": "{hours} Stunden",
    "quadrants.sleep.delta": "({sign}{delta} gegenüber den anderen)",
    "insights.patterns.confidenceStrong": "starkes Signal",
    "insights.patterns.confidenceMedium": "mittleres Signal",
    "insights.patterns.confidenceWeak": "schwaches Signal",
    "insights.patterns.count": "{count} Muster",
    "insights.patterns.basis": "Berechnet aus deinem ganzen Tagebuch, {count} Einträge — nicht nur aus dem Zeitraum oben.",
    "insights.patterns.sample": "auf Basis von {count} Tagen",
    "insights.patterns.disclaimer": "Das sind Zusammenhänge in deinen eigenen Daten, keine Ursachen. Kein medizinischer Rat und keine Diagnose.",
    "insights.grid.summary": "{rows} Aktivitäten × {cols} messbare Ergebnisse",
    "insights.grid.explain": "Zeilen: Aktivitäten · Spalten: messbare Ergebnisse. Jede Zelle zeigt, wie stark der Durchschnitt an Tagen mit der Aktivität abweicht (▲ gute Richtung, ▼ schlechte Richtung). Eine Zelle braucht mindestens {min} Tage.",
    "insights.grid.emptyHint": "Noch nicht genug Daten — markiere deine Aktivitäten im Tageseintrag, dann erscheinen die Muster nach ein paar Tagen hier.",
    "insights.grid.tableLabel": "Wirkungsmatrix",
    "insights.grid.rowHeader": "Aktivität",
    "insights.grid.tooFewSamples": "Weniger als {min} Werte",
    "insights.grid.flat": "Kein nennenswerter Unterschied ({count} Tage)",
    "insights.grid.effectLarger": "Punkte höher",
    "insights.grid.effectSmaller": "Punkte niedriger",
    "insights.grid.effectBetter": "Punkte besser",
    "insights.grid.effectWorse": "Punkte schlechter",
    "insights.grid.cellEffect": "{label}: {delta} {effect} ohne sie ({count} Tage)",
    "background.errorLoad": "Das Bild konnte nicht geladen werden.",
    "background.busy": "Wird geladen…",
    "background.replace": "Bild ersetzen",
    "background.choose": "Bild auswählen",
    "background.emptyHint": "Wähle ein Bild von deinem Gerät und mach es zum Hintergrund der App. Das Bild bleibt nur auf diesem Gerät — nichts wird hochgeladen.",
    "background.sampleCard": "Beispielkarte — bei 100 % Transparenz scheint das Hintergrundbild durch und der Text bleibt auf der Abdeckung.",
    "background.scrimLabel": "Hintergrundabdeckung",
    "background.cardAlphaLabel": "Transparenz der Karten",
    "background.cardAlphaHint": "Dieser Regler blendet nur die Karten ab, er bewegt die Abdeckung nicht — bei 100 % scheint das Bild durch, und der Regler Hintergrundabdeckung macht den Text lesbar.",
    "background.blurLabel": "Hintergrund weichzeichnen",
    "background.percent": "{value} Prozent",
    "background.fitLabel": "Bildgröße",
    "background.fitAria": "Wie das Hintergrundbild erscheint",
    "background.fitCover": "Füllen: das Bild wird gestreckt, um den Bildschirm zu füllen — bei einem großen Bild kann es unscharf werden.",
    "background.fitContain": "Ganzes Bild: das ganze Bild ist in seiner Größe zu sehen, mit leeren Streifen.",
    "background.fitSoft": "Weiches Füllen: das ganze Bild in seiner Größe, die Streifen werden mit demselben Bild weichgezeichnet gefüllt.",
    "background.paletteLabel": "Farbe der Abdeckung",
    "background.paletteAria": "Woher die Farbe der Abdeckung kommt",
    "background.paletteHighContrast": "Hoher Kontrast ist an: die Abdeckung ist deckend und trägt die Farbe des Themas, die Bildfarbe zählt nicht.",
    "background.paletteImage": "Aus dem Bild: die Abdeckung trägt ihre eigene Farbe, aber hell oder dunkel des Themas bleibt.",
    "background.paletteTheme": "Mein Thema: eine einheitliche Abdeckung, hell oder dunkel — je nach Thema.",
    "background.remove": "Bild entfernen",
    "app.name": "Belső Iránytű",
    "app.greetingNight": "Gute Nacht",
    "app.greetingMorning": "Guten Morgen",
    "app.greetingDay": "Schönen Tag",
    "app.greetingEvening": "Guten Abend",
    "app.greetingNamed": "{part}, {name}!",
    "app.greetingAnonymous": "{part}!",
    "app.streakTitle": "Aufeinanderfolgende Tage mit Einträgen",
    "app.streakChip": "{count} Tage",
    "app.navLabel": "Hauptnavigation",
    "app.insightsFailed": "Die Ansicht Analyse lässt sich gerade nicht laden. Öffne sie einmal online erneut.",
    "app.insightsLoading": "Analyse wird geladen…",
    "stats.monthLabel": "Monat",
    "stats.yearLabel": "Jahr",
    "stats.summary": "{period} · {count} Tage mit Einträgen",
    "stats.yearAvgMood": "{year} durchschnittliche Stimmung im Jahr",
    "stats.yearDaysTotal": "{year} Tage mit Einträgen insgesamt",
    "stats.avgMoodScale": "durchschnittliche Stimmung (0–100)",
    "stats.avgStressScale": "durchschnittlicher Stress (1–10)",
    "stats.avgEnergyScale": "durchschnittliche Energie (1–10)",
    "yearInPixels.yearLabel": "Jahr",
    "yearInPixels.monthLabel": "Monat",
    "yearInPixels.noEntry": "kein Eintrag",
    "yearInPixels.gridLabel": "Stimmungskalender {month}",
    "yearInPixels.pickPrompt": "Wähle einen Tag im Kalender.",
    "achievements.summary": "{earned} / {total} Auszeichnungen",
    "achievements.emptyTitle": "Regelmäßiges Tagebuchschreiben bringt kleine Auszeichnungen — starte die Serie!",
    "achievements.keepGoing": "{earned} Auszeichnungen erreicht — mach weiter, es gibt mehr!",
    "achievements.newBadge": "NEU",
    "trackers.sectionTitle": "Verfolgung",
    "trackers.frameSummary": "{n} Einträge für heute",
    "iconPolicy.group.gombok": "Knöpfe",
    "iconPolicy.group.jelzesek": "Anzeigen",
    "iconPolicy.group.berendezes": "Bedienelemente",
    "iconPolicy.group.meroszamok": "Kennzahlen",
    "iconPolicy.reason.plus": "ein „+“ ist in 3D nicht lesbarer",
    "iconPolicy.reason.x": "Schließen",
    "iconPolicy.reason.check": "fertig",
    "iconPolicy.reason.trash": "Löschen",
    "iconPolicy.reason.pencil": "Bearbeiten",
    "iconPolicy.reason.save": "Speichern",
    "iconPolicy.reason.upload": "Hochladen",
    "iconPolicy.reason.download": "Herunterladen",
    "iconPolicy.reason.mic": "Sprachaufnahme",
    "iconPolicy.reason.square": "Stoppen",
    "iconPolicy.reason.chevronDown": "eine Richtungsanzeige",
    "iconPolicy.reason.search": "das Suchfeld",
    "iconPolicy.reason.sliders": "die Regler zum Einstellen",
    "iconPolicy.reason.eye": "Anzeigen oder Verbergen",
    "iconPolicy.reason.lockIcon": "das Schloss",
    "iconPolicy.reason.shieldAlert": "Schutz",
    "iconPolicy.reason.bell": "die Erinnerung",
    "iconPolicy.reason.mapPin": "ein Ort",
    "iconPolicy.reason.paperclip": "ein Anhang",
    "iconPolicy.reason.link": "ein Link",
    "iconPolicy.reason.settings": "das Symbol des Menüs",
    "iconPolicy.reason.calendar": "das Datumsfeld",
    "iconPolicy.reason.calendarDays": "einen Tag wählen",
    "iconPolicy.reason.clock": "eine Uhrzeit",
    "iconPolicy.reason.hourglass": "eine Zeitachse",
    "iconPolicy.reason.layoutGrid": "der Ansichtswechsel",
    "iconPolicy.reason.table": "eine Tabelle",
    "iconPolicy.reason.palette": "der Farbeditor",
    "iconPolicy.reason.image": "das Hintergrundbild wählen",
    "iconPolicy.reason.type": "Schriftgröße",
    "iconPolicy.reason.clipboardList": "die Listenansicht",
    "iconPolicy.reason.fileText": "eine Datei",
    "iconPolicy.reason.history": "Verlauf",
    "iconPolicy.reason.barChart": "der Rahmen des Diagramms",
    "iconPolicy.reason.lightbulb": "eine Idee",
    "iconPolicy.reason.smartphone": "die Installationsanfrage",
    "iconPolicy.reason.phone": "die Hilfstelefonnummer",
    "iconPolicy.reason.messageCircle": "eine Sprechblase",
    "iconPolicy.reason.briefcase": "der Kasten des Tabs Entdecken",
    "iconPolicy.reason.wind": "die Atembewegung",
    "iconPolicy.reason.ban": "die Datenschutzliste",
    "iconPolicy.reason.scale": "die Karte des Gleichgewichts-Scores",
    "iconPolicy.reason.target": "ein Ziel",
    "iconPolicy.reason.zap": "Energie",
    "iconPolicy.reason.activity": "Stress",
    "iconPolicy.reason.moon": "die Karte des Schlafvergleichs",
    "font.categoryNote.sans": "Klar und für Text gemacht. Nebeneinander kaum zu unterscheiden — das ist ihr eigentlicher Unterschied.",
    "font.categoryNote.serif": "Buchartig, mit kleinen Strichen. Angenehm für lange Texte.",
    "font.categoryNote.rounded": "Rund und freundlich. Auch für Kinder gedacht.",
    "font.categoryNote.condensed": "Schmal und hoch. Großer Text passt auch auf wenig Platz.",
    "font.categoryNote.mono": "Jedes Zeichen ist gleich breit. Für Daten und Zahlen.",
    "font.systemLabel": "System",
    "font.systemHint": "Die Schriftart deines Geräts. Lädt nichts herunter, wie du es auch ansiehst.",
    "font.interHint": "Neutral und sehr gut lesbar. Für Zeitungen und Oberflächen gemacht.",
    "font.montserratHint": "Breite, geometrische Buchstaben. Modern und luftig.",
    "font.robotoHint": "Vertraut und zurückhaltend. Auch in kleiner Schrift gut lesbar.",
    "font.latoHint": "Sanft menschlich, warm gezeichnet. In ungarischen Schriftformen zu Hause.",
    "font.playfairDisplayHint": "Ein sehr eleganter Serif. Hervorragend für Überschriften, nicht für kleinen Text.",
    "font.loraHint": "Ein warmer, literarischer Serif. Das Gefühl eines alten Hardcover-Bands.",
    "font.quicksandHint": "Rund und weich. Freundlich, weniger formell.",
    "font.sairaCondensedHint": "Schmal und hoch. Derselbe Text passt auf halbem Raum.",
    "font.jetBrainsMonoHint": "Jeder Buchstabe ist gleich breit. Ein codiges, technisches Gefühl.",
    "font.handOffLabel": "Aus",
    "font.handOffHint": "Deine Notizen erscheinen in derselben Schriftart wie die App.",
    "font.dancingScriptHint": "Eine Handschrift-Schriftart, nur für deine eigenen Notizen. Nicht für Knöpfe oder Menüs.",
    "font.retiredReason.manrope": "noch immer unter Googles Schriftarten zu finden",
    "font.retiredReason.plusJakartaSans": "noch immer unter Googles Schriftarten zu finden",
    "weather.placeGps": "Standort",
    "reminder.messageMood": "Eine Minute — wie fühlst du dich gerade? 🌱",
    "reminder.messageRecord": "Halte den heutigen Tag fest, bevor du ihn vergisst 💙",
    "reminder.messageTwoMinutes": "Zwei Minuten für dich: eine Stimmung und ein Gedanke 🧭",
    "foodAi.promptIntro": "Du bist ein Ernährungsanalyst. Auf dem Bild ist eine Mahlzeit zu sehen.",
    "foodAi.promptSchema": "Antworte ausschließlich mit gültigem JSON, mit genau diesem Satz von Feldern:",
    "foodAi.promptFields": "{\"calories\": Zahl in kcal, \"protein\": Gramm, \"carbs\": Gramm, \"fat\": Gramm,",
    "foodAi.promptDescription": "\"description\": ein kurzer Satz auf Deutsch darüber, was auf dem Bild zu sehen ist}.",
    "foodAi.promptNotFood": "Wenn kein Essen zu sehen ist, sollen alle Zahlen 0 sein und die description das sagen.",
    "foodAi.promptQuestion": "Was ist auf dem Bild? Geschätzte Nährwerte, mit einer Beschreibung auf Deutsch.",
    "foodAi.macros": "Protein {protein} g · Kohlenhydrate {carbs} g · Fett {fat} g",
    "foodAi.maskedKey": "{head}…•••• ({length} Zeichen)",
    "foodAi.errorNoKey": "Gib zuerst deinen OpenAI-Schlüssel in den Einstellungen an.",
    "foodAi.errorInvalidKey": "OpenAI hat den Schlüssel nicht akzeptiert — prüfe ihn in den Einstellungen.",
    "foodAi.errorRateLimited": "Zu viele Anfragen in kurzer Zeit — versuch es in einer Minute erneut.",
    "foodAi.errorTimeout": "Zeitüberschreitung — die Analyse des Bildes hat zu lange gedauert.",
    "foodAi.errorNetwork": "Netzwerkfehler — das Bild konnte gerade nicht analysiert werden.",
    "foodAi.errorBadResponse": "Die Antwort von OpenAI war nicht lesbar.",
    "healthImport.seriesHr": "Herzfrequenz",
    "healthImport.seriesSpo2": "Blutsauerstoff",
    "healthImport.seriesSleep": "Schlaf (Stunden)",
    "healthImport.seriesSteps": "Schrittzahl",
    "onboarding.trackerSleep": "Schlaf",
    "onboarding.trackerSymptoms": "Symptome",
    "onboarding.trackerVitamins": "Vitamine",
    "onboarding.trackerWeather": "Wetter",
    "settings.sections.lessons": "Mikro-Lektion",
    "settings.groups.personal": "Persönlich",
    "settings.groups.appearance": "Aussehen",
    "settings.groups.navigation": "Menüleiste",
    "settings.groups.tracking": "Verfolgte Daten",
    "settings.groups.reminders": "Erinnerungen",
    "settings.groups.security": "Sicherheit",
    "settings.groups.data": "Sicherung und Export",
    "settings.groups.misc": "Sonstiges",
    "settings.sections.reflection": "Wöchentliche Reflexion",
    "settings.sections.year": "Stimmungskalender",
    "insights.year.summary": "Jeder Tag des Jahres, ein Pixel",
    "settings.sections.lag": "Welche Aktivität kam später zurück?",
    "settings.sections.quadrants": "Gefühl und Kontext",
    "settings.sections.export": "Berichtsexport",
    "settings.sections.stats": "Monats- und Jahresstatistiken",
    "settings.sections.achievements": "Meilensteine",
    "settings.sections.grid": "Wirkungsmatrix",
    "settings.sections.patterns": "Muster in deinem Tagebuch",
    "settings.theme.title": "Thema",
    "settings.theme.fallback": "Hell",
    "settings.theme.note": "Wähle ein Aussehen — die ganze App wechselt sofort.",
    "settings.theme.group": "Thema wählen",
    "settings.bg.title": "Hintergrundbild",
    "settings.bg.set": "Eigenes Bild gesetzt",
    "settings.bg.unset": "Nicht gesetzt",
    "settings.bg.inkWarning":
      "Die aktuellen Einstellungen erreichen den WCAG-AA-Kontrast nicht. Erhöhe den Schleier oder verringere die Kartentransparenz.",
    "settings.bg.veilFloorNotice":
      "Wegen des Hintergrundbilds wurde der Schleier auf {value} % erhöht, damit der Text lesbar bleibt.",
    "settings.nutrition.title": "Ernährungstipps",
    "settings.nutrition.summary": "Transparenz: was darf das Tagebuch sagen?",
    "settings.nutrition.note": "Das Tagebuch ist kein Berater und kein Diätplan — es spiegelt nur zurück, was du festgehalten hast. Im Tab Heute kann einer von zwei Sätzen erscheinen, wenn eine Regel passt:",
    "settings.nutrition.example1": "Eine schöne Balance. Gemüse und Eiweiß sind eine gute Kombination.",
    "settings.nutrition.example2": "Fast Food passt manchmal dazu. Versuch morgen auch ein Gemüsegericht.",
    "settings.nutrition.weekNote": "Die Karte Wochenzusammenfassung rechnet aus mehr als drei Tagen Kalorienschätzungen und zeigt manchmal eine ruhige Anmerkung:",
    "settings.sport.title": "Bewegungstipps",
    "settings.sport.summary": "Transparenz: was darf ein Bewegungseintrag sagen?",
    "settings.sport.note": "Neben einem Bewegungseintrag kann mindestens ein Satz erscheinen — Anerkennung oder ein kleiner nächster Schritt. Einige der möglichen:",
    "settings.sport.example1": "30 Minuten Laufen — schön. Erholung zählt auch: trink Wasser.",
    "settings.sport.example2": "15 Minuten Spaziergang — jede Bewegung zählt.",
    "settings.sport.programsNote": "Die Karte Trainingsprogramme schaut auf die Bewegungseinträge dieser Woche und zeigt, welches Programm zu dir passt — immer nur als Vorschlag.",
    "settings.trackers.title": "Verfolgung",
    "settings.trackers.summary": "{on} / {total} Gruppen an",
    "settings.trackers.note": "Schalte ein, was du täglich zu deinem Eintrag festhalten willst.",
    "settings.modules.title": "Module",
    "settings.modules.summary": "{on} / 5 Module an",
    "settings.modules.note": "Zeig nur, was du brauchst — der Rest bleibt verborgen.",
    "settings.modules.energyLabel": "Energie-Regler",
    "settings.modules.energyHint": "Tägliches Energieniveau neben der Stimmung festhalten.",
    "settings.modules.reflectionLabel": "Selbstreflexion",
    "settings.modules.reflectionHint": "Drei kurze Fragen zum Tagesende.",
    "settings.modules.vitalsLabel": "Körperwerte (Schlaf, Puls, HRV)",
    "settings.modules.vitalsHint": "Von der Smartwatch oder von Hand eintragen.",
    "settings.modules.medsLabel": "Medikamentenerinnerung",
    "settings.modules.medsHint": "Die Medikamente, die du täglich nehmen musst.",
    "settings.modules.assessLabel": "Selbstreflexions-Fragebogen",
    "settings.modules.assessHint": "Eine Selbsteinschätzung in zwei Minuten über die letzten zwei Wochen.",
    "settings.mood.title": "Stimmung festhalten",
    "settings.mood.summaryNew": "Neu: 4-Quadranten",
    "settings.mood.summaryOld": "Alt: 5 Stufen",
    "settings.mood.note": "Du kannst zwischen zwei Modi wählen. Ältere Einträge erscheinen unter beiden.",
    "settings.mood.group": "Wie die Stimmung festgehalten wird",
    "settings.mood.newName": "Neu: 4-Quadranten",
    "settings.mood.newDesc": "Ein Stimmungsmesser, ein Gefühl und Kontext, in drei Schritten.",
    "settings.mood.oldName": "Alt: 5 Stufen",
    "settings.mood.oldDesc": "Die gewohnten Smileys in einer Reihe.",
    "settings.disable.title": "Ausschalten?",
    "settings.disable.message": "Gespeicherte Selbsteinschätzungen werden gelöscht. Das lässt sich nicht rückgängig machen.",
    "settings.disable.confirm": "Ausschalten und löschen",
    "settings.disable.cancel": "Abbrechen",
    "settings.pin.title": "Sperre",
    "settings.pin.privacyNote": "Die PIN bleibt auf deinem Gerät, und im Browserspeicher liegt nur ein verschlüsselter Fingerabdruck — die PIN selbst speichern wir nicht. Das ist ein Bequemlichkeits- und Datenschutzschutz gegen Neugierige, keine Verschlüsselung: das Tagebuch selbst bleibt im Speicher des Geräts lesbar.",
    "settings.pin.start": "PIN festlegen",
    "settings.pin.chooseHint": "Wähle {min}–{max} Ziffern, die sich nicht wiederholen und keine Folge wie 1234 sind.",
    "settings.pin.newPlaceholder": "Neue PIN",
    "settings.pin.repeatPlaceholder": "PIN erneut",
    "settings.pin.newRepeatPlaceholder": "Neue PIN erneut",
    "settings.pin.currentPlaceholder": "Aktuelle PIN",
    "settings.pin.save": "Speichern",
    "settings.pin.cancel": "Abbrechen",
    "settings.pin.change": "PIN ändern",
    "settings.pin.turnOff": "Ausschalten",
    "settings.pin.turnOffNote": "Gib deine aktuelle PIN ein, um auszuschalten.",
    "settings.pin.turnOffConfirm": "Sperre ausschalten",
    "settings.pin.sessionNote": "Das Entsperren gilt für die Sitzung: nach 15 Minuten ohne Nutzung sperrt sie wieder, und am nächsten Tag. Bei vergessener PIN gibt es keinen Weg zurück — nur alle Daten löschen —, exportiere also vorher, wenn du dein Tagebuch behalten willst.",
    "settings.pin.lengthError": "Die PIN muss {min}–{max} Ziffern haben.",
    "settings.pin.weakError": "Diese PIN ist zu leicht zu erraten — wähle eine andere.",
    "settings.pin.mismatchError": "Die beiden PINs stimmen nicht überein.",
    "settings.pin.setDone": "PIN festgelegt 🔒",
    "settings.pin.changedDone": "PIN geändert 🔒",
    "settings.pin.turnedOff": "Sperre ausgeschaltet.",
    "settings.voice.title": "Eintrag aus Sprache",
    "settings.voice.badge": "Experimentell",
    "settings.voice.summary": "Stimmung, Stress, Energie und Aktivitäten aus Sprache",
    "settings.voice.note": "Erzähl deinen Tag, und die App zieht Stimmung, Stress, Energie und Aktivitäten heraus.",
    "settings.voice.noteLlm": "Die Erkennung erfolgt mit künstlicher Intelligenz.",
    "settings.voice.noteOffline": "Ohne Schlüssel nutzt sie eine einfache, offline arbeitende Textanalyse.",
    "settings.voice.emptyWarn": "Diktiere oder schreib zuerst etwas.",
    "settings.voice.savedLlm": "Aus Sprache aktualisiert (KI) 🎙️",
    "settings.voice.savedOffline": "Aus Sprache aktualisiert (Offline-Analyse) 🎙️",
    "settings.voice.unsupported": "Dieser Browser unterstützt keine Spracherkennung. Tippe es stattdessen ein — die Verarbeitung funktioniert genauso.",
    "settings.voice.textAreaLabel": "Der Text des Tagebucheintrags",
    "settings.voice.placeholder": "Beschreib deinen Tag in einem Satz…",
    "settings.voice.makeEntry": "Eintrag erstellen",
    "settings.voice.start": "Sprache starten",
    "settings.voice.stop": "Stoppen",
    "settings.voice.vitalsNote": "Es zieht auch Puls und Schlaf heraus, wenn du sie erwähnst.",
    "settings.voice.resultLabel": "Der erkannte Text, bearbeitbar",
    "settings.voice.resultPlaceholder": "Was du gesagt hast, erscheint hier — bearbeitbar.",
    "settings.voice.makeEntryFrom": "Einen Eintrag daraus machen",
    "settings.voice.vitalsToggleLabel": "Modul Körperwerte",
    "settings.voice.vitalsToggleHint": "Puls und Schlaf aus dem Text herausziehen.",
    "settings.data.title": "Daten und Sicherung",
    "settings.data.badge": "Details",
    "settings.data.summary": "Export, Import und Löschen aller Daten",
    "settings.data.csvExport": "CSV-Export",
    "settings.data.jsonExport": "JSON-Sicherung",
    "settings.data.fileImport": "Dateiimport",
    "settings.data.importNote": "Der Import führt Einträge mit demselben Datum zusammen, damit nichts verloren geht.",
    "settings.data.deleteAll": "Alle Daten löschen",
    "settings.data.csvDone": "CSV heruntergeladen 📤",
    "settings.data.jsonDone": "JSON-Sicherung heruntergeladen 📤",
    "settings.data.jsonRestoredWith": "JSON wiederhergestellt: {entries} Einträge, {assessments} Selbsteinschätzungen ✅",
    "settings.data.jsonRestored": "JSON wiederhergestellt: {entries} Einträge ✅",
    "settings.data.jsonNoEntries": "Die JSON enthält keine Einträge.",
    "settings.data.importNone": "Ich habe keine importierbaren Zeilen gefunden.",
    "settings.data.imported": "{count} Einträge importiert ✅",
    "settings.data.importFailed": "Die Datei konnte nicht verarbeitet werden.",
    "settings.data.resetTitle": "Alles löschen?",
    "settings.data.resetMessage": "Alle Einträge, Ziele und Einstellungen werden von diesem Gerät entfernt. Es lohnt sich, vorher eine JSON-Sicherung zu machen.",
    "settings.data.resetConfirm": "Ja, alles löschen",
    "settings.data.resetDone": "Alle Daten gelöscht.",
    "settings.privacy.title": "Datenschutz",
    "settings.privacy.summary": "Alle Daten bleiben auf diesem Gerät.",
    "settings.privacy.local": "Alle Daten werden auf deinem eigenen Gerät gespeichert (Browserspeicher).",
    "settings.privacy.noAccount": "Kein Konto, kein Hochladen — die App sendet Daten nirgendwohin.",
    "settings.privacy.noAds": "Keine Werbung und kein Tracking.",
    "settings.privacy.export": "Du kannst jederzeit als CSV exportieren oder alles löschen.",
    "today.title": "Heutiger Check-in",
    "today.hint": "Drei Schritte: Stimmung, Gefühle, speichern.",
    "today.heroHint": "Hier gehört dein heutiger Eintrag hin. Wähle eine Stimmung und speichere — weniger als eine Minute.",
    "today.saved": "Gespeichert. Gut gemacht! 🌱",
    "today.savedBadge": "✅ Gespeichert",
    "today.save": "💾 Speichern",
    "today.moodRequired": "Wähle zuerst eine Stimmung aus den Smileys.",
    "today.mood.title": "Wie geht es dir heute?",
    "today.mood.summaryLabel": "Heute:",
    "today.mood.prompt": "Markiere, wie du dich gerade fühlst — weniger als eine Minute.",
    "today.mood.record": "Stimmung festhalten",
    "today.mood.group": "Stimmung wählen",
    "today.weather.denied": "Der Standort ist nicht erlaubt — das Wetter lässt sich von Hand eintragen.",
    "today.weather.unavailable": "Das Wetter konnte gerade nicht abgerufen werden — du kannst es von Hand eintragen.",
    "today.weather.cached": "Wetter aus dem Cache geladen.",
    "today.weather.cachedTemp": "Wetter aus dem Cache geladen ({temp} °C).",
    "today.weather.live": "Wetter geladen.",
    "today.weather.liveTemp": "Wetter geladen ({temp} °C).",
    "today.slider.stress": "Stress",
    "today.slider.energy": "Energie",
    "today.noteLabel": "Notiz (optional)",
    "today.notePlaceholder": "Was ist heute passiert? Warum fühlst du dich so?",
    "today.balance.title": "Gleichgewichts-Score",
    "today.balance.high": "Das sieht nach einem ausgeglichenen Tag aus. 🌟",
    "today.balance.mid": "Ein machbarer Tag — kleine Schritte zählen. 🌱",
    "today.balance.low": "Heute war ein schwererer Tag. Auch das sind Daten, und morgen ist eine neue Seite. 💙",
    "today.activities.title": "Was hat dich heute beeinflusst?",
    "today.activities.note": "Daraus errechnet die App, welche Aktivitäten deine Stimmung heben oder senken.",
    "today.weeklyNutrition.title": "Wochenzusammenfassung",
    "today.weeklyNutrition.summary": "{days} Tage diese Woche, durchschnittlich {avg} kcal.",
    "today.weeklyNutrition.summarySafety": "Sicherheitshinweis aktiv",
    "today.reflection.saved": "Reflexion gespeichert 🧠",
    "today.reflection.title": "Kurze Selbstreflexion",
    "today.reflection.feeling": "Was war heute dein stärkstes Gefühl?",
    "today.reflection.stressReason": "Was hat die meiste Anspannung verursacht?",
    "today.reflection.need": "Was brauchst du gerade?",
    "today.reflection.save": "Reflexion speichern",
    "today.reflection.summaryFilled": "Ausgefüllt",
    "today.reflection.summaryEmpty": "Noch nicht ausgefüllt",
    "today.vitals.saved": "Körperdaten gespeichert 📈",
    "today.vitals.title": "Körperwerte",
    "today.vitals.sleep": "Schlaf (Stunden)",
    "today.vitals.restingHr": "Ruhepuls (Schläge/Min.)",
    "today.vitals.hrv": "HRV (ms)",
    "today.vitals.save": "Daten speichern",
    "today.vitals.note": "Wir tragen sie später in die Stimmungskurve ein.",
    "today.vitals.summary": "{n}/3 Werte erfasst",
    "today.meds.added": "Medikament hinzugefügt 💊",
    "today.meds.title": "Medikamente",
    "today.meds.empty": "Füge deine Medikamente hinzu und hake sie ab, wenn du sie genommen hast.",
    "today.meds.nameLabel": "Name des neuen Medikaments",
    "today.meds.placeholderExample": "z. B. Vitamin D",
    "today.meds.placeholderMore": "Weiteres Medikament…",
    "today.meds.add": "Hinzufügen",
    "today.meds.nextDose": "Nächste Dosis: {time} · {name}",
    "today.meds.nextDoseWithAmount": "Nächste Dosis: {time} · {name} — {amount}",
    "today.meds.summary": "{on}/{total} Medikamente eingenommen",
    "today.question.title": "Frage des Tages",
    "today.question.bestMoment": "Was war heute dein schönster Moment?",
    "today.question.stress": "Was hat heute Anspannung verursacht?",
    "today.question.need": "Wovon hättest du mehr gebraucht?",
    "today.question.learning": "Was hast du heute über dich gelernt?",
    "today.question.energy": "Was hat dir heute Energie gegeben?",
    "today.question.gratitude": "Wofür bist du heute dankbar?",
    "today.question.answerLabel": "Antwort auf die Frage des Tages",
    "today.question.answerPlaceholder": "Schreib es kurz auf…",
    "today.question.save": "Antwort speichern",
    "today.question.saved": "Antwort gespeichert 💭",
    "today.question.summaryAnswered": "Beantwortet",
    "today.question.summaryOpen": "Noch nicht beantwortet",
    "journal.streak": "Serie von {streak} Tagen",
    "journal.streakNote": "Jeder ausgefüllte Tag bringt dich dir selbst näher.",
    "journal.prevMonth": "Voriger Monat",
    "journal.today": "Heute",
    "journal.nextMonth": "Nächster Monat",
    "journal.calendarGroup": "Stimmungskalender",
    "journal.calendar.summary": "Ein Monat der Stimmungen, ein Feld pro Tag",
    "journal.dayWithMood": "{date}: {mood}",
    "journal.dayEmpty": "{date}: kein Eintrag",
    "journal.search.title": "Suche und Filter",
    "journal.search.badge": "Details",
    "journal.search.placeholder": "Notizen und Stimmungen durchsuchen…",
    "journal.search.label": "Im Tagebuch suchen",
    "journal.search.filterGroup": "Nach Stimmung filtern",
    "journal.filter.all": "Alle",
    "journal.filter.good": "Gute Tage",
    "journal.filter.mid": "Mittlere",
    "journal.filter.rough": "Schwere Tage",
    "journal.results": "{found} von {total} Einträgen.",
    "journal.entriesTitle": "Einträge",
    "journal.empty.title": "Diese Seite ist noch leer",
    "journal.empty.hint": "Einträge, die du im Tab Heute festhältst, sammeln sich hier.",
    "journal.empty.cta": "Tab Heute öffnen",
    "attachments.title": "Anhänge",
    "attachments.photo": "Foto",
    "attachments.stopRecording": "Aufnahme stoppen",
    "attachments.recordAudio": "Ton aufnehmen",
    "attachments.audioFile": "Audiodatei",
    "attachments.video": "Video",
    "attachments.videoHint": "Kurzes Video: max. 5 MB (etwa 10–30 Sekunden).",
    "attachments.photoAlt": "Angehängtes Foto",
    "attachments.removeLabel": "Anhang löschen",
    "attachments.photoSaveError": "Das Foto konnte nicht gespeichert werden.",
    "attachments.videoSaveError": "Das Video konnte nicht gespeichert werden.",
    "attachments.audioSaveError": "Der Ton konnte nicht gespeichert werden.",
    "attachments.recordUnsupported": "Dieses Gerät oder dieser Browser unterstützt keine Tonaufnahme — wähle stattdessen eine Datei.",
    "attachments.micFailed": "Das Mikrofon konnte nicht gestartet werden.",
    "recording.aria": "Stimmung festhalten",
    "recording.meterAria": "Stimmungsmesser",
    "recording.energyAxis": "Energie ↑",
    "recording.pleasantnessAxis": "Angenehmheit →",
    "recording.step1Title": "Wie fühlst du dich gerade?",
    "recording.step2Title": "Welches Gefühl?",
    "recording.step3Title": "Was ist los?",
    "recording.step1Sub": "Setz den Punkt auf die Karte — Energie von oben nach unten, Angenehmheit von links nach rechts.",
    "recording.step3Sub": "Alles kann übersprungen werden — nur was stimmt.",
    "recording.liveStep1": "Stimmungsmesser: Energie {energy}, Angenehmheit {pleasantness}",
    "recording.liveStep2": "Gefühl wählen",
    "recording.liveStep3": "Kontext",
    "recording.meterValueText": "Energie {energy} / 10, Angenehmheit {pleasantness} / 10, {quadrant}",
    "recording.emotionsAria": "Gefühle",
    "recording.other": "Anderes",
    "recording.customPlaceholder": "Dein eigenes Wort…",
    "recording.add": "Hinzufügen",
    "recording.added": "Hinzugefügt: {label}",
    "recording.intensityLabel": "Wie stark? {value}/10",
    "recording.back": "Zurück",
    "recording.next": "Weiter",
    "recording.skip": "Überspringen",
    "recording.saveWithoutContext": "Ohne Kontext speichern",
    "recording.save": "Speichern",
    "lesson.cardTitle": "Mikro-Lektion",
    "lesson.try": "Ich probier's",
    "lesson.done": "Fertig",
    "lesson.dismiss": "Überspringen",
    "theme.custom.title": "Eigenes Thema bearbeiten",
    "theme.custom.note": "Ändere die Farben — jede Änderung ist sofort sichtbar. Die Einstellung wird gespeichert und bleibt nach einem Neustart erhalten.",
    "colorPicker.family.red": "Rot",
    "colorPicker.family.orange": "Orange",
    "colorPicker.family.yellow": "Gelb",
    "colorPicker.family.green": "Grün",
    "colorPicker.family.blue": "Blau",
    "colorPicker.family.purple": "Lila",
    "colorPicker.family.pink": "Rosa",
    "colorPicker.family.brown": "Braun",
    "colorPicker.family.gray": "Grau",
    "colorPicker.family.black": "Schwarz",
    "colorPicker.shade.light": "hell",
    "colorPicker.shade.pale": "blass",
    "colorPicker.shade.medium": "mittel",
    "colorPicker.shade.dark": "dunkel",
    "colorPicker.shade.darkest": "sehr dunkel",
    "colorPicker.custom": "Eigene Farbe",
    "theme.custom.colorLabel": "Farbwähler {label}",
    "theme.custom.primary.bg": "Hintergrundfarbe",
    "theme.custom.primary.surface": "Kartenfarbe",
    "theme.custom.primary.ink": "Textfarbe",
    "theme.custom.primary.accent": "Akzentfarbe",
    "theme.custom.sectionMain": "Grundfarben",
    "theme.custom.sectionDetail": "Alle weiteren Farben",
    "theme.custom.previewTitle": "Vorschau",
    "theme.custom.previewBody": "So sieht das Tagebuch mit deinen Farben aus.",
    "theme.custom.reset": "Zurücksetzen",
    "theme.custom.save": "Speichern",
    "theme.custom.savedToast": "Eigenes Thema gespeichert 🎨",
    "theme.custom.resetToast": "Eigenes Thema zurückgesetzt.",
    "insights.title": "Analyse",
    "insights.hintEmpty": "Die Muster aus deinen Einträgen erscheinen hier.",
    "insights.hintFull": "Muster und Zusammenhänge aus deinen eigenen Daten.",
    "insights.empty.title": "Noch keine Daten",
    "insights.empty.hint": "Halte ein paar Tage im Tab Heute fest, dann erscheinen die Erkenntnisse nach drei Einträgen.",
    "insights.empty.cta": "Tab Heute öffnen",
    "insights.week.title": "Diese Woche",
    "insights.week.summary": "Durchschnittliche Stimmung: {score}, {days} Tage",
    "insights.week.avgMood": "durchschnittliche Stimmung (0–100)",
    "insights.week.days": "Tage mit Einträgen",
    "insights.week.avgStress": "durchschnittlicher Stress",
    "insights.week.avgEnergy": "durchschnittliche Energie",
    "insights.trend.title": "Wie hat es sich entwickelt?",
    "insights.trend.rangeGroup": "Zeitraum wählen",
    "insights.trend.rangeWeek": "1 Woche",
    "insights.trend.rangeMonth": "30 Tage",
    "insights.trend.rangeAll": "Alles",
    "insights.trend.tooFew": "Die Kurve braucht in diesem Zeitraum mindestens zwei Einträge.",
    "insights.trend.scaleNote": "Stimmung 0–100 Punkte; Stress und Energie auf einer ×10-Skala, damit sie in einem Diagramm sichtbar sind.",
    "insights.trend.summary": "Kurve für Stimmung, Stress und Energie",
    "insights.correlation.title": "Was wirkt auf dich?",
    "insights.correlation.summary": "Durchschnitt pro Tag und Abweichung zu anderen Tagen",
    "insights.correlation.empty": "Markiere Aktivitäten im täglichen Check-in, dann zeigen wir hier, welche deine Stimmung heben oder senken.",
    "insights.correlation.row": "{count} Tage · durchschnittliche Stimmung {avg}",
    "insights.correlation.ariaUp": "Im Durchschnitt {delta} Punkte bessere Stimmung",
    "insights.correlation.ariaDown": "Im Durchschnitt {delta} Punkte schlechtere Stimmung",
    "insights.more.title": "Weitere Erkenntnisse",
    "insights.more.badge": "Details",
    "insights.more.disclaimer": "Die Analyse betrachtet deine eigenen Einträge — kein medizinischer Rat und keine Diagnose.",
    "onboarding.done": "Fertig! Ein Tipp pro Tag 🌱",
    "onboarding.dialogLabel": "Willkommenstour",
    "onboarding.welcome": "Willkommen bei Belső Iránytű!",
    "onboarding.intro": "Ein Stimmungstagebuch, das in Minuten lernt, was dein Befinden hebt oder senkt. Alle Daten bleiben auf deinem Gerät.",
    "onboarding.hint": "Drei schnelle Fragen, dann kann es losgehen.",
    "onboarding.start": "Los geht's!",
    "onboarding.trackerQuestion": "Was möchtest du täglich festhalten?",
    "onboarding.trackerHint": "Du kannst es später in den Einstellungen jederzeit ändern.",
    "onboarding.themeQuestion": "Wie soll es aussehen?",
    "onboarding.themeHint": "Sofort zu sehen — und später änderbar.",
    "onboarding.themeLight": "Hell",
    "onboarding.themeDark": "Dunkel",
    "onboarding.themeVibrant": "Frisch",
    "onboarding.howTitle": "Tagebuch in drei Schritten",
    "onboarding.howMood": "Wähle eine Stimmung",
    "onboarding.howTag": "Tippe an, was dich beeinflusst hat (optional)",
    "onboarding.howSave": "Speichern — das war's, weniger als 5 Sekunden",
    "onboarding.extrasPhoto": "Ein Foto,",
    "onboarding.extrasVoice": "Sprache und",
    "onboarding.extrasTrack": "ein Tagestracker sind im Eintrag verfügbar.",
    "onboarding.back": "Zurück",
    "onboarding.next": "Weiter",
    "onboarding.begin": "Tagebuch starten",
    "assessment.consentTitle": "Bevor du beginnst",
    "assessment.consentBody": "Der folgende Fragebogen ist eine Selbstauskunft über die letzten zwei Wochen. Er untersucht nicht, er filtert nicht und er stellt keine Diagnose.\n\nDeine Ergebnisse bleiben auf deinem Gerät. Nichts verlässt es.\n\nWas du bekommst, ist eine Zusammenfassung davon, wie du dich in den letzten zwei Wochen gefühlt hast.\n\nDu kannst es jederzeit in den Einstellungen ausschalten. Beim Ausschalten werden auch die bereits gegebenen Antworten gelöscht.\n\nQuelle: {source}",
    "assessment.consentConfirm": "Verstanden, einschalten",
    "assessment.consentCancel": "Abbrechen",
    "assessment.moduleTitle": "Selbstreflexions-Fragebogen",
    "assessment.moduleStart": "Ausfüllen",
    "assessment.summaryEmpty": "Noch keine Einträge",
    "assessment.summaryLast": "Zuletzt: {date} · {score} Pkt.",
    "assessment.moduleBack": "Zurück zur Liste",
    "assessment.itemGroup": "Frage {index}",
    "assessment.logTitle": "Frühere Selbsteinschätzungen",
    "assessment.logEmpty": "Noch keine Selbsteinschätzung ausgefüllt.",
    "assessment.resultRetake": "Erneut ausfüllen",
    "assessment.resultShowAll": "Antworten verbergen",
    "assessment.resultHideAll": "Antworten anzeigen",
    "assessment.notScored": "Diese Frage zählt nicht zur Gesamtsumme.",
    "assessment.skip": "Überspringen",
    "assessment.impactGroup": "Wirkung",
    "assessment.save": "Speichern",
    "assessment.next": "Weiter",
    "assessment.exit": "Beenden",
    "assessment.maxScore": "{max} Punkte ist die höchste Gesamtsumme.",
    "backup.cloudNote": "Die Sicherung landet in deiner eigenen Cloud. Wir sehen sie nie.",
    "backup.lossNote": "Wenn du das Passwort oder den 12-Wörter-Code verlierst, lässt sich die Sicherung nicht wiederherstellen.",
    "backup.notOurs": "Das ist keine verschlüsselte Sicherung von Belső Iránytű.",
    "backup.runningNote": "Die App meldet sich, wenn es Zeit ist. Wir laufen nicht im Hintergrund: eine neue Datei entsteht nur, solange die App offen ist.",
    "backup.touchNote": "Der Browser kann ohne Klick keine Datei schreiben, deshalb startet eine Schaltfläche immer die Sicherung.",
    "backup.scopeNote": "Anhänge, das Hintergrundbild, der von dir gesetzte API-Schlüssel, die Bildschirmsperre, die Kartenanordnung und die Benachrichtigungsspuren kommen nicht in die Sicherung. Sie bleiben auf dem Gerät.",
    "backup.openFailed": "Die Sicherung lässt sich mit diesem Geheimnis nicht öffnen.",
    "backup.keyFailed": "Der Verschlüsselungsschlüssel konnte nicht erstellt werden. Versuch es erneut.",
    "backup.fileFailed": "Die Sicherung konnte nicht erstellt werden. Versuch es erneut.",
    "backup.mismatch": "Die beiden Passwörter stimmen nicht überein.",
    "backup.noSource": "Die Datei ist nicht lesbar.",
    "backup.restored": "Wiederhergestellt: {entries} Einträge, {assessments} Selbsteinschätzungen, {keys} Einstellungen.",
    "backup.restoredSkipped": "Wiederhergestellt: {entries} Einträge, {assessments} Selbsteinschätzungen, {keys} Einstellungen. ({skipped} unbrauchbare Daten.)",
    "backup.savedAtNever": "Es wurde noch keine Sicherung erstellt.",
    "backup.lastSaved": "Letzte Sicherung: {when}",
    "backup.saved": "Sicherung erstellt: {when}",
    "backup.offIntro": "Aus deinem Tagebuch wird eine verschlüsselte Datei, die du überall speichern kannst — Drive, iCloud, USB-Stick. Nur deine Schlüssel können sie öffnen.",
    "backup.summary": "Eine verschlüsselte Sicherung auf deinem eigenen Speicher",
    "backup.enable": "Verschlüsselte Sicherung einschalten",
    "backup.setupIntro": "Wähle, womit du die Sicherung öffnest. Es entstehen zwei Geheimnisse: das, was du jetzt wählst, und ein 12-Wörter-Code, den du danach einmal siehst.",
    "backup.setupPasskey": "Passkey erstellen",
    "backup.noPrf": "Dieser Browser gibt mit einem Passkey keinen Verschlüsselungsschlüssel (PRF) heraus, deshalb schützen wir die Sicherung mit einem Passwort.",
    "backup.passwordLabel": "Passwort",
    "backup.passwordPlaceholder": "Mindestens {min} Zeichen",
    "backup.passwordAgainLabel": "Passwort erneut",
    "backup.usePassword": "Passwortschutz",
    "backup.recoveryLead": "Schreib die 12 Wörter auf",
    "backup.recoveryRest": "— das ist der zweite Schlüssel der Sicherung. Wenn der Passkey oder das Passwort weg ist, lässt sie sich nur damit öffnen.",
    "backup.ackLabel": "Ich habe es aufgeschrieben und bewahre es sicher auf",
    "backup.ackHint": "Dieser Code erscheint nur einmal. Wenn er verloren geht, lässt sich die Datei nicht öffnen.",
    "backup.save": "Speichern",
    "backup.cancel": "Abbrechen",
    "backup.saveNow": "Jetzt sichern",
    "backup.saveCount": "· {count} Sicherungen bisher",
    "backup.savePasswordLabel": "Passwort für die Sicherung",
    "backup.saveWithPassword": "Mit Passwort sichern",
    "backup.restoreFromFile": "Aus einer Datei wiederherstellen",
    "backup.fileLabel": "Datei: {name}",
    "backup.fileFallback": "Die ausgewählte Datei",
    "backup.openWith": "— damit lässt sie sich öffnen:",
    "backup.restorePasskey": "Mit Passkey wiederherstellen",
    "backup.restorePasswordLabel": "Das Passwort der Datei",
    "backup.restorePassword": "Mit Passwort wiederherstellen",
    "backup.restoreCodeLabel": "Der 12-Wörter-Code",
    "backup.restoreCodePlaceholder": "Wort Wort Wort …",
    "backup.restoreCode": "Mit dem Code wiederherstellen",
    "backup.disable": "Cloud-Sicherung ausschalten",
    "backup.back": "Zurück",
    "backup.cancelled": "Die Sicherung wurde abgebrochen, es entstand keine Datei.",
    "backup.ready": "Verschlüsselte Sicherung fertig ✅",
    "backup.savedNotify": "Sicherung erstellt ✅",
    "backup.restoredNotify": "Wiederhergestellt ✅",
    "backup.disabled": "Die Cloud-Sicherung ist aus. Die Datei bleibt unverändert erhalten.",
    "backup.passkeyRpName": "Belső Iránytű",
    "backup.passkeyUnsupported": "Dieser Browser unterstützt keine passkey-basierte Sicherung. Wähle den Passwortschutz.",
    "backup.passkeyNoPrf": "Dieser Authenticator gibt keinen Verschlüsselungsschlüssel (PRF). Wähle den Passwortschutz.",
    "backup.passkeyCreateFailed": "Der Passkey konnte nicht erstellt werden.",
    "backup.passkeyInvalidId": "Ungültige Passkey-Kennung.",
    "backup.passkeyAborted": "Die Passkey-Anfrage wurde abgebrochen oder nicht erlaubt. Versuch es erneut.",
    "backup.passkeyUnsupportedDevice": "Dieses Gerät unterstützt keine Passkeys.",
    "backup.passkeyAlreadyRegistered": "Dieser Passkey ist auf diesem Gerät schon registriert.",
    "backup.passkeyInsecureContext": "Sicherheitsfehler: Die Sicherung funktioniert nur über HTTPS oder auf localhost.",
    "backup.passkeyFailed": "Der Passkey-Vorgang ist fehlgeschlagen. Versuch es erneut.",
    "backup.passwordTooSimple": "Dieses Passwort ist zu leicht zu erraten — wähle ein anderes.",
    "backup.passwordTooShort": "Das Passwort muss mindestens {min} Zeichen haben.",
    "backup.title": "Verschlüsselte Cloud-Sicherung",
    "crisis.resourcesTitle": "Wenn du Hilfe brauchst",
    "crisis.disclaimer": "Das ist keine Diagnose, sondern eine Zusammenfassung dessen, was du eingetragen hast. Wenn dich etwas beunruhigt, ist es gut, mit einer Fachperson zu sprechen.",
    "crisis.helpNote": "Kostenlos und rund um die Uhr erreichbar. Du musst dich vorher nicht anmelden.",
    "tools.activity.title": "Eigene Aktivität",
    "tools.activity.intro": "Erstelle dein eigenes Label — es erscheint unter den täglichen Aktivitäten.",
    "tools.activity.iconGroup": "Symbol wählen",
    "tools.activity.nameLabel": "Name der neuen Aktivität",
    "tools.activity.placeholder": "Name, z. B. Gärtnern",
    "tools.activity.add": "Hinzufügen",
    "tools.activity.added": "Hinzugefügt: {icon} {label}",
    "tools.activity.dupOrLimit": "Dieses Label gibt es schon, oder du hast das Maximum erreicht (24).",
    "tools.activity.needName": "Gib der Aktivität einen Namen.",
    "tools.activity.removeLabel": "{label} löschen",
    "tools.activity.summary": "{n} eigene Labels",
    "tools.activity.summaryEmpty": "Keine eigenen Labels",
    "tools.breathing.title": "Atemübung",
    "tools.breathing.summary": "Geführtes Atmen: schneller und voller Modus",
    "tools.breathing.modeGroup": "Atemmodus",
    "tools.breathing.quick": "Schnellmodus",
    "tools.breathing.full": "Muster wählen",
    "tools.breathing.patternGroup": "Atemmuster",
    "tools.breathing.custom": "Eigenes",
    "tools.breathing.inLabel": "Einatmen (Sek.)",
    "tools.breathing.holdLabel": "Halten (Sek.)",
    "tools.breathing.outLabel": "Ausatmen (Sek.)",
    "tools.breathing.apply": "Muster festlegen",
    "tools.breathing.roundDone": "Vollständige Runden: {count}",
    "tools.breathing.length": "Dauer: {seconds} Sek.",
    "tools.breathing.finish": "Beenden",
    "tools.breathing.start": "Starten",
    "tools.breathing.pause": "Pause",
    "tools.breathing.resume": "Weiter",
    "tools.habits.title": "Gewohnheiten und Serien",
    "tools.habits.intro": "Hake es täglich ab — die 🔥-Serie zeigt, wie viele Tage du es ohne Unterbrechung gemacht hast.",
    "tools.habits.streakDays": "🔥 {days} Tage",
    "tools.habits.streakStart": "starte heute!",
    "tools.habits.weeklySuffix": "/7 diese Woche",
    "tools.habits.weekLabel": "Die letzten 7 Tage von {label}",
    "tools.habits.iconGroup": "Symbol",
    "tools.habits.nameLabel": "Name der neuen Gewohnheit",
    "tools.habits.placeholder": "Neue Gewohnheit, z. B. abends lesen",
    "tools.habits.add": "Hinzufügen",
    "tools.habits.added": "Hinzugefügt: {icon} {label}",
    "tools.habits.dupOrLimit": "So etwas gibt es schon, oder du hast das Limit erreicht ({limit}).",
    "tools.habits.needName": "Gib der Gewohnheit einen Namen.",
    "tools.habits.removeLabel": "{label} löschen",
    "tools.cbt.title": "KVT-Gedankenprotokoll",
    "tools.cbt.summary": "Ein Gedankenprotokoll in sieben Schritten",
    "tools.cbt.stepSituation": "Was ist passiert? (Situation)",
    "tools.cbt.stepThought": "Was kam dir in den Sinn? (automatischer Gedanke)",
    "tools.cbt.stepEmotion": "Was hast du gefühlt, und wie belastend war es?",
    "tools.cbt.stepFor": "Was spricht FÜR den Gedanken?",
    "tools.cbt.stepAgainst": "Was spricht dagegen?",
    "tools.cbt.stepBalanced": "Wie lautet der ausgewogene Gedanke?",
    "tools.cbt.stepAfter": "Wie belastend ist es jetzt?",
    "tools.cbt.progressGroup": "Fortschritt",
    "tools.cbt.situationLabel": "Situation",
    "tools.cbt.situationPlaceholder": "Was war die Situation? Wo, wann, mit wem?",
    "tools.cbt.thoughtLabel": "Automatischer Gedanke",
    "tools.cbt.thoughtPlaceholder": "Was ist dir durch den Kopf gegangen?",
    "tools.cbt.emotionLabel": "Name des Gefühls",
    "tools.cbt.emotionPlaceholder": "Ein Gefühl, z. B. Angst",
    "tools.cbt.distressBefore": "Belastung:",
    "tools.cbt.forLabel": "Tatsachen, die den Gedanken stützen",
    "tools.cbt.forPlaceholder": "Tatsachen, die den Gedanken stützen…",
    "tools.cbt.againstLabel": "Tatsachen, die gegen den Gedanken sprechen",
    "tools.cbt.againstPlaceholder": "Tatsachen, die dagegen sprechen…",
    "tools.cbt.balancedLabel": "Ausgewogener Gedanke",
    "tools.cbt.balancedPlaceholder": "Wie würdest du es fair formulieren, beide Seiten gesehen?",
    "tools.cbt.distressAfter": "Belastung jetzt:",
    "tools.cbt.shiftBefore": "Vorher {before} → jetzt {after}.",
    "tools.cbt.shiftBetter": "So viel leichter: {points} Punkte. 💪",
    "tools.cbt.shiftSame": "Manchmal ist ein Gedanke hartnäckig — ihn anzuschauen ist auch ein Ergebnis.",
    "tools.cbt.next": "Weiter",
    "tools.cbt.back": "Zurück",
    "tools.cbt.save": "Speichern",
    "tools.cbt.records": "{count} gespeicherte Protokolle",
    "tools.cbt.recordsWithAvg": "{count} gespeicherte Protokolle — durchschnittliche Erleichterung: {avg} Punkte",
    "tools.cbt.deleteLabel": "Protokoll löschen",
    "tools.experiment.title": "Eigenes Experiment",
    "tools.experiment.intro": "Probier eine Sache drei Tage lang aus und gib ihr jeden Abend eine Zahl. Die Zahl der Tage ist fest: sie lässt sich nicht verlängern.",
    "tools.experiment.whatLabel": "Was probierst du aus?",
    "tools.experiment.whatPlaceholder": "z. B. jeden Abend 10 Minuten früher ins Bett",
    "tools.experiment.whyLabel": "Warum denkst du, dass es hilft? (optional)",
    "tools.experiment.start": "Drei-Tage-Experiment starten",
    "tools.experiment.historyTitle": "Abgeschlossene Experimente",
    "tools.experiment.ratingQuestion": "Wie hast du dich heute gefühlt? ({min}–{max})",
    "tools.experiment.ratingGroup": "Deine Bewertung für heute ({min}–{max})",
    "tools.experiment.noteLabel": "Notiz (optional)",
    "tools.experiment.notePlaceholder": "z. B. ich habe mich heute mehr bewegt",
    "tools.experiment.savedToday": "Heutige Bewertung gespeichert",
    "tools.experiment.avgSuffix": "— bisheriger Durchschnitt: {avg}",
    "tools.experiment.workedButton": "Hat funktioniert",
    "tools.experiment.notWorkedButton": "Hat nicht funktioniert",
    "tools.experiment.abandon": "Ich brech ab",
    "tools.experiment.verdictYes": "hat funktioniert",
    "tools.experiment.verdictNo": "hat nicht funktioniert",
    "tools.experiment.deleteLabel": "Experiment löschen: {what}",
    "tools.library.title": "Bibliothek",
    "tools.library.intro": "Kurze, alltägliche Texte über das, was im Tagebuch auftaucht. Keine Diagnose, nur eine Erklärung — wenn dich etwas beunruhigt, ist es gut, mit einer Fachperson zu sprechen.",
    "tools.library.takeawayLabel": "Was zählt:",
    "tools.library.actionLabel": "Probier das:",
    "tools.library.backToArticle": "← Zurück",
    "tools.library.backToTopics": "← Themen",
    "tools.library.readMark": "Als gelesen markieren",
    "tools.library.readDone": "Gelesen ✓",
    "tools.gratitude.title": "Dankbarkeitstagebuch",
    "tools.gratitude.intro": "Ein Gedanke pro Tag: Wofür bist du heute dankbar? Auch kleine Dinge zählen.",
    "tools.gratitude.textareaLabel": "Wofür bist du heute dankbar?",
    "tools.gratitude.placeholder": "Heute bin ich dankbar für…",
    "tools.gratitude.saveButton": "Heutige Dankbarkeit speichern",
    "tools.gratitude.total": "Insgesamt {count} Einträge",
    "tools.gratitude.saved": "Dankbarkeit festgehalten 💛",
    "tools.gratitude.alreadyToday": "Heute ist schon festgehalten — bis morgen! 🌅",
    "tools.gratitude.needText": "Schreib einen kurzen Satz darüber, wofür du dankbar bist.",
    "tools.gratitude.deleteLabel": "Dankbarkeitseintrag löschen",
    "tools.foodPhoto.title": "Mahlzeit aus dem Foto",
    "tools.foodPhoto.summary": "Schätzung per Foto — du siehst sie durch, bevor etwas eingetragen wird.",
    "tools.foodPhoto.explainer": "Ein Foto der Mahlzeit, und die KI gibt geschätzte Nährwerte — du siehst sie durch, bevor etwas ins Tagebuch kommt.",
    "tools.foodPhoto.captureLabel": "Mahlzeit fotografieren und analysieren",
    "tools.foodPhoto.analyzing": "Analyse…",
    "tools.foodPhoto.takePhoto": "Foto aufnehmen",
    "tools.foodPhoto.manualStillWorks": "Die manuellen Felder funktionieren wie bisher.",
    "tools.foodPhoto.error": "Das Bild konnte nicht verarbeitet werden — versuch es erneut.",
    "tools.foodPhoto.written": "Geschätzte Werte eingetragen — jederzeit änderbar.",
    "tools.foodPhoto.calories": "Kalorien (geschätzt)",
    "tools.foodPhoto.protein": "Protein g (geschätzt)",
    "tools.foodPhoto.carb": "Kohlenhydrate g (geschätzt)",
    "tools.foodPhoto.fat": "Fett g (geschätzt)",
    "tools.foodPhoto.writeToJournal": "Ins Tagebuch schreiben",
    "tools.foodPhoto.discard": "Verwerfen",
    "tools.workouts.title": "Trainingsprogramme",
    "tools.workouts.intro": "Vier fertige Programme. Wähle eines und starte, wann es dir passt — es ist neben deiner Tagebuchgewohnheit gedacht, nicht statt ihrer.",
    "tools.workouts.programTitle": "{label} — {days} Tage",
    "tools.workouts.recommendedBadge": "· Heute empfohlen",
    "tools.workouts.nutritionTitle": "Ernährungstipps",
    "tools.workouts.disclaimer": "Das sind allgemeine Lebensstil-Vorschläge — kein medizinischer Rat. Wenn du eine Verletzung oder eine chronische Erkrankung hast oder schwanger bist, frag zuerst deine Ärztin oder deinen Arzt.",
    "tools.workouts.safetyNote":
      "Bei scharfem Schmerz, Druck in der Brust, Schwindel oder Atemnot brich ab — und hole Hilfe, wenn es nicht vergeht. Als Einsteiger die ersten Wochen leichter halten.",
    "tools.title": "Entdecken",
    "tools.hint": "Übungen, Selbsterkenntnis und Gesundheit — an einem Ort, aus dem Tag herausgenommen.",
    "tools.therapy.title": "Therapie",
    "tools.self.title": "Selbsterkenntnis",
    "tools.health.title": "Gesundheit",
    "tools.experiments.title": "Experimente",
    "tools.learning.title": "Lernen",
    "nutrition.meal.breakfast": "Frühstück",
    "nutrition.meal.lunch": "Mittagessen",
    "nutrition.meal.dinner": "Abendessen",
    "nutrition.meal.snack": "Snack",
    "nutrition.allergen.peanut": "Erdnuss",
    "nutrition.allergen.nut": "Nüsse",
    "nutrition.allergen.milk": "Milch",
    "nutrition.allergen.egg": "Ei",
    "nutrition.allergen.gluten": "Gluten",
    "nutrition.allergen.soy": "Soja",
    "nutrition.allergen.fish": "Fisch",
    "nutrition.allergen.shellfish": "Krustentiere",
    "nutrition.allergen.sesame": "Sesam",
    "nutrition.allergen.sulphite": "Sulfite",
    "tools.nutrition.title": "Mahlzeitentagebuch",
    "tools.nutrition.summary": "{kcal} kcal · {protein} g Protein · {carb} g Kohlenhydrate · {fat} g Fett",
    "tools.nutrition.intro": "Schreib auf, was du heute gegessen hast. Die Liste bleibt auf deinem Gerät und sendet nichts.",
    "tools.nutrition.mealGroup": "Welche Mahlzeit",
    "tools.nutrition.foodLabel": "Lebensmittel",
    "tools.nutrition.foodPlaceholder": "Lebensmittel eingeben…",
    "tools.nutrition.foodAutocomplete": "Lebensmittelvorschläge",
    "tools.nutrition.servingsLabel": "Menge — {name}",
    "tools.nutrition.add": "Hinzufügen",
    "tools.nutrition.portionLine": "Eine Portion: {portion}, {kcal} kcal.",
    "tools.nutrition.customPortion": "Die Nährwerte sind unbekannt, daher steht nur der Name auf der Liste.",
    "tools.nutrition.allergyWarn": "Allergie: {allergens} — {name}",
    "tools.nutrition.allergyMark": "Allergie: {allergens}",
    "tools.nutrition.allergyNote": "Der Hinweis passt auf den NAMEN des Lebensmittels, nicht auf die echten Zutaten — im Restaurant kann er nicht wissen, was auf den Teller kam.",
    "tools.nutrition.allergyHint": "Deine Allergien kannst du auf der Karte Ernährung und Allergien in den Einstellungen markieren.",
    "tools.nutrition.mealKcal": "{kcal} kcal",
    "tools.nutrition.mealEmpty": "–",
    "tools.nutrition.itemKcal": "{kcal} kcal",
    "tools.nutrition.removeLabel": "{name} von der Liste entfernen",
    "tools.nutrition.empty": "Heute steht noch nichts auf der Liste.",
    "tools.nutrition.customNote": "Eigene Lebensmittel werden nur mit ihrem Namen erfasst; die Summen oben enthalten sie nicht.",
    "tools.nutrition.forgetCustom": "{name} vergessen",
    "tools.nutrition.note": "Die Kalorien- und Makrowerte sind Richtwerte pro Portion, keine Messungen.",
    "tools.nutrition.dietTitle": "Ernährungsform",
    "tools.nutrition.dietHint": "Wähle, was zu dir passt — du kannst jederzeit wechseln.",
    "tools.nutrition.dietNone": "Noch keine Ernährung gewählt.",
    "tools.nutrition.dietActive": "Aktive Ernährung: {diet}",
    "tools.nutrition.dietClear": "Auswahl löschen",
    "tools.nutrition.diet.paleo": "Paleo",
    "tools.nutrition.diet.keto": "Keto",
    "tools.nutrition.diet.mediterranean": "Mediterran",
    "tools.nutrition.diet.vegetarian": "Vegetarisch",
    "tools.nutrition.diet.vegan": "Vegan",
    "tools.nutrition.diet.raw": "Rohkost",
    "tools.nutrition.diet.low-carb": "Low-Carb",
    "tools.nutrition.diet.high-protein": "High-Protein",
    "tools.nutrition.diet.gluten-free": "Glutenfrei",
    "tools.nutrition.diet.lactose-free": "Laktosefrei",
    "tools.nutrition.diet.pescatarian": "Pescetarisch",
    "tools.nutrition.diet.other": "Andere",
    "tools.nutrition.dietNote":
      "Die Ernährungsform ist deine Entscheidung, keine medizinische Beratung. Wenn du sie aus gesundheitlichen Gründen wählst, sprich sie mit einer Ärztin, einem Arzt oder einer Ernährungsberatung ab.",
    "tools.nutrition.menuTitle": "Wochenmenü",
    "tools.nutrition.menuHint": "Sieben Tage aus deiner gewählten Ernährung — ein Vorschlag, keine Vorschrift.",
    "tools.nutrition.menuNone": "Wähle oben eine Ernährung, dann erscheint hier das Wochenmenü.",
    "tools.nutrition.menuOther": "Für \u201eAndere\u201c gibt es kein fertiges Menü — diese Liste kennt die Regeln nicht.",
    "tools.nutrition.menuAdd": "Das soll heute sein",
    "tools.nutrition.menuNote": "Das Menü wird aus den Lebensmitteln oben zusammengestellt, mit denselben Schätzungen.",
    "tools.nutrition.menuSkipped": "Wegen einer Allergie weggelassen: {items}",
    "settings.allergies.title": "Ernährung und Allergien",
    "settings.allergies.summary": "{on} / {total} Allergene markiert",
    "settings.allergies.off": "Keine Allergene markiert",
    "settings.allergies.note": "Was du hier markierst, ist das, wovor das Mahlzeitentagebuch warnt, wenn ein Name es enthält.",
    "settings.allergies.legend": "Allergene",
    "settings.allergies.limit": "Diese Liste ist eine Erinnerung, kein medizinischer Rat: prüfe den Hinweis immer auch selbst.",
    "tools.fitness.title": "Trainingspläne und Protokoll",
    "tools.fitness.summary": "{plans} Pläne · {sessions} Trainings im Protokoll",
    "tools.fitness.intro": "Nimm einen fertigen Plan oder baue deinen eigenen aus Tagen und Übungen. Alles bleibt auf deinem Gerät.",
    "tools.fitness.templates": "Empfohlene Pläne",
    "tools.fitness.adopt": "Auswählen",
    "tools.fitness.adoptLabel": "{name} als eigenen Plan auswählen",
    "tools.fitness.templateDays": "{days} Tage",
    "tools.fitness.myPlans": "Deine eigenen Pläne",
    "tools.fitness.noPlans": "Noch kein eigener Plan — wähle einen empfohlenen Plan oder erstelle einen neuen.",
    "tools.fitness.planDays": "{days} Tage",
    "tools.fitness.deletePlanLabel": "{name} löschen",
    "tools.fitness.newPlanLabel": "Name des neuen Plans",
    "tools.fitness.newPlanPlaceholder": "z. B. Morgenrunde",
    "tools.fitness.create": "Erstellen",
    "tools.fitness.emptyPlan": "Dieser Plan hat noch keine Tage.",
    "tools.fitness.addDay": "Tag hinzufügen",
    "tools.fitness.newDayLabel": "Name des neuen Tages",
    "tools.fitness.newDayPlaceholder": "z. B. Tag A — ganzer Körper",
    "tools.fitness.removeDayLabel": "Tag {name} löschen",
    "tools.fitness.logDay": "Heute protokollieren",
    "tools.fitness.logDayLabel": "{name} für heute protokollieren",
    "tools.fitness.exerciseName": "Name der Übung",
    "tools.fitness.exercisePlaceholder": "z. B. Kniebeuge",
    "tools.fitness.sets": "Sätze",
    "tools.fitness.reps": "Wiederholungen",
    "tools.fitness.weight": "Gewicht in kg",
    "tools.fitness.addExercise": "Übung hinzufügen",
    "tools.fitness.removeExerciseLabel": "{name} aus dem Tag entfernen",
    "tools.fitness.progressLine": "{name}: {sessions} Trainings, Bestleistung {best} kg",
    "tools.fitness.progressBody": "{name}: {sessions} Trainings mit Körpergewicht",
    "tools.fitness.progressReps": "{name}: {sessions} Trainings, Bestleistung {best} Wiederholungen",
    "tools.fitness.progressHold": "{name}: {sessions} Trainings, Bestleistung {best} Sekunden gehalten",
    "tools.fitness.nextWeight": "nächstes Mal {kg} kg",
    "tools.fitness.nextReps": "nächstes Mal {reps} Wiederholungen",
    "tools.fitness.nextHold": "nächstes Mal {seconds} Sekunden",
    "tools.fitness.recent": "Letzte Trainings",
    "tools.fitness.type.strength": "Kraft",
    "tools.fitness.type.cardio": "Cardio",
    "tools.fitness.type.mobility": "Mobilität",
    "tools.fitness.type.hiit": "HIIT",
    "tools.fitness.type.yoga": "Yoga",
    "tools.fitness.type.walking": "Spaziergang",
    "tools.fitness.restDay": "Ruhetag",
    "tools.fitness.markRest": "Als Ruhetag markieren",
    "tools.fitness.unmarkRest": "Doch Trainingstag",
    "tools.fitness.restNote": "Ruhetag — nichts zu erfassen. Der Tag bleibt im Plan.",
    "tools.fitness.suggestTitle": "Vorschlag für heute",
    "tools.fitness.suggestNone": "Noch nichts vorzuschlagen — wähle eine Vorlage oder baue einen Plan, dann erscheint hier die nächste Einheit.",
    "tools.fitness.suggestFirst": "Das wäre die erste Einheit im Tagebuch: {plan} — {day}.",
    "tools.fitness.suggestTrain": "Deine letzte Einheit war vor {days} Tagen. Als Nächstes: {plan} — {day}.",
    "tools.fitness.suggestRest": "Du hast heute schon eine Einheit erfasst — ruh dich aus. Als Nächstes: {plan} — {day}.",
    "tools.fitness.progressTitle": "Fortschritt je Übung",
    "tools.fitness.progressNone": "Erfasse ein paar Einheiten, dann zeigt sich hier dein Fortschritt je Übung.",
    "tools.fitness.chartTitle": "Fortschritt: {name}",
    "tools.fitness.chartNoteKg": "Das Diagramm zeigt die erfassten Gewichte, Einheit für Einheit.",
    "tools.fitness.chartNoteReps": "Das Diagramm zeigt die erfassten Wiederholungen (oder Sekunden), Einheit für Einheit.",
    "tools.fitness.noLog": "Noch kein Training protokolliert.",
    "tools.fitness.exerciseSuffix": "{n} Übungen",
    "tools.fitness.volume": "{volume} kg Volumen",
    "tools.fitness.removeLogLabel": "{name} ({date}) aus dem Protokoll löschen",
    "tools.fitness.planNote": "Die Pläne sind Bewegungsabläufe, kein persönlicher Trainingsplan. Wenn du unsicher bist, frag eine Fachperson.",
    "gad7.title": "Anspannung und Sorgen",
    "gad7.summary": "{n}/7 beantwortet",
    "gad7.intro": "Sieben Fragen zu den letzten zwei Wochen. Nichts wird gespeichert: deine Antworten leben nur, solange diese Karte offen ist.",
    "gad7.itemGroup": "Frage {index}",
    "gad7.incomplete": "Beantworte alle sieben Fragen, dann fasse ich zusammen.",
    "gad7.submit": "Zusammenfassen",
    "gad7.score": "{score} Punkte / {max}",
    "gad7.resultNote": "Diese Zusammenfassung wird nicht gespeichert und hinterlässt keinen Verlauf. Wenn du sie erneut ausfüllst, siehst du nur die neuen Antworten.",
    "gad7.again": "Erneut ausfüllen",
    "gad7.provenance": "Die Fragen sind eine Bearbeitung des GAD-7 (Spitzer, Kroenke, Williams & Löwe, 2006) in eigenen Worten. Der Originalfragebogen ist gemeinfrei.",
    "background.fitChoiceSoft": "Weiches Füllen",
    "background.fitChoiceCover": "Füllen",
    "background.fitChoiceContain": "Ganzes Bild",
    "background.paletteChoiceImage": "Aus dem Bild",
    "background.paletteChoiceTheme": "Mein Thema",
    "background.errorStorage": "Nicht genug Speicherplatz für das Hintergrundbild.",
    "background.errorType": "Es lässt sich nur ein Bild wählen (image/*).",
    "background.errorTooLarge": "Das Hintergrundbild ist zu groß (maximal 8 MB).",
    "voice.systemPrompt": "Du bekommst einen Tagebucheintrag auf Deutsch.\nDeine Aufgabe: zieh die strukturierten Werte heraus und antworte NUR mit gültigem JSON, mit deutschem Text im Feld \"note\".\nSchema:\n{\n  \"mood\": 1-5 (1=sehr schlecht, 3=mittel, 5=sehr gut; null wenn unklar),\n  \"stress\": 1-10 (null wenn nicht erwähnt),\n  \"energy\": 1-10 (null wenn nicht erwähnt),\n  \"sleepHours\": Zahl (null wenn nicht erwähnt),\n  \"restingHr\": Zahl, Ruhepuls (null wenn nicht erwähnt),\n  \"activities\": höchstens 4 kurze substantivische Aktivitäts-Labels (z. B. \"Bewegung\", \"Arbeit\", \"Familie\"),\n  \"note\": eine zurückhaltende Zusammenfassung des Eintrags in 1-2 Sätzen\n}",
    "voice.activityExercise": "Bewegung",
    "voice.activityWork": "Arbeit",
    "voice.activityFamily": "Familie",
    "voice.activitySocial": "Gesellschaft",
    "voice.activityRest": "Erholung",
    "voice.activityStudy": "Lernen",
    "report.title": "Belső Iránytű — Befindensbericht",
    "report.made": "Erstellt: {date}",
    "report.summary": "Zusammenfassung",
    "report.days": "Anzahl der Tage: {count}",
    "report.avgMood": "Durchschnittliche Stimmung (0–100): {value}",
    "report.avgStress": "Durchschnittlicher Stress (1–10): {value}",
    "report.avgEnergy": "Durchschnittliche Energie (1–10): {value}",
    "report.quadrantDays": "4-Quadranten-Tage: {list}",
    "report.moodChart": "Verlauf der Stimmung",
    "report.recent": "Letzte Tage",
    "report.colDate": "Datum",
    "report.colMood": "Stimmung",
    "report.colStress": "Stress",
    "report.colEnergy": "Energie",
    "report.trackers": "Verfolgung",
    "report.assessments": "Selbstreflexions-Zusammenfassung",
    "report.footer": "Der Bericht entstand aus deinen eigenen Tagebuchdaten — kein medizinischer Rat und keine Diagnose.",
    "report.quadrantHighNeg": "angespannt-aktiv",
    "report.quadrantHighPos": "heiter-aktiv",
    "report.quadrantLowNeg": "bedrückt-unruhig",
    "report.quadrantLowPos": "ruhig-zufrieden",
    "analysis.needMore": "Noch ein paar Einträge, dann kann ich dir Erkenntnisse geben — nach drei startet die Analyse.",
    "analysis.highStress": "Dein durchschnittlicher Stress ist hoch ({stress}/10). Schau, welche Aktivitäten oder Tage ihn hochziehen.",
    "analysis.lowStress": "Dein durchschnittlicher Stress ist niedrig ({stress}/10) — eine gute Richtung.",
    "analysis.lowEnergy": "Deine Energie ist oft niedrig. Mehr Ruhe oder Bewegung könnte helfen.",
    "analysis.sameMood": "Die Stimmung in deinen letzten 3 Einträgen ist gleich ({mood}).",
    "analysis.bestTag": "An Tagen mit „{tag}“ ist deine Stimmung durchschnittlich {delta} Punkte besser.",
    "analysis.worstTag": "Nach „{tag}“ ist deine Stimmung meist {delta} Punkte schlechter.",
    "analysis.stressDays": "An {days} Tagen hast du Stress von 8 oder höher angegeben.",
    "analysis.balanced": "Das wirkt wie eine ausgeglichene Phase — beobachte die Muster weiter.",
    "dates.weekdayMon": "Mo",
    "dates.weekdayTue": "Di",
    "dates.weekdayWed": "Mi",
    "dates.weekdayThu": "Do",
    "dates.weekdayFri": "Fr",
    "dates.weekdaySat": "Sa",
    "dates.weekdaySun": "So",
    "yearInPixels.monthJan": "Jan",
    "yearInPixels.monthFeb": "Feb",
    "yearInPixels.monthMar": "Mär",
    "yearInPixels.monthApr": "Apr",
    "yearInPixels.monthMay": "Mai",
    "yearInPixels.monthJun": "Jun",
    "yearInPixels.monthJul": "Jul",
    "yearInPixels.monthAug": "Aug",
    "yearInPixels.monthSep": "Sep",
    "yearInPixels.monthOct": "Okt",
    "yearInPixels.monthNov": "Nov",
    "yearInPixels.monthDec": "Dez",
    "correlation.mood": "Stimmung",
    "correlation.stress": "Stress",
    "correlation.energy": "Energie",
    "correlation.sleep": "Schlaf",
    "cardStates.noData": "— heute noch keine Daten",
    "lock.noPin": "Es ist keine PIN gesetzt.",
    "lock.tooManyAttempts": "Zu viele Versuche — ich brauche eine kurze Pause.",
    "lock.wrongPin": "Falsche PIN.",
    "attachments.errorStorage": "Nicht genug Speicherplatz für den Anhang.",
    "attachments.errorTooLarge": "Die Datei ist zu groß (maximal 5 MB).",
    "attachments.errorVideoType": "Es lässt sich nur eine Videodatei wählen (video/*).",
    "backup.dueNote": "Zeit für eine neue Sicherung. Einstellungen → Verschlüsselte Cloud-Sicherung.",
    "backup.writeFailed": "Die Sicherung ist fehlgeschlagen. Versuch es erneut.",
    "backup.pickerMissing": "Dieser Browser kann keine Datei auswählen.",
    "backup.notAllowed": "Der Browser hat den Dateivorgang nicht erlaubt.",
    "backup.ioFailed": "Der Dateivorgang ist fehlgeschlagen. Versuch es erneut.",
    "backup.pickerDescription": "Belső Iránytű Sicherung",

    // DIE MANUELLE AKTUALISIERUNG — `components/AppUpdateCard.tsx`. Fünf
    // Schlüssel, und die Karte ist die eine Stelle, an der man gegen „ich sehe
    // immer noch die alte Version" etwas tun kann: der Knopf verwirft jeden
    // Cache und lädt neu, und der Hinweis sagt das VOR dem Druck, nicht danach.
    "update.cardTitle": "Cache leeren und neu laden",
    "update.note":
      "Wenn die neueste Version nicht angekommen ist — alte Oberfläche, alter Text —, verwirft dieser Knopf alles: Er löscht die Caches, beendet die im Hintergrund laufende App-Instanz und lädt die Seite neu.",
    "update.action": "App aktualisieren",
    "update.busy": "Aktualisiere…",
    "update.failed":
      "Der Browser hat das Neuladen nicht zugelassen. Schließe den Tab und öffne ihn neu — die Caches sind bereits geleert.",
    "update.stuckGuide":
      "Wenn das nicht hilft: 1) Schließe alle Tabs und öffne die App neu; 2) wenn du immer noch die alte Version siehst, öffne die Entwicklerwerkzeuge (F12) und nutze Application → Service Workers → Unregister, dann Application → Storage → Clear site data; 3) zum Schluss Strg+Shift+R.",
    "stale.title": "Diese Seite läuft mit einer alten Version",
    "stale.body":
      "Ein Hintergrundprozess liefert eine frühere Version aus. Dieser Knopf löscht alle Caches und lädt die Seite unter einer frischen Adresse.",
    "ai.title": "KI-Assistent",
    "ai.summary": "Wöchentliche Zusammenfassung auf dem Gerät oder mit eigenem Schlüssel",
    "ai.modeGroup": "Wie soll er arbeiten?",
    "ai.modeOff": "Aus",
    "ai.modeOffHint": "Kein Download und keine Netzwerkanfrage: Die App sendet nichts nirgendhin.",
    "ai.modeOnDevice": "Läuft auf dem Gerät",
    "ai.modeOnDeviceHint":
      "Ein kleines Sprachmodell läuft in deinem Browser. Einmal herunterladen, danach funktioniert es auch ohne Netzwerk.",
    "ai.modeByok": "Mit eigenem Schlüssel",
    "ai.modeByokHint":
      "Dein eigener Schlüssel fragt bei einem externen Anbieter Text an, nur mit den Einträgen dieser Woche.",
    "ai.providerGroup": "Anbieter",
    "ai.providerOpenai": "OpenAI",
    "ai.providerDeepseek": "DeepSeek",
    "ai.hostNotice": "Die Anfrage geht an {host} und enthält nur die Daten dieser Woche.",
    "ai.keyLabel": "API-Schlüssel",
    "ai.saveKey": "Schlüssel speichern",
    "ai.clearKey": "Schlüssel löschen",
    "ai.keySaved": "Gespeichert: {masked}",
    "ai.keySessionNote":
      "Der Schlüssel lebt nur, solange dieser Tab offen ist — er kommt nicht in dein Journal, nicht in deine Sicherung und wird nirgends sonst notiert.",
    "ai.download": "Modell herunterladen ({mb} MB)",
    "ai.downloading": "Download: {percent}%",
    "ai.modelReady": "Das Modell ist bereit und läuft auf dem Gerät.",
    "ai.delete": "Modell löschen",
    "ai.deleteConfirm":
      "Heruntergeladenes Modell wirklich löschen? Das gibt den Speicher frei, aber du musst es vor der nächsten Nutzung erneut herunterladen.",
    "ai.deleted": "Modell gelöscht.",
    "ai.deleteError": "Das Modell konnte nicht gelöscht werden.",
    "ai.errorOff": "Die KI ist aus. Du schaltest sie unter Einstellungen → Sonstiges ein.",
    "ai.errorNoKey": "Kein API-Schlüssel gespeichert.",
    "ai.errorInvalidKey": "Der Anbieter hat den Schlüssel abgelehnt.",
    "ai.errorRateLimited": "Zu viele Anfragen — versuche es gleich noch einmal.",
    "ai.errorNetwork": "Netzwerkfehler, diesmal hat es nicht geklappt.",
    "ai.errorTimeout": "Zeitüberschreitung: Die Anfrage hat zu lange gedauert.",
    "ai.errorBadResponse": "Die Antwort war nicht verwendbar.",
    "ai.errorModel": "Das lokale Modell konnte nicht geladen werden.",
    "ai.promptIntro": "Du schreibst die wöchentliche Zusammenfassung des eigenen Journals, auf Deutsch.",
    "ai.promptStyle": "Schreibe 3–5 kurze Sätze in freundlichem Ton als einen Absatz.",
    "ai.promptGround":
      "Arbeite nur mit den angegebenen Daten, erfinde keine Details und sag, wenn die Daten zu dünn sind.",
    "ai.promptQuestion": "Schreibe die wöchentliche Zusammenfassung aus diesen Daten:",
    "insights.ai.section": "Wöchentliche KI-Zusammenfassung",
    "insights.ai.title": "Wöchentliche KI-Zusammenfassung",
    "insights.ai.summary": "Schreibt einen kurzen Text aus den Einträgen dieser Woche",
    "insights.ai.generate": "Zusammenfassung schreiben",
    "insights.ai.busy": "Denkt nach…",
    "insights.ai.off":
      "Die KI ist aus. Schalte sie unter Einstellungen → Sonstiges ein, wenn du einen Text über diese Woche möchtest.",
    "insights.ai.empty": "Für diese Woche gibt es keinen einzigen Eintrag.",
    "insights.ai.privacyNote": "Das Modell sieht nur die Daten dieser Woche.",
    "insights.ai.machineNote": "Maschinell geschrieben — lies es kritisch.",
  },
};

/** Every key, in catalogue order — the list a switcher or a docs page wants. */
export function translationKeys(): TranslationKey[] {
  return Object.keys(HU) as TranslationKey[];
}

/**
 * What a locale has, and what it still owes.
 *
 * "Ready for English and German" is a claim until something can measure it, and
 * a claim of that kind goes stale the moment somebody adds a key to `HU` and
 * forgets the other catalogues. These four functions are the measurement, which
 * is what makes `docs/PROJECT-INVENTORY.md`'s "how to add a language" section a
 * procedure rather than a promise: a contributor adds a key, runs the coverage
 * test, and is told the truth about what they left behind.
 *
 * They return keys rather than counts wherever a list is the more useful shape,
 * because the list is what a translator needs — "which strings are still
 * untranslated" is a work queue, and "62%" is not.
 */
export function translatedKeys(locale: Locale): TranslationKey[] {
  return translationKeys().filter((key) => MESSAGES[locale]?.[key] !== undefined);
}

/** The keys `locale` has not translated yet — the work queue, in catalogue order. */
export function missingKeys(locale: Locale): TranslationKey[] {
  return translationKeys().filter((key) => MESSAGES[locale]?.[key] === undefined);
}

/**
 * How far along a catalogue is, as integers rather than a rounded percentage.
 *
 * Integers on purpose: `total` is 9 when the framework shipped and 139 once the
 * settings page came across, and a percentage would round several of those
 * states onto the same number while the gap between them is the whole point. A
 * test can also assert `translated` rose without being confused by rounding.
 */
export function localeCoverage(locale: Locale): {
  translated: number;
  total: number;
  complete: boolean;
} {
  const total = translationKeys().length;
  const translated = translatedKeys(locale).length;
  return { translated, total, complete: translated === total };
}

/** Whether one locale has one key, without a lookup followed by a comparison. */
export function hasTranslation(locale: Locale, key: TranslationKey): boolean {
  return MESSAGES[locale]?.[key] !== undefined;
}

/** Narrowing guard for a value coming from outside the type system. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * A locale for a value that may not be one, for the surfaces that DISPLAY the
 * choice rather than validate the store.
 *
 * The load path deletes an unknown value (`lib/store`'s `normalizeSettings`), so
 * what this function is for is the window before that happens: a settings object
 * that came from a restored backup file rather than from storage, whose
 * `locale` is whatever the file carried. The picker reads it to press a button
 * and to name the language in its own summary line, and `undefined` there would
 * be a summary reading `undefined${' '}felület` beside three unpressed buttons.
 * One function, so the button and the summary cannot disagree about which
 * language is in force — the same reason the names themselves live in the
 * catalogue rather than in the view.
 */
export function coerceLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * A browser tag → a supported locale, or Hungarian.
 *
 * Takes the base language on purpose: `de-AT` is German, `fr` is not a locale
 * this app has, and anything unrecognised is Hungarian rather than a guess.
 * The split on `-` and `_` covers both the BCP 47 hyphen and the underscore
 * some platforms report.
 */
export function resolveLocale(tag: string | null | undefined): Locale {
  const base = (tag ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

/** Replaces `{name}` placeholders; unknown names are left in place, not erased. */
function interpolate(template: string, values: Record<string, string | number> | undefined): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/**
 * The lookup every component uses.
 *
 * `locale` defaults to the locale IN FORCE — the reader's own choice from the
 * Settings picker, or Hungarian when they have never made one. It is not read
 * from the browser and not pinned to Hungarian either: the default is whatever
 * `setActiveLocale` last settled on, which is a module variable rather than a
 * constant precisely so a lookup written before the switcher existed answers in
 * the right language after it. See the header.
 * The two fallbacks after that are the point of the function: a key the locale
 * has not translated yet, and then a key that does not exist at all. Neither
 * can render as an empty box.
 *
 * The arguments are ordered for the common call. Almost every site wants
 * `t(key)` or `t(key, values)` and never names a locale, so the placeholder
 * record comes second and the locale third.
 */
export function t(
  key: TranslationKey,
  values?: Record<string, string | number>,
  locale: Locale = activeLocale,
): string {
  const text = MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key];
  return interpolate(text ?? key, values);
}