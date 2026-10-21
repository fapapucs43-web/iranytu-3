# Improvement proposals — Belső Iránytű

Five lenses, concrete proposals, each with a priority. The app's own rules
bound all of them: offline-first, no account, no tracking, Hungarian first,
every generation. Nothing here turns the app into a diagnosis or a clinical
device — the assessment module's own disclaimer is the line, and every
professional proposal below stays this side of it.

## 1. Functional

| Proposal | What & why | Priority |
| --- | --- | --- |
| **Gyakorlat-keresés a Naplóban** | Free-text search exists; add emotion + activity + tracker-value filters to one bar, so "mikor voltam szorongós munka után?" is one query. | magas |
| **Év-összevetés az Elemzésben** | Year-over-year mood curve overlay ("same weeks last year"). The data is already there; only the view is missing. | magas |
| **Emlékeztető → napló hurok** | A fired medication dose offers "bejegyzés most" with the dose prefilled — closes the loop between reminder and record. | közepes |
| **CSV-mező dokumentáció** | A small in-app page documenting every CSV column for spreadsheet round-trips — the export is the escape hatch, document it. | közepes |
| **Apple Health / Google Fit auto-refresh** | A "re-import last 30 days" one-tap on the existing import card; the parsers and merge are already additive. | közepes |
| **Widget / quick tile** | Android quick-tile or home-screen widget deep-linking to the mood picker — the fastest possible recording path. | alacsony |
| **Több napló-profil** | Profiles for a child/dependent one device shares — big privacy design question, keep off the roadmap until asked. | alacsony |

Integrations worth having: none new on the network side by principle. The
valuable "integration" is the file boundary — import/export robustness —
which the proposals above serve.

## 2. Aesthetic

| Proposal | What & why | Priority |
| --- | --- | --- |
| **Méret-skála audit nagy betűn** | At x-large, several cards (tracker inputs, assessment items) cramp. Audit every density token at 120%+ — the generation promise is large-type first. | magas |
| **Érintési cél-felülvizsgálat** | Some icon buttons land under 44 px at normal size (nav overflow, entry-detail actions). One spacing token pass fixes a whole class. | magas |
| **Fókuszsáring modernizálás** | The outline is functional but dated; a 2 px offset ring in the accent, consistent across inputs, reads modern without moving anything. | közepes |
| **Kártya-árnyék/lekerekítés harmonizálás** | Three different radii coexist; two tokens (small/large) would make the app feel designed rather than accumulated. | közepes |
| **Sötét téma fotó-etalon** | The dark theme with a bright photo needs one more scrim step; a themed default veil per polarity would remove a manual tweak. | alacsony |
| **Mikro-animációk mértékkel** | Reduced-motion is respected; add gentle number transitions on streak/balance so progress "counts up" — engaging without gamified noise. | alacsony |

What reads dated: the flat grey disabled states and the default system
dialogs. What disturbs older readers: small hit targets, low-contrast muted
ink (already measured, already documented). What attracts younger readers:
the emoji-first registries, the year-in-pixels heatmap, handwriting for
their own notes.

## 3. Professional (mental health)

| Proposal | What & why | Priority |
| --- | --- | --- |
| **Krízis-kártya bővítés** | Keep the always-available card; add the 116-123 youth line and the Crisis Line 116-123 beside the existing resources, with "most hívom" affordances. | magas |
| **Validált kérdőív: GAD-7** | Same scaffold as PHQ-8 (consent → items → band → log → disclaimer): anxiety screening completes the pair. Band labels stay descriptive, never diagnostic. | magas |
| **Psychoeducation bővítés** | 3–4 micro-lessons: alvási higiénia, pánik testi folyamatai, kognitív torzítások mini-glosszárium, segítő-kapcsolat első lépései. | közepes |
| **Légzésgyakorlat → szokás hurok** | Option to log a finished breathing exercise as a habit day — evidence-based tool meets the streak the app already keeps. | közepes |
| **Gratitude prompt-variációk** | Rotate three evidence-informed prompt families (novelty, people, savoring) instead of one fixed prompt. | alacsony |
| **Öngyilkossági gondolatok biztonsági terv** | A guided safety-plan form (own warning signs, own coping steps, own contacts) — the strongest evidence-based low-threshold tool; keep editable, printable, never scored. | közepes |

The line stays where the disclaimer draws it: the app measures what the
reader reports about themselves, never concludes what they have. Every band
is a description of what was reported, not a name for a condition.

## 4. Generational

