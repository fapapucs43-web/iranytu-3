/**
 * Mega Batch, commit 2 — the library's reader, rendered.
 *
 * THIS IS THE SUITE'S FIRST `.tsx` TEST, and the split from
 * `tests/lib/education.test.ts` is the reason: the content rules are worth
 * asserting in a `.ts` file that can never accidentally grow JSX, while a
 * component test genuinely reads better as JSX than as nested
 * `createElement` calls.
 *
 * `tsconfig.json` is `include: ["src"]`, so NEITHER this file nor any other
 * test is typechecked by `bun run typecheck`. A JSX typo here surfaces as a
 * `bun test` failure, not as a compiler error. That is a property of the
 * suite, not of this file, and it is recorded so the next person does not
 * read the green typecheck as coverage of the tests.
 *
 * TWO PROVIDERS, NOT ONE: `Card`'s icon is a `ContentIcon`, whose
 * `useIconSet()` THROWS outside `IconSetProvider`, and `IconSetProvider` needs
 * `AppProvider`. `EducationArticleView` draws no icon, so it renders bare —
 * which is the whole reason it is a separate export.
 */
import type { ReactNode } from "react";
import { describe, expect, test, afterEach } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "../../src/state/AppContext";
import { IconSetProvider } from "../../src/state/IconSetContext";
import EducationLibraryCard, {
  EducationArticleView,
} from "../../src/components/EducationLibraryCard";
import { ARTICLES, findArticle } from "../../src/lib/education";

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => {
    backing[k] = v;
  },
  removeItem: (k: string) => {
    delete backing[k];
  },
};

afterEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
});

const withProviders = (node: ReactNode) => (
  <AppProvider>
    <IconSetProvider>{node}</IconSetProvider>
  </AppProvider>
);

const noop = () => {};

describe("EducationLibraryCard — the index", () => {
  test("shows every category and none of the article prose", () => {
    const html = renderToStaticMarkup(withProviders(<EducationLibraryCard />));
    expect(html).toContain("Könyvtár");
    for (const category of new Set(ARTICLES.map((a) => a.category))) {
      expect(html, category).toContain(category);
    }
    expect(html).not.toContain("ed-cbt-alapok");
  });

  test("introduces itself without promising a diagnosis", () => {
    const html = renderToStaticMarkup(withProviders(<EducationLibraryCard />));
    expect(html).toContain("csak magyarázat");
    // Phase 4 replaced "szakrendelt megkérdezni" — a referral that read like a
    // letter to a clinic — with advice to talk to a professional. The claim is
    // unchanged: it points somewhere, and it does not diagnose.
    expect(html).toContain("szakemberrel beszélni");
  });
});

describe("EducationArticleView — the reading state", () => {
  const article = findArticle("ed-cbt-alapok")!;

  test("renders the title, every paragraph, the takeaway and the action", () => {
    const html = renderToStaticMarkup(
      <EducationArticleView
        article={article}
        read={false}
        onBack={noop}
        onToggleRead={noop}
      />,
    );
    expect(html).toContain(article.title);
    for (const paragraph of article.paragraphs) expect(html).toContain(paragraph);
    expect(html).toContain(article.takeaway);
    expect(html).toContain(article.action);
  });

  test("the read marker is a plain action until pressed, then it is announced", () => {
    const unread = renderToStaticMarkup(
      <EducationArticleView
        article={article}
        read={false}
        onBack={noop}
        onToggleRead={noop}
      />,
    );
    const read = renderToStaticMarkup(
      <EducationArticleView
        article={article}
        read
        onBack={noop}
        onToggleRead={noop}
      />,
    );
    expect(unread).toContain('aria-pressed="false"');
    expect(read).toContain('aria-pressed="true"');
    expect(read).toContain("Elolvastam ✓");
    expect(unread).not.toContain("Elolvastam ✓");
  });

  test("every article renders its full prose, not just the first one", () => {
    for (const a of ARTICLES) {
      const html = renderToStaticMarkup(
        <EducationArticleView
          article={a}
          read={false}
          onBack={noop}
          onToggleRead={noop}
        />,
      );
      for (const paragraph of a.paragraphs) {
        expect(html, `${a.id} lost a paragraph`).toContain(paragraph);
      }
      expect(html, a.id).toContain(a.takeaway);
      expect(html, a.id).toContain(a.action);
    }
  });
});