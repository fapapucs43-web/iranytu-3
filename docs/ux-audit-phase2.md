# UX audit, Phase 2 — buttons and interactions

What every interactive element is, and the four that are not one press away
from doing what the reader expects.

**Method: four mechanical searches, then reading only what they found.** A
"must press twice" complaint has a small number of causes, and each has a shape
a machine can find: a button that submits its form by accident, a timer that
delays the handler, a control hidden behind an animation, a disabled attribute
with nothing to explain it. So those four were searched for first. Three of them
came back empty, and the one place a hypothesis did not survive the search is
recorded below as carefully as the findings.

This is an audit. It changes nothing.

---

## 1. The inventory

**279 interactive elements across 46 files.**

| Element | Count |
| --- | --- |
| `<button>` | 170 |
| `<input>` | 58 |
| `<Toggle>` | 17 |
| `<TextInput>` | 14 |
| `<Pill>` | 6 |
| `<a>` | 5 |
| `<Segmented>` | 4 |
| `<select>` | 3 |
| `<Slider>` | 2 |

`TextInput` and `Pill` are counted because they are rendered as elements, not
called as functions; an earlier count of this inventory omitted both and said
259, which was wrong.

---

## 2. What the searches cleared

| Cause of "I had to press it twice" | Result |
| --- | --- |
| A `<button>` with no `type` inside a `<form>`, submitting by accident | **0.** The app has one `<form>` (`PinLockGate.tsx`), with one button, correctly typed `submit` |
| A `setTimeout` or debounce gating a handler | **0.** The six uses are three save-feedback timers (2400 ms), one scheduler tick, one badge announcement, one PIN countdown |
| An opening card delayed or locked by its animation | **none.** `ui.tsx:404` initialises, `:406` toggles, `:419` `aria-expanded`, `:421` `onClick`, `:434` `hidden` on the body. One click, no transition in the way |
| A `disabled` attribute with no reason | **33, all justified**: empty field, work in progress, list full, throttled, first/last item |

The third of those is worth spelling out, because it was a specific suspicion.
`CollapsibleCard` renders the body with the `hidden` attribute rather than a
height transition, so there is no animation to wait out and no moment where the
content is visible but not yet interactive. The whole card is one button.

---

## 3. Two hypotheses that did not survive

**"The breathing exercise needs several presses."** It does not.
`BreathingExercise.tsx:181` and `MeditationPicker.tsx:157` are each a single
button carrying two labels — start and finish. One press, one action.

**"The timer's start/pause/reset logic is muddled."** Start and finish are
clean. But there is no pause, and that is not a tidiness problem. It is §4.1.

---

## 4. Findings

### 4.1 Neither timed activity can be paused

| | |
| --- | --- |
| **Now** | two states: start, finish |
| **Expected** | three: start, **stop**, restart |
| **Where** | `MeditationPicker.tsx:157`, `BreathingExercise.tsx:181` |

The button's handler is:

```ts
setRunning(false);
setState(startEngine(pattern));
```

It stops **and resets**. `elapsed` is derived from that state
(`MeditationPicker.tsx:60`: `const elapsed = elapsedSeconds(pattern, state);`),
so stopping discards the elapsed time with no way to get it back. A ten-minute
practice interrupted at minute seven loses the seven minutes, and the only
control that looks like it might keep them — "finish" — is the one that throws
them away.

This is the same class of problem as the four searches in §2, found by reading
rather than by pattern: not an extra press but a **missing state**. The reader
who wants to pause and resume has no way to express it, and the control nearest
to "stop" silently means "discard".

**The fix:** a third state. Stop keeps the state; finish clears it.

### 4.2 The PIN countdown is never announced

`PinLockGate.tsx:66` carries the comment:

```ts
/* Live countdown while throttled. */
```

and `:122` renders it:

```tsx
{throttled && (
  <p className="pin-error">
```

A plain `<p>`, with no `aria-live`. The countdown ticks once a second and the
submit button sits `disabled` for the duration, so a screen-reader user hears
nothing at all while the control they are being refused is unavailable. The
intent is in the comment; the attribute that carries it is missing.

**The fix:** `aria-live="polite"`, following the toast pattern already in
`AppContext` rather than inventing one.

### 4.3 Thirty-six button labels bypass the catalogue

Seventeen files render their button label as a raw Hungarian literal instead of
a catalogue key. The densest:

| File | Count | Labels |
| --- | --- | --- |
| `PinLockSettings.tsx` | 7 | PIN beállítása · Mentés · Mégse · PIN módosítása · Kikapcsolás · Zárolás kikapcsolása · Mégse |
| `AttachmentPicker.tsx` | 5 | Fénykép · Felvétel leállítása · Hang felvétele · Hangfájl · Videó |
| `EntryDetail.tsx` | 4 | Törlés · Szerkesztés · Mégse · Mentés |
| `RecordingFlow.tsx` | 4 | Tovább · Hozzáadás · **Kontextus nélkül mentés** · Mentés |
| `MicroLessonCard.tsx` | 2 | Kész · Kipróbálom |
| `CustomThemeEditor.tsx` | 2 | Visszaállítás · Mentés |
| `FoodAiSettingsCard.tsx` | 2 | Kulcs mentése · Kulcs törlése |
| `IconSetPicker.tsx` | 2 | Nincs beállítva · A jelenlegi megjelenés |
| `InstallPrompt.tsx` | 2 | Telepítés · Telepítés most |
| `MedicationTimesCard.tsx`, `CustomTrackerManager.tsx`, `DailyGoals.tsx`, `HealthImportCard.tsx`, `WeeklyReflectionCard.tsx`, `BackgroundImagePicker.tsx`, `PinLockGate.tsx` | 1 each | |

The two labelled buttons of the recording wizard are the ones that matter most
here: they are the exits, and an exit the reader cannot find is how a journal
loses an entry.

This is the same finding as §2.3 of the Phase 1 audit, in a different place —
thirteen card titles there, thirty-six button labels here.

**It also corrects a claim.** The audit closing the i18n work stated that the
catalogue was complete for Hungarian and that everything the reader sees was in
it. That is not true. There are 491 catalogue keys and these forty-nine strings
are outside them.

---

## 5. What this audit recommends leaving alone

**The recording wizard's three steps.** `RecordingFlow`'s "continue" button is
never disabled, so the context step and the emotion step can be skipped. That is
better design than the thing being looked for: the mood coordinates are
mandatory, because without them there is no quadrant, and everything else is
optional with an explicit "save without context" exit beside the primary one. In
a journal, one tap must never be the thing that stands between a reader and
saving.

---

## 6. The pattern Phase 3 should copy

The tab-order up and down buttons at `SettingsView.tsx:336` and `:345` are the
best-implemented reorder control in the app, and they were a suspicion until
they were read. Each button's `aria-label` names the row **and its position** —
`settings.nav.tabUp` takes `{n}` and `{name}` — so a screen reader hears
"Felmelé: 1. Ma", which is also why the disabled button at the top of the list
explains itself: the number in the label says it is already first.

Whatever Phase 3 builds should look like that, not like a row of bare arrows.

---

## 7. What this audit does not establish

- **No timing was measured.** Nothing here says how long a collapse takes or
  whether an animation feels slow; only that none of them gates an action.
- **No tap-target sizes or spacing were measured.** A 32-pixel button that
  works on the first press is still hard to hit.
- **The thirty-six labels are a list, not a priority.** Which ones enter the
  catalogue, and in what order, is a copy decision, not an interaction one.
- **§4.1 and §4.2 were found by reading.** The four searches in §2 did not
  produce them, which means there is no mechanical sweep here that would catch
  the next one.
