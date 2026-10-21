# Mega feature batch — structures before implementation

This document is the shape of the batch, written before the code. Everything is
additive: existing stores, entries and settings keep their current meaning.

## Phase 1 — Companion

`src/lib/companion.ts`

```ts
type CompanionType = "animal" | "plant" | "light" | "symbol" | "abstract";
type CompanionColor = "amber" | "sage" | "sky" | "rose" | "violet";

type CompanionState = {
  type: CompanionType;
  level: number;
  xp: number;
  streak: number;
  lastActiveDate: string; // ISO day, "" before the first activity
  color: CompanionColor;
};
```

* Key: `belso-iranytu-companion` (own key; never in `AppData`/backups).
* XP: journal +20, breathing +10, meditation +25; level = 1 + floor(xp / 100).
* Missing days never delete the state. They only make the avatar render
  `dimmed` until the next activity; a gap resets the streak, not the companion.
* `CompanionCard` mounts directly below the mood card on the Ma tab.
* `CompanionSettingsCard` mounts in Settings → Megjelenés.

## Phase 2 — Programs and help

`src/lib/programs.ts`

```ts
type ProgramWeek = {
  week: number;
  title: string;
  theme: "body" | "thoughts" | "connection" | "values" | "integration";
  focus: string;
  practice: string;
  prompts: string[];
};

type ProgramProgress = {
  programId: string;
  startedAt: string;
  currentWeek: number;
  answers: Record<string, string>; // "<programId>:<week>:<promptIndex>"
  completedAt: string | null;
};
```

* One five-week structured programme, one active programme at a time.
* Key: `belso-iranytu-program-v1`.
* `ProgramsCard` mounts in Felfedezés → Terápia.
* `SeekHelpCard` mounts in the same drawer, is an interactive yes/no tree, and
  imports the crisis resources instead of duplicating any phone number.

## Phase 3 — Sleep and wearable

`src/lib/sleep.ts`

```ts
type SleepEntry = {
  date: string;
  bedtime: string;  // "HH:mm"
  wake: string;     // "HH:mm"
  quality: 1 | 2 | 3 | 4 | 5;
};
```

* Key: `belso-iranytu-sleep-v1`.
* `SleepLogCard` mounts in Egészség → Egyéb.
* `SleepMoodCorrelationCard` joins sleep quality to the same day's mood on the
  Elemzés tab (inside the existing correlation section, no new section id).
* Apple Health: add `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` as
  `hrv` samples and `HKQuantityTypeIdentifierRestingHeartRate` as resting-HR
  samples. Both flow through the same preview/merge pipeline as HR/SpO2.

## Phase 4 — AI

`src/lib/ai.ts`

```ts
type AiMode = "off" | "on-device" | "byok";
type AiProvider = "openai" | "deepseek";
```

* Config key: `belso-iranytu-ai-config`.
* BYOK secret key: `belso-iranytu-ai-key` (never in `AppData`/backups).
* On-device: lazy `import("@mlc-ai/web-llm")`; no download until the reader
  presses the download button or asks for the first summary.
* Summary prompt: built only from the current week's entries; no network in
  `off`, no network in `on-device` after the model is cached, and an explicit
  host notice in `byok`.
* `AiSettingsCard` mounts in Settings → Egyéb.
* `WeeklyAiSummaryCard` mounts in Elemzés → Heti összefoglaló.

## Phase 5 — Support wall

`src/lib/supportWall.ts`

```ts
type SupportNote = {
  id: string;
  text: string;
  createdAt: number;
};
```

* Key: `belso-iranytu-support-wall-v1`.
* Off by default (`settings.supportWallEnabled === true` is the only on).
* `SupportWallCard` mounts in Felfedezés → Önismeret.

## Wiring rules

* New storage keys are added to `src/lib/storageKeys.ts` before the gates run.
* New components own their copy; the views they mount in receive no new
  Hungarian literals (the existing i18n sweep stays meaningful).
* No new runtime dependency except `@mlc-ai/web-llm`, imported dynamically.
* Every new card uses the existing `CollapsibleCard` primitive.