| Proposal | What & why | Priority |
| --- | --- | --- |
| **Első-segély mód (60+)** | A Settings toggle that hides every non-essential card and keeps: Ma, Napló, gyógyszer-emlékeztető, krízis-kártya — larger targets by subtraction, not by zoom. | magas |
| **Szóhasználat-felülvizsgálat** | Replace anglicisms in copy ("tracking", "streak") with settled Hungarian words; keep the English term in parentheses on first use for the 18–30 half. | közepes |
| **Onboarding: "csak nézegetek" út** | A skip-everything path that still lands on an empty Today card with one big "+" — the impatient 20-something route that does not trap anyone in a wizard. | közepes |
| **Nagy kontraszt + x-large együtt** | Test and fix the two accessibility modes combined (today they are tuned separately); the 60+ reader often needs both. | közepes |
| **Megosztás a kezelővel (PDF)** | The report already prints; add an explicit "orvosnak" preset (assessments + medication list, no notes) — privacy-preserving sharing for the chronic-illness middle. | alacsony |
| **Hangból bejegyzés népszerűsítése** | The offline voice path is a superpower for tremor or dyslexia; surface it in onboarding as one card, not buried in settings. | alacsony |

What is good for 60+: bigger text by default options, explicit labels beside
every icon, one idea per screen, no nested menus. For 18–30: emoji
registries, year-in-pixels, streaks, handwriting, everything tappable in
two taps. For 30–60: the medication tracker, weekly reflection, CSV/JSON
ownership, the doctor preset above.

## 5. Trends (Hungarian + global)

| Proposal | What & why | Priority |
| --- | --- | --- |
| **Streak → rugalmas sorozat** | Global mood apps moved from punishing streak breaks to "healing" streaks (Daylio's flexible history, Duolingo's repair). A once-a-month grace day keeps motivation without shame — shame is the enemy in this domain. | magas |
| **Heti összefoglaló értesítés** | One Friday/Sunday summary push ("jó heted volt: 4 nap naplózva") — the single strongest retention lever across Daylio/Finch/Reflectly, and it reuses the existing weekly analysis. | magas |
| **Finch-modell: gondoskodás mozdulat** | Finch pairs self-care with a virtual pet; the kid-friendly equivalent here is a plant that grows with journaling days — optional, dismissible, never a condition of use. | közepes |
| **"Most 5 perc" gyors kártya** | Global trend: micro-interventions surfaced contextually. When a stress ≥ 8 is recorded, offer the breathing exercise inline, once, dismissibly. | közepes |
| **Magyar PIAC valóság** | Hungarian mental-health app space is thin: mostly meditation translations (Calmetry's local content is the exception worth learning from). The differentiator to lean into: offline + Hungarian-language self-help scaffold + no account. Say it on the landing page. | közepes |
| **Adattulajdon-mesélés** | Global privacy mood favors "your data, your file": show one card in Settings — "a naplód X bejegyzés, Y kB, egy fájlban, a te gépeden" — turning the app's oldest promise into a visible feature. | alacsony |
| **Hosszú távú vonzóerő** | What keeps people for years (the apps that survive): a fast daily loop (< 20 s), an evolving analysis that answers new questions, and export that means the data outlives the app. All three foundations exist; the year-over-year view (§1) and the summary push above complete them. | magas |

### What the trend claims are (and are not) based on

Read on 2026-10-05, for market context only — none of it is a clinical claim,
and none of it is a substitute for the app's own "not medical advice" line:

- Nemzeti Egészségportál (the official Hungarian health portal) published its
  own page on mental-health mobile apps in November 2025, which is the clearest
  signal that "track your mood, manage stress, stay offline-capable" is now
  what a Hungarian state health portal expects an app to be:
  `https://egeszsegvonal.gov.hu/maradj-egeszseges/digitalis-egeszseg/mobilalkalmazasok-a-mentalis-egeszseg-szolgalataban.html`
- INVERSUM (Medical Online, 2022) is the Hungarian app worth naming as the
  local precedent — and the reason the "no account, own device" line is a
  differentiator rather than a quirk:
  `https://medicalonline.hu/informatika/cikk/magyar_applikacio_a_mentalis_egeszseg_tamogatasara`
- The store-side picture (what ships, and how many of those apps are aimed at
  mood disorders specifically) is surveyed in Eis et al., *Mobile Applications
  in Mood Disorders and Mental Health*, IJERPH 2022:
  `https://www.mdpi.com/1660-4601/19/4/2186`
- Feature-and-experience analysis of mood trackers as a category:
  Caldeira et al., *Mobile apps for mood tracking*, JMIR mHealth 2018:
  `https://pmc.ncbi.nlm.nih.gov/articles/PMC5977660/`

Everything specific to THIS app — the healing streak, the weekly summary, the
GAD-7, the first-aid mode — is a proposal about the app's own data and its own
rules. If a reader wants to ship one of them, the literature above is where to
start; if they want to know whether it fits the product, the code is the answer.

## Priority summary

- **Magas:** search filters, year-over-year, large-type density audit, touch
  targets, GAD-7, crisis-card expansion, healing streak, weekly summary
  notification, first-aid mode, retention trio.
- **Közepes:** reminder→entry loop, CSV docs, re-import button, focus ring,
  radii tokens, micro-lessons, breathing→habit loop, safety plan, wording
  pass, onboarding skip path, combined a11y modes, Finch-style companion,
  inline breathing offer, local-market messaging.
- **Alacsony:** widget, multi-profile, dark-theme photo veil, micro-anim
  -ations, gratitude rotation, doctor preset, voice onboarding card,
  data-ownership card.
