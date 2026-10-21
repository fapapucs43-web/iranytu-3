# Feature recommendations — eight apps worth learning from

What this document is: a review of the eight consumer apps a reader of this one
is most likely to also use — **Daylio, Moodfit, Bearable, Finch, Day One,
Journey, Reflectly, Stoic** — each read for ONE transferable mechanic and then
mapped onto this app's own surfaces. It is not a list of features to copy. Every
entry names the mechanic, the surface it would land on, its priority and what it
would cost, and most entries also say what we deliberately leave behind.

The boundaries every proposal below obeys and none of them may break:

- **Offline first, no account.** There is no server to sync with; the backup
  file is the escape hatch. A proposal that needs the network is out, and none of
  the eight's cloud services are proposed here even where they are good.
- **No clinical claim.** The vocabulary and the promise rules are modules, not
  guidelines: `src/lib/articleBlocklist.ts:43` — `export const CLINICAL_VOCABULARY = /diagnózis|beteg|gyógyszer|kezelés|tünet/i;` — and
  `src/lib/articleBlocklist.ts:54` — `export const THERAPEUTIC_CLAIMS = /gyógyít|gyógyítja|diagnosztikus|kezelésre/i;`. Nothing below proposes
  to diagnose, treat, or score a person, and no proposal may name a condition.
- **Hungarian first, every generation.** New copy enters through the catalogue
  (`t(...)`) and is measured by the raw-string sweep. The estimates below
  include that cost, because a card without its keys is not a card.
- **No pressure by design.** No loss-aversion streaks, no guilt summaries, no
  "you broke your record" cards. One quiet reminder a day is a feature of this
  app, not a gap in it.

## How to read the estimates

| Size | Means | Rough shape |
| --- | --- | --- |
| **S** | one commit | one card or one module plus its tests, ~150–300 lines |
| **M** | two or three commits | a list-shaped module, its card, one hook-in (Ma / Elemzés / Napló), tests |
| **L** | a batch | new vetted content (programs, articles) plus the surfaces around it |

Priority uses the same three words the proposals document uses: **magas**,
**közepes**, **alacsony**.

## The ranked roadmap

| # | Proposal | From | Where it lands | Priority | Estimate |
| --- | --- | --- | --- | --- | --- |
| 1 | Ezen a napon | Day One | Napló | magas | S |
| 2 | Hangulat-pillanat (a day can hold more than one) | Daylio | Ma + Elemzés | magas | M |
| 3 | Gondolat-napló a rossz napon | Moodfit | Ma | magas | M |
| 4 | Tényező-rangsor | Bearable | Elemzés | magas | M |
| 5 | Reggeli szándék / esti visszatekintés | Stoic | Ma | magas | M |
| 6 | Napi apró lépés | Finch | Ma | közepes | S |
| 7 | Hangulat-emelő tevékenység ajánlás | Moodfit | Ma / Elemzés | közepes | S |
| 8 | Gyógyszer-szedési arány | Bearable | Elemzés | közepes | S |
| 9 | Keresés szűrőkkel | Day One | Napló | közepes | M |
| 10 | Beszélgetős bejegyzés | Reflectly | Ma | közepes | M |
| 11 | Hónap-hangulatlista | Daylio | Elemzés | közepes | S |
| 12 | Többnapos programok | Journey | Felfedezés | közepes | L |
| 13 | A hét története | Reflectly | Elemzés | alacsony | S |
| 14 | Napi kérdés a Naplóban | Journey | Napló | alacsony | S |
| 15 | Rituálé-páros az emlékeztetőben | Stoic | Beállítások | alacsony | S |
| 16 | Heti kedves összefoglaló | Finch | Elemzés | alacsony | S |

The two waves worth treating as a unit: **1–5** are the ones with the best
evidence in this app's own data (they read what is already stored and add no new
content debt), and **12** is the one that only pays off after a content batch.

* * *

## 1. Daylio — the one-tap mood

**What it is.** The most-used micro-journaling app there is: a mood and a couple
of activity tags, one tap, no typing required, and a month grid that colours
itself as the days accumulate.

**What we take.**

