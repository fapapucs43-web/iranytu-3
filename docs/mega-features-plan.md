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
* On-device model: `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`, a PREBUILT entry
  of web-llm 0.2.86 (276.3 MiB measured over its 17 files; the earlier
  default `Qwen3-0.6B-q4f16_1-MLC` measures 335.2). The original
  `dict-xs-mlc-q4f16_1` was not in that list — a HuggingFace repo whose
  download would have thrown "model not found" — which is the failure the
  prebuilt-only rule exists to avoid.
* Phase 4.1 — delete button: `isModelCached()` / `deleteOnDeviceModel()`
  in `src/lib/ai.ts`, built on the package's own `hasModelInCache` /
  `deleteModelAllInfoInCache` exports (v0.2.86, `lib/index.d.ts:7`) and
  `engine.unload()` first, so the three `webllm/*` caches are removed by the
  library that wrote them rather than by a hard-coded name.
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
  createdAt: string;
  pinned?: boolean;
};

type SupportWallState = { enabled: boolean; entries: SupportNote[] };
```

* Key: `belso-iranytu-support-wall` — no `-v1` suffix: the blob's repair rules
  (`loadSupportWall`) are the versioning, so a version field would be a second
  mechanism deciding the same question.
* Off by default, and the switch lives IN the state (`enabled: false`), not in
  `settings.*`: a card that explains itself where it sits needs no second
  switch in Settings for a reader to hunt for.
* Caps: 280 characters per note with the counter drawn next to the box, 200
  notes. Overflow spends the OLDEST UNPINNED note; a wall where every slot is
  pinned REFUSES the add — the pinned promise outranks the cap in both rules.
* The key is in `WIPE_KEYS` ("Minden adat törlése" takes it) and in
  `BACKUP_INCLUDED_KEYS` (it is the reader's own writing; nineteen keys travel
  in a backup since this phase).
* `SupportWallCard` mounts in Felfedezés → Önismeret, id `tools-support-wall`.
* Zero network: no client, no fetch, no moderation, no sharing — the engine is
  `localStorage` plus pure functions, which is also why its rules are tested
  in `tests/lib/support-wall.test.ts` without jsdom.

## Wiring rules

* New storage keys are added to `src/lib/storageKeys.ts` before the gates run.
* New components own their copy; the views they mount in receive no new
  Hungarian literals (the existing i18n sweep stays meaningful).
* No new runtime dependency except `@mlc-ai/web-llm`, imported dynamically.
* Every new card uses the existing `CollapsibleCard` primitive.
