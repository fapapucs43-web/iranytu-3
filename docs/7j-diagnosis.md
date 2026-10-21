# 7j diagnosis — stored data and the ő→ö fold

**Scope:** stored data only. Read-only investigation; no code changed.
**Question:** where in the codebase could a stored value be written with `ő` folded
to `ö` (or `ű` to `ü`), and what, if anything, should be done about it.

> **Refreshed 2026-09-29** on the final-wrap-up branch at
> `main @ 9007014 + da7ee64` (Batch 11 merged), 15 commits after the original
> pass. The verdict is unchanged — **(a) leave it** — but the enumeration in §1
> was re-run from scratch, because five batches have added write paths since it
> was written, including one the first pass never had to look at
> (`lib/cardStates.ts`). Every row below was re-verified against the current
> tree; where the original pass was imprecise, the correction is marked. Gates at
> refresh time: `tsc -b --noEmit` clean, `bun test` 1755 pass / 0 fail,
> `vite build` green.

---

## 1. Where could a stored value be written with ő→ö?

**Nowhere, in the current codebase.** Re-verified 2026-09-29: there is still
exactly one place in `src/` that maps `ő → ö` at all, and it still cannot reach
storage.

- `src/lib/reportPdf.ts` — the `PDF_UNENCODABLE` table (`reportPdf.ts:61–74`) and
  `pdfSafe()` (`:77–82`) (`ő→ö`, `ű→ü`, em/en/figure/horizontal dash→`-`, curly
  quotes→straight, `…`→`...`, NBSP→space).
  It is reached through one seam — `const drawable = loaded.ok ? (text) => text
  : pdfSafe` (`reportPdf.ts:129`) — and `drawable` is only ever handed to
  `doc.text(...)` inside the generator (`:143`, `:148`, `:173`, `:280`, `:306`,
  `:315`). Nothing is assigned back to an entry, a setting, or any
  `localStorage` key, and the `loaded.ok ? identity : fold` choice means the
  online path (font embedded, `public/pdf-fonts/`) never folds anything at all.
  A repo-wide search for `ő`/`ű` reaching a `replace` or an arrow function
  returns **no other hit** outside this file.

The complete write surface for stored data was re-enumerated — every
`localStorage.setItem` in `src/`, 18 call sites across 17 files (plus 8
`removeItem` calls) — and each path read
end to end. The five paths the first pass could not have listed (Batch 6–11
additions) are marked ★.

| Write path | What it stores | Transformation of text on the way in? |
|---|---|---|
| `store.ts` `write()` (`:74`, `belso-iranytu-data-v2`) | entries, settings, profile, goals, meds | **None.** `normalizeEntry()` (`:179`) only fills missing fields and clamps numbers; `note`, `tags`, `emotions`, `activities`, `reflection`, `trackerValues` pass through verbatim |
| `store.ts` `migrateLegacy()` (v1→v2, `:212`) | lifted legacy entries | **None** on text; `mapLegacyMood` maps emoji→number, `normalizeLegacyDate` (`:269`) rewrites date punctuation only |
| `store.ts` `removeItem("belso-iranytu-data")` (`:410`) | v1 key deletion on "delete everything" | Deletes a key; stores nothing |
| `csv.ts` import (`csvToEntries`) | user CSV → entries | **None on text.** Header matching lowercases *headers only* (`:176`); note (`:264`), emotions/activities/tags (split on `\|`, no substitution) and tracker `text` cells (`:255`, `value: raw`) are verbatim. The one `replace` on this path is `parseFlexibleDate` (`:146`, `replaceAll(".", "-")`), and it is applied **only to the date cell** (`:228`) — never to prose |
| `assessmentStore.ts` (`:60`) | quota probe, and PHQ answers (numbers) | None; numeric only. The probe writes `"1"` and removes it |
| `customTrackers.ts` (`:70`) / `customActivities.ts` (`:46`) | user-defined labels | **Trim + slice only** (`trim().slice(0, 24)`, icon `slice(0, 4)`, custom text values `slice(0, 200)` at `:143`); no character substitution |
| ★ `cardStates.ts` (`:74`, `belso-iranytu:cardStates`) | `{id: collapsed}` per collapsible card | **None, and nothing to fold.** Keys are app-defined ids (`tracker-<headId>`, the four feature-card ids), values are booleans; the tolerant parser (`:39–53`) keeps only boolean values, so the blob cannot hold text at all |
| ★ `notifications.ts` (`:122`, `belso-iranytu-reminder-message`) | the chosen reminder message | **None — and it cannot.** The value is only written after `REMINDER_MESSAGES.includes(message)` passes, so what lands in storage is verbatim one of three app constants (`notifications.ts:20–24`) |
| ★ `achievements.ts` (`:123`) / `medReminders.ts` (`:185`) / `reminderDaemon.ts` (`:29`) | seen-badge ids, fired-dose dates, last-reminder date | None; ids and ISO dates, no user text |
| ★ `weather.ts` (`:155`, `:247`) | the (location, day) cache and the geocode cache | None; the strings are Open-Meteo's own, stored as returned |
| ★ `foodAi.ts` (`:68`) | the user's own OpenAI key | `.trim()` only; an API key has no diacritics to fold |
| `gratitude.ts` (`:58`), `cbt.ts` (`:79`), `habits.ts` (`:69`), `onboarding.ts` (`:54`), `attachments.ts` (`:34`), `appLock.ts` (`:78`) | gratitude entries, thought records, habit state, onboarding, attachment blobs, the PIN record | **None.** No `replace`/character mapping on text in any of them (verified per file) |
| `medReminders.ts` / `notifications.ts` (permission path) | reminder schedule lives inside the main blob; the rest is `Notification` API calls | None |

