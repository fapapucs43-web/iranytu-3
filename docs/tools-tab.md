# The Felfedezés tab — one drawer that had become a junk room, and the five it became

The record of one piece of work in four commits: the toolbox left the Ma tab
for a tab of its own, its content was regrouped from six drawers named after
cards into five named after the work, a third commit wrote the proof that
the cards are where the first two said they are, and a fourth added the tab's
first NEW card — the seven-question check-in in Egészség. The code is in
`src/views/ToolsView.tsx`, `src/views/TodayView.tsx`, `src/App.tsx`,
`src/components/SectionList.tsx`, `src/components/Gad7Card.tsx`,
`src/lib/gad7.ts`, `src/lib/nav-icons.ts`, `src/types.ts` and
`src/lib/i18n.ts`; the guards are in `tests/views/tools-split.test.ts`,
`tests/views/section-reorder-integration.test.tsx`,
`tests/components/Gad7Card.test.tsx`, `tests/lib/gad7.test.ts`,
`tests/batch11-collapse.test.ts`, `tests/batch11-tabs.test.ts`,
`tests/batch11-nutrition.test.ts`, `tests/batch11-sport.test.ts`,
`tests/lib/breathing-consolidation.test.ts`, `tests/lib/meditations.test.ts` and
`tests/batch6-ui.test.ts`.

Every count below is recomputable from the tree: the section ids are
`TOOLS_SECTION_IDS` in `src/views/ToolsView.tsx`, the card map is the table in
`tests/views/tools-split.test.ts`, and the nav row is in
`src/lib/nav-icons.ts`.

## What was reported

1. **The day's work and the toolbox kept stealing each other's scroll.** They
   did: thirteen cards lived inside one `Collapsible` at the bottom of the Ma
   tab, closed by default, so the tab was an entry form with a drawer under it —
   and every card the app shipped made the drawer longer without making it
   easier to find anything in.
2. **A reader who wanted the tools had to scroll past the day to reach them.**
   Which is the same complaint from the other end. The toolbox is what a reader
   opens when they are NOT filling in the form, and the two have no reason to
   share a page.

## Commit 1 — the toolbox gets a tab

The toolbox became the fifth tab: `tools`, labelled **Felfedezés**, with its own
row in the nav registry (`Briefcase`, the 🧰 character, the `briefcase` Fluent
stem), its own view, and its own slot in `settings.sectionOrder`
(`useSectionOrder("tools")`). `TabId` grew the id; `BottomNav` grew the button;
`App` grew the mount; and the vendor script grew the one piece of artwork the
new row needed — the first nav stem with no content glyph behind it, which is
also why two tests that compared the artwork module against the content
registry now compare it against the content registry *plus* the nav rows.

The Ma tab kept the five sections it had. It did not keep the toolbox's clones:
`MiniReflection`, `MiniVitals`, `MiniMeds`, `WeeklyNutritionCard` and
`DailyQuestionCard` moved to the new view, the two transparency cards went with
them, and the four `<h3>` icons that repeated a card's own title inside the old
drawer went away — the drawer head above them says the same words. One
catalogue key left with them: `today.toolbox.badge` ("Több lehetőség") existed
to describe the one big drawer, and the drawer it described is gone.

## Commit 2 — six drawers become five categories

Six drawers named after components made the tab a list. Five named after the
work make it a map:

| Drawer | What it holds |
| --- | --- |
| **Terápia** | Légzésgyakorlat, meditáció, CBT-űrlap |
| **Önismeret** | Rövid önreflexió, hálanapló, napi kérdés |
| **Egészség** | Testi mutatók, gyógyszerek, edzésprogramok, ételfotó, heti összegzés, szokások, önértékelés, a hét kérdéses önkitöltés, és a két átlátszóság-kártya |
| **Kísérletek** | Kísérlet (egy változtatás, három nap, egy ítélet) |
| **Tanulás** | Oktatási könyvtár és a mikro-leckék |

