# The navigation, rethought — a proposal

**This is a proposal. Nothing in `src/` moved to write it, and nothing below is
applied.** Phase 4's first commit is deliberately the one commit in this batch
whose diff is a document, because the navigation is the most expensive surface
in the app to change: every stored arrangement is written in its vocabulary, the
labels sit under the reader's thumb every day, and a wrong cut moves controls a
reader has already learned. A change here should be argued before it is made.

So this file does three things and stops: it states what the bar IS today from
the tree, maps the four jobs a reader actually does to the taps they cost, names
the places the current shape is under strain, and lays out three options with
what each would cost. §6 is the exact touch list for each option, so adopting one
later is a plan rather than an exploration.

Every number below is recomputable: the rows come from `src/lib/nav-icons.ts`,
the section lists from `TODAY_SECTION_IDS`, `JOURNAL_SECTION_IDS`,
`INSIGHTS_SECTION_IDS`, `TOOLS_SECTION_IDS` and `SETTINGS_SECTION_IDS`, and the
card counts from the `defaultToolSections` table in `src/views/ToolsView.tsx`.

## 1. What the bar is today

Five tabs, in the order the registry lists them. That array order IS the default
order — `settings.tabOrder` is absent until a reader rearranges something, and
`orderedTabs` falls back to `NAV_ICONS` — so this table is also the bar.

| Tab id | Label | View | Sections | What it holds |
| --- | --- | --- | --- | --- |
| `today` | Ma | `views/TodayView.tsx` (503 lines) | 5 — `mood`, `balance`, `lessons`, `activities`, `reflection` | the day's own entry form, plus the weekly reflection |
| `journal` | Napló | `views/JournalView.tsx` (223) | 3 — `calendar`, `search`, `entries` | the month calendar, the search bar, the entry list |
| `insights` | Elemzés | `views/InsightsView.tsx` (335) | 12 — `week`, `year`, `trend`, `correlation`, `lag`, `quadrants`, `export`, `stats`, `achievements`, `grid`, `patterns`, `more` | every chart, the correlation and lag grid, the quadrant cloud, export |
| `tools` | Felfedezés | `views/ToolsView.tsx` (565) | 5 drawers — `therapy`, `self`, `health`, `experiments`, `education` | twenty card mounts across the five drawers |
| `settings` | Beállítás | `views/SettingsView.tsx` (1101) | 8 — `personal`, `appearance`, `navigation`, `tracking`, `reminders`, `security`, `data`, `misc` | every switch the app has, plus the section-reorder panels |

Three rules hold this together and each one is load-bearing:

- **The stored arrangement wins, and an unknown id is dropped rather than
  guessed.** `orderedTabs` returns a permutation of the five, always; a tab
  removed from the registry cannot linger in a blob, and a tab added appears at
  the end for a reader who has arranged the bar.
- **The bar hides on scroll down, and only below 760 px.** Above that width it
  is a sticky bar at the top of the document, and `styles.css` — not a branch in
  a component — is what makes the desktop bar unhideable. `prefers-reduced-
  motion` switches the feature off entirely rather than only its easing.
- **Reorder is per reader and per tab.** `settings.sectionOrder` is a map from
  tab id to an id list, edited in Settings → `navigation`.

## 2. The four jobs, and what each one costs today

| The reader wants to… | First tap | Where they actually land | Taps to the first field |
| --- | --- | --- | --- |
| record how today feels | Ma | the mood picker, at the top | 0 (it is the default tab) |
| record food, a workout, vitals, meds | Felfedezés | Egészség drawer → the card, which is closed | 3 (tab, drawer, card) |
| find something they wrote | Napló | the calendar, then the search bar under it | 1–2 |
| see a pattern | Elemzés | the week summary, then one of eleven other sections | 0–2, plus scrolling |
| change a setting | Beállítás | one of eight sections | 1–2 |

The asymmetry is the point. The day's own form is one tap away and open; the
health half of the record — which is where Batches 14 and 15 put the app's
growth — is three taps and a closed drawer away, behind a tab named for
browsing.

## 3. Where the shape is under strain

**P1 — the record is split across two tabs, and the bigger half is behind a
browsing name.** Ma holds mood, energy, stress, activity tags and a reflection.
Felfedezés → Egészség holds food, water, workouts, vitals, medication, habits,
two questionnaires and two transparency cards — twelve of the twenty card mounts
in that view. A reader who logs breakfast and a walk each morning crosses two
tabs and opens the same drawer twice.

**P2 — two of the five tabs are long enough to need their own map.** Elemzés has
twelve sections and Beállítások eight, and neither offers a jump. The reorder
panel exists, but it moves a section; it does not take a reader to one.

**P3 — five labels is the ceiling, and the labels are long.** `Felfedezés` is
ten characters and `Beállítás` nine, in a bar where the type scale is the
reader's to raise. Any sixth tab is not a sixth button; it is a smaller font.

**P4 — the name no longer describes the contents.** `Felfedezés` was chosen in
Batch 14 for a drawer of things to try. Those things now include the two most
used recording surfaces in the app, and the drawer they live in is named
`health` while the tab above it is named for discovery.

## 4. Three options

### Option A — a recording sheet ("+" in the middle of the bar)

Keep the five tabs and their contents exactly as they are. Add a centre action
that opens a sheet with the four recording entry points (mood, food, workout,
vitals), each one deep-linking to the card that already exists.

- **Fixes:** P1, and only P1. Recording becomes one tap from anywhere, and the
  tab names stop having to carry the burden.
