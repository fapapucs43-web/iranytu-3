/**
 * The section list, rendered.
 *
 * No jsdom: React renders the component and the assertions read the markup a
 * screen reader would hear. What is worth pinning is the WIRING and the
 * ACCESSIBILITY, not the styling — the classes are the bottom bar's own,
 * reused so the app has one way to reorder something rather than two.
 *
 * The two things that would be silently wrong:
 *
 *  - ORDERED MODE MUST BE A FRAGMENT. A wrapper element would put the reorder
 *    affordance around (or inside) the `CollapsibleCard`s, and Settings has
 *    thirteen of them; two affordances on one card is exactly the
 *    "double collapse" the design has to avoid. There is a test below that
 *    fails the moment a wrapper appears.
 *  - EACH ARROW'S LABEL MUST NAME ITS ROW AND ITS POSITION. That is what the
 *    existing tab-order arrows already do, and it is why an arrow disabled at
 *    the end of the list explains itself instead of being mute.
 */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SectionList from "../../src/components/SectionList";

const SECTIONS = [
  { id: "mood", label: "Hangulat", render: () => createElement("p", null, "MOOD") },
  { id: "balance", label: "Mérleg", render: () => createElement("p", null, "BALANCE") },
  { id: "lessons", label: "Mikrólecke", render: () => createElement("p", null, "LESSONS") },
];

function panel(value: unknown): string {
  return renderToStaticMarkup(
    createElement(SectionList, {
      sections: SECTIONS,
      value,
      rearranging: true,
      onChange: () => {},
      onReset: () => {},
    }),
  );
}

function ordered(value: unknown): string {
  return renderToStaticMarkup(
    createElement(SectionList, {
      sections: SECTIONS,
      value,
      onChange: () => {},
      onReset: () => {},
    }),
  );
}

describe("ordered mode adds nothing to the page", () => {
  test("the sections render, and the stored order is honoured", () => {
    expect(ordered(undefined)).toContain("MOOD");
    const html = ordered(["lessons", "mood", "balance"]);
    expect(html.indexOf("LESSONS")).toBeLessThan(html.indexOf("MOOD"));
    expect(html.indexOf("MOOD")).toBeLessThan(html.indexOf("BALANCE"));
  });

  test("there is NO wrapper element around them", () => {
    // The regression this guards: a wrapper would be the only thing standing
    // between the reorder control and the cards it reorders, and would make
    // the Settings tab's collapsible cards reachable two ways at once.
    const html = ordered(undefined);
    expect(html.startsWith("<p>MOOD</p>")).toBe(true);
    expect(html.endsWith("</p>")).toBe(true);
    expect(html).not.toContain("tab-order");
    expect(html).not.toContain("section-order");
    // No element at all in ordered mode.
    expect(html).not.toContain("<div");
    expect(html).not.toContain("<ul");
    expect(html).not.toContain("<ol");
  });

  test("an untrusted stored value cannot make a section disappear or repeat", () => {
    for (const junk of [["ghost"], ["mood", "mood"], "nope", 42, null]) {
      const html = ordered(junk);
      expect(html.match(/<p>/g)?.length ?? 0).toBe(3);
    }
  });
});

describe("rearrange mode", () => {
  test("every arrow names its row AND its position", () => {
    const html = panel(undefined);
    expect(html).toContain('aria-label="1. Hangulat előre"');
    expect(html).toContain('aria-label="1. Hangulat hátra"');
    expect(html).toContain('aria-label="3. Mikrólecke előre"');
    expect(html).toContain('aria-label="3. Mikrólecke hátra"');
  });

  test("the first row cannot go up and the last cannot go down", () => {
    const html = panel(undefined);
    // Each of those four labels appears on exactly one button, and that button
    // is the disabled one.
    expect(html).toMatch(/aria-label="1\. Hangulat előre"[^>]*disabled|disabled[^>]*aria-label="1\. Hangulat előre"/);
    expect(html).toMatch(/aria-label="3\. Mikrólecke hátra"[^>]*disabled|disabled[^>]*aria-label="3\. Mikrólecke hátra"/);
    // And the middle of the list keeps both of its arrows.
    expect(html).not.toMatch(/aria-label="2\. Mérleg előre"[^>]*disabled|disabled[^>]*aria-label="2\. Mérleg előre"/);
    expect(html).not.toMatch(/aria-label="2\. Mérleg hátra"[^>]*disabled|disabled[^>]*aria-label="2\. Mérleg hátra"/);
  });

  test("it reuses the bottom bar's own markup, not a second set of rules", () => {
    const html = panel(undefined);
    expect(html).toContain('class="tab-order"');
    expect(html).toContain('class="tab-order-row"');
    expect(html).toContain('class="tab-order-label"');
    expect(html).toContain('class="tab-order-controls"');
    // A numbered panel built on <ol> would print its numbers twice: once by
    // the browser, once in the row label.
    expect(html).not.toContain("<ol");
    expect(html).not.toContain("<li");
  });

  test("the stored order is what the panel shows", () => {
    // Read the row labels out IN ORDER rather than searching for a string: an
    // `indexOf` on a position that has moved to another row silently returns
    // -1, and -1 compares less than everything.
    const rows = (html: string) =>
      [...html.matchAll(/class="tab-order-label">([^<]*)</g)].map((m) => m[1]);
    expect(rows(panel(undefined))).toEqual(["1. Hangulat", "2. Mérleg", "3. Mikrólecke"]);
    expect(rows(panel(["lessons", "mood", "balance"]))).toEqual([
      "1. Mikrólecke",
      "2. Hangulat",
      "3. Mérleg",
    ]);
  });

  test("reset is disabled until there is something to undo", () => {
    // The default arrangement: nothing has been moved, so there is no action to
    // offer. Offering it would be the second button in this app that does
    // nothing when pressed.
    expect(panel(undefined)).toMatch(/<button[^>]*disabled[^>]*>\s*Alapértelmezett sorrend visszaállítása/);
    expect(panel(["ghost"])).toMatch(/<button[^>]*disabled/);
  });

  test("reset is offered once the arrangement differs", () => {
    const html = panel(["lessons", "mood", "balance"]);
    expect(html).toContain("Alapértelmezett sorrend visszaállítása");
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>\s*Alapértelmezett sorrend/);
  });

  test("it does not render the cards themselves", () => {
    // While rearranging, the panel replaces the content: no card is drawn, so
    // there is nothing to expand underneath and nothing to lose scrollback to.
    expect(panel(undefined)).not.toContain("MOOD");
    expect(panel(undefined)).not.toContain("BALANCE");
  });

  test("an untrusted value yields exactly one row per section", () => {
    for (const junk of [["ghost"], ["mood", "mood", "mood"], "nope", 42]) {
      const html = panel(junk);
      expect(html.match(/class="tab-order-row"/g)?.length ?? 0).toBe(3);
    }
  });

  test("the view can override the heading, and the catalogue is the default", () => {
    expect(panel(undefined)).toContain("Sorrend");
    expect(panel(undefined)).toContain("A kártyák sorrendje.");
    const custom = renderToStaticMarkup(
      createElement(SectionList, {
        sections: SECTIONS,
        value: undefined,
        rearranging: true,
        title: "Kártyák sorrendje",
        note: "Ez a te füled.",
        onChange: () => {},
        onReset: () => {},
      }),
    );
    expect(custom).toContain("Kártyák sorrendje");
    expect(custom).toContain("Ez a te füled.");
  });
});