Nothing was dropped in the regrouping. The first commit's `vitals` and `meds`
drawers are the first two blocks of Egészség, and because they are no longer a
drawer head they got their ordinary `<h3>` back: a reader who opened "Testi
mutatók" by name still lands on a heading that says it. The section ids are the
vocabulary of `settings.sectionOrder`, so a stored list that names an id from
the first commit is dropped exactly as an unknown tab is — the same rule, not a
second one.

The reason the drawers are the sections and not headings above them is the
reorder panel. A static heading with reorderable drawers under it is a heading
that lies as soon as a drawer moves past it; making the drawer the unit is what
keeps "move this up" meaning one thing.

## Commit 3 — the proof, and the hole mutation found

A `Collapsible` renders no children while it is closed, and every drawer on the
tab is closed by default. So a card that moved into a drawer is invisible to
every server render in the suite — and so is a card that was silently dropped
on the way. That is not a hypothesis: deleting `<MiniMeds />` from the health
drawer left the whole suite green, which is how the hole was found.

`tests/views/tools-split.test.ts` closes it by reading the view as source and
asserting the modest thing that is actually checkable: each of the fourteen
cards and two transparency cards is mounted exactly once, inside the drawer a
hand-written table says it belongs to, in exactly one drawer, nowhere on the Ma
tab, with the four module gates (`reflectionModule`, `vitalsModule`,
`medsModule`, `assessmentsEnabled`) at the mount rather than somewhere near it.
The table is written out a second time on purpose — deriving it from the view
would compare the code to itself, which is the mistake the reorder panel's rows
were already caught making once.

The rendered half was already pinned where a render can reach it: the five
heads by `tests/views/section-reorder-integration.test.tsx` (each drawer's
`>title<` marker, the default order, and a stored order moving them), the two
transparency cards by `tests/batch11-collapse.test.ts`, and the mount by
`tests/batch11-tabs.test.ts`. The panel's own rows are pinned to the catalogue
now rather than to the section table, so a row labelled with another section's
name fails.

## Commit 4 — the tab's first new card

Everything above MOVED cards. The check-in is the first thing this tab GAINED,
and it is recorded here because three of its decisions were choices rather than
consequences of the split:

1. **It is ungated, and it is the only card in Egészség that is.** The four gates
   on the tab come from one flag each, and `assessmentsEnabled` guards the
   questionnaire because the questionnaire KEEPS A LOG — the consent screen in
   Settings is where a reader agrees to that. This card writes nothing: the
   answers live in component state, they leave with the drawer, and
   `lib/gad7.ts` is deliberately absent from `assessmentStore`, which is shaped
   around one instrument. There is no storage to consent to, so there is no gate
   to put it behind, and mounting it under the questionnaire's flag would have
   widened a consent the reader gave for something else.
2. **The scale and the ceiling are the questionnaire's, imported.** The four
   options are `RESPONSE_OPTIONS`, and the maximum is stated with
   `assessment.maxScore` — the same 0–3 scale, because it is the same scale, and
   a second copy of "21 pont a legmagasabb összpontszám" is a second sentence to
   keep in step. Two namespaces, one scale.
3. **The result cannot render without the disclaimer and the resources.** Both
   are the questionnaire's exported components (`DisclaimerBlock`,
   `ResourcesBlock`), so this is not a promise the card makes about itself: there
   is no branch in `Gad7Result` that draws a total alone.

The card says one more thing in its own copy that the split had nothing to do
with — that the total is not saved — and it says it twice, before the first tap
(`gad7.intro`) and beside the total (`gad7.resultNote`), because "where did my
score go" is asked after the run rather than before it.

## Commit 5 — the tab gets the reader's own name

The tab is called **Felfedezés**. The name the toolbox had on the Ma fül survived
the move in commit 1 on purpose — a new word for the same cards is one more thing
to learn — and it survived exactly one batch: the reader's word for a tab holding
breathing, journalling, vitals, experiments and a library is not "toolbox".

Three things moved with the name, and each one is a place the old name was
written down:

