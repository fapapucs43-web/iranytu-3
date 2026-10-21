import SectionList, {
  ReorderToggle,
  useSectionOrder,
  type SectionSpec,
} from "../components/SectionList";
import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext";
import { currentStreak } from "../lib/analysis";
import { moodByLevel, moodLabel } from "../lib/mood";
import { formatHuman, monthGrid, monthLabel, todayISO, WEEKDAYS_SHORT } from "../lib/dates";
import { Collapsible, CollapsibleCard, EmptyState, Pill } from "../components/ui/ui";
import EntryDetail from "../components/EntryDetail";
import type { Entry } from "../types";
import { Calendar, Search } from "../lib/icons";
import ContentIcon from "../components/ContentIcon";
import { GlyphIcon } from "../state/IconSetContext";
import { t } from "../lib/i18n";

type Filter = "all" | "good" | "mid" | "rough";

export const JOURNAL_SECTION_IDS = ["calendar", "search", "entries"] as const;

export type JournalSectionId = (typeof JOURNAL_SECTION_IDS)[number];

export default function JournalView({ onGoToday }: { onGoToday?: () => void }) {
  const { data } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Entry | null>(null);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const streak = currentStreak(data.entries);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.entries.filter((e) => {
      if (filter === "good" && e.mood < 4) return false;
      if (filter === "mid" && e.mood !== 3) return false;
      if (filter === "rough" && e.mood > 2) return false;
      if (!q) return true;
      const haystack = [e.note, moodLabel(e.mood), ...e.activities, ...e.emotions, ...e.tags]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data.entries, query, filter]);

  const grid = monthGrid(cursor.year, cursor.month);


  /*
   * The tab's sections, as data (Phase 3b). Written order is still the only
   * order, so the page is byte for byte what it was. `streak` stays above the
   * list: it is a status banner, not something the reader would rearrange.
   * `EntryDetail` travels with the entries it belongs to, so moving that card
   * takes its overlay with it rather than stranding it between two sections.
   */
  const sections: SectionSpec[] = [
    { id: "calendar" as JournalSectionId, label: monthLabel(cursor.year, cursor.month), render: () => (
      <>
          <CollapsibleCard
            id="journal-calendar"
            title={monthLabel(cursor.year, cursor.month)}
            icon={<Calendar />}
            summary={t("journal.calendar.summary")}
          >
            <div className="cal-head">
              <button
                type="button"
                className="icon-btn"
                aria-label={t("journal.prevMonth")}
                onClick={() =>
                  setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }))
                }
              >
                ‹
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const now = new Date();
                  setCursor({ year: now.getFullYear(), month: now.getMonth() });
                }}
              >
                {t("journal.today")}
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("journal.nextMonth")}
                onClick={() =>
                  setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }))
                }
              >
                ›
              </button>
            </div>
            <div className="cal-grid" role="grid" aria-label={t("journal.calendarGroup")}>
              {WEEKDAYS_SHORT.map((d) => (
                <span key={d} className="cal-weekday">{d}</span>
              ))}
              {grid.map((iso) => {
                const entry = data.entries.find((e) => e.date === iso);
                const inMonth = Number(iso.slice(5, 7)) - 1 === cursor.month;
                const isToday = iso === todayISO();
                return (
                  <button
                    key={iso}
                    type="button"
                    className={[
                      "cal-day",
                      !inMonth ? "cal-outside" : "",
                      isToday ? "cal-today" : "",
                      entry ? "cal-has-entry" : "",
                    ].join(" ")}
                    style={entry ? { borderColor: moodByLevel(entry.mood).color } : undefined}
                    onClick={() => entry && setSelected(entry)}
                    disabled={!entry}
                    aria-label={
                      entry
                        ? t("journal.dayWithMood", { date: formatHuman(iso), mood: moodLabel(entry.mood) })
                        : t("journal.dayEmpty", { date: formatHuman(iso) })
                    }
                  >
                    <span className="cal-num">{Number(iso.slice(8, 10))}</span>
                    {entry && <span className="cal-mood" aria-hidden="true"><GlyphIcon glyph={moodByLevel(entry.mood).emoji} /></span>}
                  </button>
                );
              })}
            </div>
          </CollapsibleCard>
      </>
    ) },
    { id: "search" as JournalSectionId, label: t("journal.search.title"), render: () => (
      <>
          <Collapsible title={t("journal.search.title")} icon={<Search />} badge={t("journal.search.badge")}>
            <input
              className="text-input"
              type="search"
              placeholder={t("journal.search.placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t("journal.search.label")}
            />
            <div className="pill-cloud" role="group" aria-label={t("journal.search.filterGroup")}>
              <Pill selected={filter === "all"} onClick={() => setFilter("all")}>{t("journal.filter.all")}</Pill>
              <Pill selected={filter === "good"} onClick={() => setFilter("good")}><GlyphIcon glyph="🙂" /> {t("journal.filter.good")}</Pill>
              <Pill selected={filter === "mid"} onClick={() => setFilter("mid")}><GlyphIcon glyph="😐" /> {t("journal.filter.mid")}</Pill>
              <Pill selected={filter === "rough"} onClick={() => setFilter("rough")}><GlyphIcon glyph="😕" /> {t("journal.filter.rough")}</Pill>
            </div>
            <p className="muted-note">
              {t("journal.results", { found: filtered.length, total: data.entries.length })}
            </p>
          </Collapsible>
      </>
    ) },
    { id: "entries" as JournalSectionId, label: t("journal.entriesTitle"), render: () => (
      <>
          <CollapsibleCard
            id="journal-entries"
            title={t("journal.entriesTitle")}
            icon={<ContentIcon name="NotebookPen" />}
            summary={filtered.length === 0
              ? t("journal.empty.title")
              : t("journal.results", { found: filtered.length, total: data.entries.length })}
          >
            {filtered.length === 0 ? (
              <EmptyState
                icon={<ContentIcon name="Sprout" />}
                title={t("journal.empty.title")}
                hint={t("journal.empty.hint")}
                cta={
                  <button type="button" className="btn btn-primary" onClick={onGoToday}>
                    {t("journal.empty.cta")}
                  </button>
                }
              />
            ) : (
              <ul className="entry-list">
                {filtered.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className="entry-row" onClick={() => setSelected(entry)}>
                      <span className="entry-mood" aria-hidden="true"><GlyphIcon glyph={moodByLevel(entry.mood).emoji} /></span>
                      <span className="entry-meta">
                        <strong>{formatHuman(entry.date)}</strong>
                        <span>
                          {moodByLevel(entry.mood).label}
                          {entry.activities.length > 0 && ` · ${entry.activities.join(", ")}`}
                        </span>
                      </span>
                      <span className="entry-vitals">
                        {entry.vitals.sleepHours != null && <><ContentIcon name="Bed" size="1.1em" /> {entry.vitals.sleepHours}h</>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleCard>
          <EntryDetail
            entry={selected}
            onClose={() => setSelected(null)}
          />
      </>
    ) },
  ];

  const [reordering, setReordering] = useState(false);
  const order = useSectionOrder("journal");

  return (
    <div className="view">
          <section className="streak-banner">
            <span className="streak-flame" aria-hidden="true"><ContentIcon name="Flame" size="1.4em" /></span>
            <div>
              <strong>{t("journal.streak", { streak })}</strong>
              <p>{t("journal.streakNote")}</p>
            </div>
          </section>

      <SectionList
        sections={sections}
        value={order.stored}
        onChange={order.setOrder}
        onReset={order.reset}
        rearranging={reordering}
      />
      <ReorderToggle active={reordering} onToggle={() => setReordering((v) => !v)} />
    </div>
  );
}
