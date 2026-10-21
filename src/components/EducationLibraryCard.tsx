/**
 * Mega Batch, commit 2 — the library's reader, mounted in the Eszköztár.
 *
 * THREE STATES IN ONE CARD, because a reader that opens windows is a reader
 * nobody finishes: the category index, the articles of one category, and the
 * article itself. State is which id is open — nothing else — so a reload
 * lands on the index and the only thing that survives is the read marker.
 *
 * WHY NOT ITS OWN COLLAPSIBLE: the Eszköztár is already one. A nested header
 * would add a row per batch for a card nobody scrolled to, and it would move
 * the pinned collapsible counts Batch 11 asserts.
 *
 * WHY THE VIEW IS A SEPARATE EXPORT: so a render test can reach the reading
 * state without the providers `ContentIcon` needs — `useIconSet()` throws
 * outside `IconSetProvider` (src/state/IconSetContext.tsx), and
 * `IconSetProvider` itself needs `AppProvider`. Splitting it means the part
 * users actually read is testable without dragging the whole app tree in.
 * It is consumed below, so the dead-export guard sees a real caller.
 */
import { useState } from "react";
import { t } from "../lib/i18n";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import {
  articlesByCategory,
  findArticle,
  getReadArticleIds,
  markArticleRead,
  type EducationArticle,
} from "../lib/education";

/** The reading state of one article: back, prose, takeaway, action, marker. */
export function EducationArticleView({
  article,
  read,
  onBack,
  onToggleRead,
}: {
  article: EducationArticle;
  read: boolean;
  onBack: () => void;
  onToggleRead: () => void;
}) {
  return (
    <div className="edu-article">
      {/* Back to the list — never a browser back, which would lose the index. */}
      <button type="button" className="btn-soft" onClick={onBack}>
        {t("tools.library.backToArticle")}
      </button>

      {/* The title lives HERE, not in the parent Card's header, and that is a
          correction rather than a preference: a reading state that only makes
          sense when something above it supplies the title cannot be rendered
          or asserted on its own, so "which article am I in" shipped untested.
          The card header now stays constant instead, which also stops it
          changing under the reader as they move between articles. */}
      <h3 className="edu-title">{article.title}</h3>

      {article.paragraphs.map((paragraph, i) => (
        <p key={i} className="edu-para">
          {paragraph}
        </p>
      ))}

      {/* The two lines a reader can act on without rereading the prose. */}
      <p className="edu-takeaway">
        <strong>{t("tools.library.takeawayLabel")}</strong> {article.takeaway}
      </p>
      <p className="edu-action">
        <strong>{t("tools.library.actionLabel")}</strong> {article.action}
      </p>

      <button
        type="button"
        className="btn-primary"
        onClick={onToggleRead}
        aria-pressed={read}
      >
        {read ? t("tools.library.readDone") : t("tools.library.readMark")}
      </button>
    </div>
  );
}

export default function EducationLibraryCard() {
  // null = the index; a category name = that category's list; an id = the article.
  const [category, setCategory] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<string[]>(() => getReadArticleIds());

  const groups = articlesByCategory();
  const open = openId ? findArticle(openId) : undefined;

  // The store is the source of truth: re-read it rather than mirroring it into
  // state, so the marker and the list can never disagree.
  function toggleRead(id: string) {
    markArticleRead(id);
    setReadIds(getReadArticleIds());
  }

  // One mount, not two: the open article and the index are branches of the
  // SAME card (they share a title and an icon), so they share one id in the
  // collapse map — a reader who opened an article finds the card still open
  // when they step back to the index.
  return (
    <CollapsibleCard
      id="tools-library"
      title={t("tools.library.title")}
      icon={<ContentIcon name="NotebookPen" />}
      summary={open ? open.title : t("tools.library.intro")}
    >
      {open ? (
        <EducationArticleView
          article={open}
          read={readIds.includes(open.id)}
          onBack={() => setOpenId(null)}
          onToggleRead={() => toggleRead(open.id)}
        />
      ) : (
        <>
      <p className="muted-note">{t("tools.library.intro")}</p>

      {/* The index: one pill per category. */}
      {!category ? (
        <div className="edu-nav">
          {groups.map((group) => (
            <button
              key={group.category}
              type="button"
              className="btn-soft"
              onClick={() => setCategory(group.category)}
            >
              {group.category}
            </button>
          ))}
        </div>
      ) : (
        <>
          <button
            type="button"
            className="btn-soft"
            onClick={() => setCategory(null)}
          >
            {t("tools.library.backToTopics")}
          </button>
          {groups
            .filter((g) => g.category === category)
            .flatMap((g) =>
              g.articles.map((article) => (
                <div key={article.id} className="edu-item">
                  <button
                    type="button"
                    className="btn-soft"
                    onClick={() => setOpenId(article.id)}
                  >
                    {article.title}
                  </button>
                  {/* A read marker is a word, not a tick: it must not read as a rating. */}
                  {readIds.includes(article.id) && (
                    <span className="edu-read">{t("tools.library.readMark")}</span>
                  )}
                </div>
              )),
            )}
        </>
      )}
        </>
      )}
    </CollapsibleCard>
  );
}