1. **The key itself.** `today.toolbox.title` was accurate while the toolbox was a
drawer at the bottom of the Ma fül; after commit 1 it named a tab that is not the
day's. It is now `tools.title`, in the tab's own namespace, next to the hint and
the five drawer titles — a name is the tab's copy, not the day's. Nothing else
referenced the old key, which is the whole reason the move was cheap.
2. **The nav registry's row.** The bottom bar draws `NAV_ICONS[].label` and the
tab's header draws the catalogue, so the name is SAID TWICE on screen by two
owners. `tests/views/tools-split.test.ts` now asserts the two are equal instead
of trusting a hand to change both: that is the assertion a rename needs, and it
is written as an equality rather than as a second copy of the word.
3. **The two sentences that pointed at the old name.** The icon-policy list
explains which controls stay line-art ("a „Felfedezés" fül doboza"), and the
medication card's empty state sends the reader to the tab by name instead of to
"a Mai nap Eszköztárában" — a place that had not existed since commit 1.

The section id stayed `tools`, and that is deliberate: ids are the vocabulary of
`settings.sectionOrder`, so renaming one drops a stored arrangement for a change
the reader cannot see. The name a reader reads and the id a stored list names are
two different things, and only one of them moved.

## Commit 6 — the fifth drawer is named for the work too

The five category names were chosen in commit 2 so that a reader sees what they
are DOING rather than which component they open. One of them did not hold up:
"Oktatás" reads like a school subject next to four verbs, and once the tab above
it was called Felfedezés a drawer called education said the same thing twice in
two registers. It is now **Tanulás** — the activity, and the one word that covers
both things the drawer holds: the library and the micro-lessons the recording
flow hands out.

Two things deliberately did NOT move:

- **The section id.** It is still `education`. Ids are the vocabulary of
  `settings.sectionOrder`, so a reader who rearranged the drawers before the
  rename still opens the arrangement they left; renaming the id would drop it for
  a change nobody can see.
- **The library.** `EducationLibraryCard` is still the library, its catalogue keys
  are still `tools.library.*`, and the drawer's icon is still `BookOpen`. The
  rename is about the DRAWER's name, and only that.

The renamed value is pinned where nothing else could see it:
`tests/views/tools-split.test.ts` asserts the drawer's name is "Tanulás", that the
old key is gone from the catalogue, and that the id is still the one the stored
arrangement names — because every other test reads the drawer's name out of the
catalogue and would follow whatever word landed there.

## What this record does not claim

- **No render of a drawer's body.** Every card assertion here is source-level,
  for the reason above. A render that opens a `Collapsible` needs a DOM and an
  effect, and this suite has neither by design; what it proves is wiring, and
  the body of a closed drawer is not wiring a render can see.
- **No claim about the reorder panel's ergonomics.** What is pinned is which
  rows it lists and in what order. Whether an eleven-card drawer is the right
  size to move as a unit is a judgement a reader makes, not a test.
- **The categories are editorial.** Terápia / Önismeret / Egészség / Kísérletek
  / Tanulás is one defensible cut of the content, not the only one; a sixth
  card in Kísérletek would not falsify anything, and moving one is a change to
  the table in `tools-split.test.ts` and to `TOOLS_SECTION_IDS` together. Commit
  4 is that friction working as designed rather than a counter-example: adding
  the check-in to Egészség was one row in the table and one line in the drawer,
  and the suite failed loudly until both existed.
- **No claim that the check-in measures anything clinical.** It is seven
  statements about the last two weeks and one of four descriptive bands; the
  band says what the reader reported and never what they have, and the two
  language sweeps that hold the rest of the app's prose to that rule hold its
  seven items and four bands too.
- **A stored order from before this batch is dropped, not migrated.** The ids
  changed with the regroup, so a reader who had arranged the six drawers loses
  that arrangement and gets the default five. Migrating it would mean guessing
  which category each old id became, and a wrong guess is a card the reader
  cannot find.