- **Costs:** a new component, a new state (the sheet is open), and a decision
  about the fifth slot — the bar becomes Ma · Napló · **+** · Elemzés · … which
  means a tab has to move to `Felfedezés/Beállítás` adjacency anyway. Every
  deep-link target has to be reachable without a drawer, or the sheet is a
  shortcut into a closed drawer, which is worse than no shortcut.
- **Does not fix:** P2, P3, P4.

### Option B — re-cut the tabs around the job

Six slots is the honest count of jobs: record the day, record health, read the
journal, read the analysis, discover, configure. That means either a sixth
button (P3 says no at the current type scale) or folding two together — and the
two that fold are Ma and Egészség, which is exactly where Batch 14 split them.

- **Fixes:** P1 and P4 (an `Egészség` tab says what it holds).
- **Costs:** the highest of the three. Nine ids across five views are the
  vocabulary of stored arrangements, so a re-cut drops every reader's order —
  the same rule that made the tools split drop the old six-drawer arrangement,
  which was acceptable once and would be a second time, but is the reason not to
  do it casually. The card → drawer table in `tests/views/tools-split.test.ts`,
  the section lists in four views, and the reorder panel's rows all move
  together.
- **Does not fix:** P2.

### Option C — a jump layer over the sections

Leave the five tabs, their names and their contents alone. Add one surface that
answers "take me to X" over the sections the app already has — a filterable list
of section titles (twelve + eight + five + three + five = thirty-three entries),
opened from the header.

- **Fixes:** P2 directly, P1 partially (a reader who knows the name of a card
  can reach it in two taps from anywhere).
- **Costs:** the smallest of the three. The entries are the section ids that are
  already exported for the reorder panel, so the list cannot drift from the
  views; the work is the surface, its keyboard behaviour and its empty state.
- **Does not fix:** P3, P4.

## 5. What I would do, in order

1. **Option C first**, because it is the only one that makes the app easier
   without moving anything, and because it is the input the other two need: the
   list of sections a reader actually jumps to is the evidence for which ones
   deserve to be shallower.
2. **Then Option A's centre action**, once the deep-link targets are known to be
   reachable directly. This is the change a daily reader notices.
3. **Option B only if P4 still bites afterwards** — the name is a copy change
   that can be made on its own (`tools.title` and the registry row are the only
   two places "Felfedezés" is written, and a test asserts they are equal), and
   the re-cut is worth doing once, deliberately, rather than as a rider on
   another change.

None of the three is a prerequisite for the others, and none of them is needed
for the app to work. That is the test a navigation proposal should pass before
it is scheduled.

## 6. If adopted — the exact touch list

**Option C**

- new: a section-index module (pure) exporting `{ tab, id, label }` rows derived
  from the five `*_SECTION_IDS` lists and their views' labels;
- new: the surface component, mounted in `src/App.tsx` beside the header;
- `src/lib/i18n.ts`: one title, one placeholder, one empty state, in three
  locales;
- tests: a lib test for the derived rows (every section id appears once, labels
  match the rendered headings), and a source pin that the five lists are the
  only source — the same bargain `tools-split.test.ts` strikes.

**Option A**

- `src/components/BottomNav.tsx`: a fifth slot that is an action, not a tab —
  which needs `orderedTabs` to keep returning a permutation of five TABS while
  the bar draws six slots;
- `src/views/ToolsView.tsx`: the four recording cards must become reachable
  without their drawers, or the sheet only moves the problem;
- `src/lib/i18n.ts`: the sheet's four labels and its title;
- tests: `tests/batch11-tabs.test.ts` (the bar's relationship to `TabId`),
  `tests/views/tools-split.test.ts` (the card table, if a card now mounts in two
  places), `tests/lib/navVisibility`-adjacent coverage for the slot order.

**Option B**

- `src/types.ts` (`TabId`), `src/lib/nav-icons.ts`, `src/App.tsx`,
  `src/views/ToolsView.tsx`, `src/views/TodayView.tsx`,
  `src/views/SettingsView.tsx` (the reorder rows), `src/lib/i18n.ts` (two
  labels and their drawer names);
- tests: `tests/batch11-tabs.test.ts`, `tests/views/tools-split.test.ts`,
  `tests/views/section-structure.test.ts`,
  `tests/views/section-reorder-integration.test.tsx`,
  `tests/views/section-order.test.ts`, `tests/lib/nav-icons`-adjacent pins;
- and one prose decision with a test behind it: whether a stale stored order is
  dropped (the precedent) or migrated (which needs a mapping that can be wrong).

## 7. What this proposal does not establish

- **No claim that the current bar is broken.** Five tabs, one job each, is a
  defensible shape and the one the app shipped with; P1–P4 are strains, not
  breakages, and a reader who never opens the Egészség drawer is unaffected by
  three of them.
- **No measurement of behaviour.** Nothing here counts taps in a real session:
  the §2 depths are read off the source (tab → drawer → card), not observed.
  The one number that would settle Options A and C is how often each recording
  card is opened per reader per week, and the app keeps no such log by design.
- **No visual design.** Hit targets, label width at the reader's largest type
  setting, and where a sheet would sit relative to the bottom bar are decisions
  with measurements behind them (`docs/ux-audit-phase1.md` already lists the
  44 px floor), and none of them is taken here.
- **No ordering promise beyond §5.** The sequence above is one defensible
  order, argued from cost and from what each option unblocks; a reader who
  wants the name fixed first is not making a mistake.