| Proposal | Where | Priority | Estimate |
| --- | --- | --- | --- |
| Hangulat-pillanat — a timestamped 1–5 tap with optional activity tags, in its own list key, so a day can hold a morning and an evening reading | Ma (a three-tap row), Elemzés (an average per time of day) | magas | M |
| Hónap-hangulatlista — a compact month grid coloured by the day's mood, with the weekday average | Elemzés | közepes | S |

The first one is the real transfer: this app records one mood a day and the
day's own form is deliberately long. A moment log is additive — a new key beside
`belso-iranytu-habits-v1` rather than a change to `Entry` — and the day's entry
stays the single source for the forecast, so nothing that reads `Entry` has to
learn a second shape. The month grid is nearly free: the days it colours are
already in `entries`.

**What we leave.** Their streak-centred nudges and the rating prompts. Their
"best/worst activity" percentages, too: computed from one entry a day they would
be honest arithmetic pretending to be evidence.

## 2. Moodfit — CBT in the flow of a bad day

**What it is.** Mood tracking wrapped around short CBT exercises, goals, and
mood-boosting suggestions.

**What we take.**

| Proposal | Where | Priority | Estimate |
| --- | --- | --- | --- |
| Gondolat-napló a rossz napon — when today's mood is 1–2, Ma offers a three-step thought record (helyzet → gondolat → kiegyensúlyozottabb gondolat) that writes into the existing entry | Ma | magas | M |
| Hangulat-emelő tevékenység ajánlás — the reader's own past activities ranked by the mood of the days they appear on, offered on a low day | Ma, Elemzés | közepes | S |

The thought record is the mechanic that makes a low day useful instead of only
recorded; the shape already exists in `src/lib/cbt.ts`, and the write goes to
fields the entry already has, so no migration is involved. The suggestion is a
ranking rule over data already stored, and it has to be phrased as an offer,
never as a prescription.

**What we leave.** Their fixed 30-day programmes as shipped content, and every
sentence that frames a low mood as a condition rather than a day.

## 3. Bearable — the correlation engine done plainly

**What it is.** Tracker-heavy symptom journaling whose signature is a ranked
list of what affects what, plus medication logging.

**What we take.**

| Proposal | Where | Priority | Estimate |
| --- | --- | --- | --- |
| Tényező-rangsor — rank the reader's trackers by their measured effect on the NEXT day's mood, with the sample size and an explicit confidence note | Elemzés | magas | M |
| Gyógyszer-szedési arány — per medication, the last 30 days taken vs scheduled, as a number and a bar | Elemzés | közepes | S |

The ranking is a presentation of `src/lib/lagAnalysis.ts:36` — `export function lagStats(entries: Entry[]): LagStat[] {` — sorted by effect, which is
the one thing that module computes and no card currently shows. The adherence
card reads the dose checks that already exist; it must state its denominator
("recorded doses"), never shame a missed one.

**What we leave.** Their symptom-severity vocabulary, which is clinical, and
the multi-condition health record this app deliberately does not model.

## 4. Finch — gentle gamification, without the economy

**What it is.** Self-care as caring for a small companion: tiny daily goals, a
warm tone, rewards that cost nothing.

**What we take.**

| Proposal | Where | Priority | Estimate |
| --- | --- | --- | --- |
| Napi apró lépés — one small habit suggested from the reader's own list, matched to today's mood and energy, with a single "done" tap | Ma | közepes | S |
| Heti kedves összefoglaló — a recap of what the week contained, specific and warm, never counting what is missing | Elemzés | alacsony | S |

The habit list is already local (`src/lib/habits.ts:84` — `export function getHabits(): HabitStore {`), so the step is a selection rule plus a card. The
recap is a phrasing exercise over `src/lib/weeklyReflection.ts:381` — `export function promptForWeekKey(key: string): WeeklyPrompt {` — and the badges.

**What we leave.** The companion, the currency, and every mechanic that works
by fear of loss. A habit that is not done this week is not a debt.

## 5. Day One — a journal that remembers for you

**What it is.** The polished long-form journal: photos, tags, search, "on this
day" memories, export, encryption.

**What we take.**