The other text-bearing path is `src/lib/voice.ts` (LLM voice entry), unchanged in
character: the transcript is sent to OpenAI and the resulting note is stored
verbatim — `.slice(0, 500)` on the LLM path (`:94`) and `.slice(0, 200)` on the
offline parser (`:135`). *(Correction to the first pass, which quoted only the
200-char cap: the LLM path's cap is 500. Both are truncation, not substitution.)*
Its own `normalize()` (`:74`) clamps numbers and trims activity labels; it never
touches diacritics.

**Conclusion for §1 (unchanged, now covering 18 write sites instead of 15):**
with the current code, a stored `ő` cannot become a stored `ö`. The fold exists
only at the PDF boundary, output-only, offline-only.

---

## 2. User-typed or app-generated?

If a folded `ö`-where-ő-should-be is ever found in stored data, its origin
matters, because the repair decision differs:

**App-generated folds (the class the app once shipped):**
- The PDF report between the batch that added `pdfSafe` (7h) and the batch
  that embedded the font (7i) produced folded text **on paper**, not in
  storage — exported PDFs from that window permanently say `Belsö Iránytü`,
  `Közepes erösségü tünetek`. Those files are outside the app's reach.
- **Earlier than that:** before Batch 7h, the fold did not exist and the
  unencodable characters went into the PDF as control bytes
  (`Bels<U+0001>q`). Also output-only, also unrecoverable from here.

**User-typed folds (the realistic source, pre-existing):**
- A user typing on a keyboard/layout that lacks ő may type `ö` themselves —
  `Belsö` in their own note. That is user data, faithfully stored, and it
  has been stored faithfully since the first commit.
- A user pasting text from a source that had already folded it (e.g. an old
  exported PDF copied back in) would import the fold verbatim. The app
  neither caused nor can detect this reliably.

**Tests as evidence of the app-generated class:** `tests/batch7h.test.ts`
(the `pdfSafe` suite) and `tests/batch6-pdf.test.ts` (the folded band label
assertion, later corrected) document that the fold was REAL OUTPUT, correctly
at the time, and `tests/batch7i.test.ts` proves it is now confined to the
offline fallback.

---

## 3. Examples from code / tests

**The fold itself — the only ő→ö in the codebase:**

```ts
// src/lib/reportPdf.ts:61
const PDF_UNENCODABLE: Record<string, string> = {
  "ő": "ö",   // U+0151 -> U+0001 + a stray letter (jsPDF WinAnsi)
  "ű": "ü",   // U+0171 -> ...
  "—": "-",   // ...
};
// :77
export function pdfSafe(input: string): string {
  return input.replace(/[őű—–‒―„"'… ]/g, (c) => PDF_UNENCODABLE[c] ?? c);
}
```

Reached through exactly one seam, and only on the fallback branch:

```ts
// src/lib/reportPdf.ts:129 — inside buildMoodReportPdf()
const drawable: (text: string) => string = loaded.ok ? (text) => text : pdfSafe;
```

`drawable` feeds `doc.text(...)` at `:143`, `:148`, `:173`, `:280`, `:306` and
`:315` and nothing else. No assignment back to entries/settings, and with the
font embedded the identity branch is taken, so `pdfSafe` never runs.

**The tests that pin the boundary (all green):**
- `tests/batch7i.test.ts` — asserts the online path draws `Belső`, `erősségű`
  with real glyphs decoded out of the PDF's ToUnicode CMap, and that the
  folded spellings are **absent**; separately asserts the offline fallback
  draws the folded text (documented, intentional).
- `tests/batch7h.test.ts:826-830` — `pdfSafe` unit tests pin the fold table
  itself (it must keep working when the font is unavailable).
- `tests/batch6-pdf.test.ts` — the band label assertion, three honest
  spellings across three batches (control-byte → folded → correct), each
  documenting what the page said at the time.

**Data-shape evidence in the store:** `normalizeEntry()` (store.ts:179) is
the single choke point every entry passes through on write AND on load. It
contains no character transformation. A stored `ő` survives load; a stored
`ö` survives load equally — which is why a repair *would* be possible if
wanted, but also why there is nothing to repair from the app's own doing.

**The five new write paths, checked individually.** `cardStates.ts` is the only
one the first pass could not have accounted for, and it is the one that looked
riskiest: it is a new blob, written on every collapse toggle, with a tolerant
parser. It is safe for a structural reason worth stating — the map's type is
`Record<string, boolean>`, the parser drops any non-boolean value, and the keys
are card ids the app itself defines. There is no code path by which a word could
enter that blob. `notifications.ts` is the other one worth naming: it is the only
write path that stores **app-generated Hungarian prose**, and it is gated by an
allowlist (`REMINDER_MESSAGES.includes`) precisely so that what lands in storage
is a constant this app ships, spelled correctly.

---

## 4. Options and recommendation

### (a) Leave it — *recommended*

Rationale:
1. **There is nothing app-generated to repair.** §1 shows the fold never
   reached storage. Any `ö`-in-place-of-ő in stored data was typed or pasted
   by the user.
2. **A repair cannot be proven correct.** Hungarian contains genuine minimal
   pairs where `ö` and `ő` are different words (`öröm` "joy" vs `őrz` "to
   guard" are different roots; `tör` "to break" vs `tőr` "dagger"; `kör`
   "circle" vs `kőr` "ace of hearts"). A blanket `ö→ő` rewrite would corrupt
   correctly-typed words. There is no dictionary in the app, and adding one
   to "fix" a problem the app never caused is risk without benefit.
3. **The storage contract is verbatim fidelity.** The app's whole posture —
   nothing leaves the device, data is the user's — argues against silently
   rewriting the words a user typed. `Belső`/`Belsö` in someone's private
   note is their text.
4. **The fold is now fenced.** It exists in one function, on one path, with
   tests on both sides of the boundary (batch7h pins the fold; batch7i pins
   that the normal path never uses it).
5. **Fifteen commits of new write paths changed nothing.** The refresh covered
   the five storage paths added since the first pass (§1, ★ rows) — including
   the only one that stores app-generated prose, which is allowlisted — and
   the argument above is unchanged by any of them. That is evidence, not
   assumption: a repair defended against a *hypothetical* future fold would
   have been a guess, whereas leaving it is defended against the one place a
   fold can exist, which has been re-verified.

### (b) One-time repair on load — *not recommended, but specified for completeness*

If it were ever wanted: the only safe form is a **narrow, opt-in, reversible**
migration, and it still cannot be made safe in general:
- Would have to run in `normalizeEntry`/load path (the single choke point),
  scanning `note`, `reflection.*`, `emotions[]`, `activities[]`, tracker text
  values.
- Cannot distinguish `kör` (correct) from a folded `kőr`; cannot distinguish
  `töröm` (someone writing "töröm" — valid, "I break it") from a folded
  `tőröm`. Hungarian's `ö`/`ő` contrast is phonemic — this is not a
  normalization, it is a rewrite with a real error rate.
- Would need: a settings flag (`foldRepairDone`), an undo export before the
  write, and a user-visible announcement. The cost is real; the benefit is
  fixing text the app did not break.

### (c) Other options considered

- **Detect-and-flag (no rewrite):** mark entries containing suspicious
  patterns for the user to review. Rejected: no reliable pattern exists
  (`ö` is a fully legitimate letter), so this would flag correct Hungarian.
- **Repair only app-known strings:** the only strings the APP generates with
  `ő` are registry labels (already correct in the registry constants) and
  the PDF title (generated fresh each export, correct). There are no
  app-generated stored strings to repair — the enumeration in §1 found the
  defaults (`DEFAULT_ACTIVITIES`, `DEFAULT_EMOTIONS`, tracker labels) are
  stored only after the user picks/edits them, and the constants themselves
  are correct in source.

---

## Bottom line

The `ő→ö` fold **cannot have entered stored data from the app** — it lives in
one output-only function on one offline-only path, with tests on both sides.
Any folded text in storage came from user typing or pasting, and "repairing"
it would mean second-guessing the user's own words in a language where `ö`
and `ő` are distinct phonemes. **Recommendation: (a) leave it.** No code
change, no migration, no repair pass. The diagnosis itself is the deliverable;
this document is the record.

*Refreshed 2026-09-29 on `main @ 9007014 + da7ee64`: all 18 `setItem` sites in
17 files re-read, the five Batch 6–11 write paths added to §1, `pdfSafe` re-confirmed
as the only diacritic fold in `src/` and as reachable only through the
`loaded.ok ? identity : pdfSafe` seam, and the verdict left exactly as it was.
No code changed in that commit either — this document is still the whole
deliverable.*