| Proposal | Where | Priority | Estimate |
| --- | --- | --- | --- |
| Ezen a napon — entries from the same date in earlier years, one tap to open | Napló | magas | S |
| Keresés szűrőkkel — extend the existing search bar with emotion, activity and tracker-value filters | Napló | közepes | M |

"On this day" is the best value in this entire document: every byte it needs is
already stored, and it is the one feature that makes an old journal feel alive
rather than archived. The search filters build on the bar that already exists.

**What we leave.** Cloud sync and accounts — the app's boundary is a design
decision, not a missing integration — and their paid export tier. Here the
export is free and already sitting in Beállítások.

## 6. Journey — guided programmes with a shape

**What it is.** Cross-platform journaling with moods, activity tags, and guided
multi-day programmes.

**What we take.**

| Proposal | Where | Priority | Estimate |
| --- | --- | --- | --- |
| Többnapos programok — existing lessons and meditations wrapped into named programmes with day-by-day progress (a 7-day gratitude programme to start) | Felfedezés | közepes | L |
| Napi kérdés a Naplóban — one prompt a day from the micro-lesson pool, answered inline | Napló | alacsony | S |

The programmes are the one proposal here that costs real content work: every
lesson sentence passes the same sweeps the articles do, which is why the
estimate is a batch and the priority is not higher.

**What we leave.** Drive backup and community templates. Nothing a reader sees
should depend on someone else's server or someone else's feed.

## 7. Reflectly — the conversation instead of the form

**What it is.** Journaling as a chat: the app asks, the reader answers, an
emotion and an intensity follow, and the session ends with something kind.

**What we take.**

| Proposal | Where | Priority | Estimate |
| --- | --- | --- | --- |
| Beszélgetős bejegyzés — a stepped, one-question-at-a-time entry mode (mood → what happened → one kind sentence to yourself) as an alternative to the form | Ma | közepes | M |
| A hét története — a short narrative recap of the week, built from the entries' own words and facts | Elemzés | alacsony | S |

The stepped mode is a second path to the SAME `Entry` shape, never a second
store; a reader can switch to the form at any step and lose nothing. The recap
has to be assembled from the reader's data, not generated prose, which keeps it
inside the non-clinical rule by construction.

**What we leave.** Their machine-written "insights". Generated text is exactly
where a clinical-sounding sentence would slip past a reviewer, and this app
writes its sentences on purpose, in Hungarian, and vets them.

## 8. Stoic — two rituals a day

**What it is.** Morning preparation and an evening reflection, with prompts,
mood tracking, breathing and meditations around them.

**What we take.**

| Proposal | Where | Priority | Estimate |
| --- | --- | --- | --- |
| Reggeli szándék / esti visszatekintés — a two-step ritual card on Ma: one intention in the morning, one thing that went well in the evening | Ma | magas | M |
| Rituálé-páros az emlékeztetőben — offer the existing reminder messages as a morning/evening pair | Beállítások | alacsony | S |

The ritual is what turns the day's entry from a report into a practice, and it
writes to the reflection fields the entry already carries. The second proposal
is small because `src/lib/notifications.ts:30` — `export const REMINDER_MESSAGES = [` — already holds the three messages; it is a wording and
timing change, not a scheduler change.

**What we leave.** The quote feed — every line would have to be vetted like an
article, and a rotating aphorism ages badly — and their subscription tiers.

* * *

## What none of the eight can give us

Worth writing down, because each of these is a deliberate difference rather
than a gap:

- **An account and a cloud.** Their sync is convenient and their servers are
  the reason their journals can disappear. Here the file boundary is the
  feature: `docs/PROJECT-INVENTORY.md` §5 documents exactly what export and
  import guarantee.
- **A social feed.** None of the eight needs one and the one that has one is
  worse for it.
- **A diagnosis.** A tracker that implies it knows what a symptom means is
  lying politely. The correlation surfaces here say "measured on n days",
  never "because".
- **Engagement at any cost.** Notification schedules, streak rescue, and
  "come back" copy are monetisation mechanics wearing care as a costume. This
  app's one reminder is a timer a reader sets for themselves.
