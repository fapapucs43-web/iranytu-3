/**
 * The PIN lockout countdown, rendered.
 *
 * Phase 2 audit finding 4.2: the component's own comment promised a "live
 * countdown while throttled", but the line that counts down carried no
 * `aria-live` at all — a screen reader user learned they were locked out only
 * by trying to type.
 *
 * The fix has a trap in it, and most of these tests exist for the trap. The
 * obvious way to make the countdown audible is to put `aria-live="polite"` on
 * the `<p>` that ticks down. That is worse than the original defect: a polite
 * live region re-announces every time its text changes, so a sixty-second
 * lockout would say the same sentence sixty times and bury everything else the
 * app had to say. The countdown is therefore announced once, frozen at the
 * total, and the ticking line is left as ordinary readable text.
 *
 * No jsdom: React renders the component and the assertions read the markup a
 * screen reader would hear.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CooldownNotice,
  formatCooldown,
} from "../../src/components/PinLockGate";
import PinLockGate from "../../src/components/PinLockGate";
import { LOCK_KEY } from "../../src/lib/appLock";

function render(cooldown: number, announcement: string): string {
  return renderToStaticMarkup(
    createElement(CooldownNotice, { cooldown, announcement }),
  );
}

describe("the PIN lockout countdown is announced, once", () => {
  test("the frozen total sits in a polite live region", () => {
    const html = render(150, formatCooldown(150));
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Újra próbálhatod 2 perc 30 másodperc múlva.");
  });

  test("the ticking line is NOT itself a live region", () => {
    // The trap. Asserting the presence of `aria-live` proves nothing unless
    // the second copy is excluded, because one attribute in the markup is
    // enough to re-announce every tick.
    const html = render(150, formatCooldown(150));
    const liveRegions = html.match(/aria-live="polite"/g) ?? [];
    expect(liveRegions.length).toBe(1);
    // And the visible countdown carries no live semantics of its own.
    const visible = html.match(/<p class="pin-error"[^>]*>/)?.[0] ?? "";
    expect(visible).not.toContain("aria-live");
  });

  test("the frozen total is what is spoken, not the current tick", () => {
    // Seven seconds later the sentence in the live region must be unchanged,
    // which is the whole difference between announcing once and announcing
    // sixty times.
    const announced = render(150, formatCooldown(150));
    const later = render(143, formatCooldown(150));
    const spoken = (h: string) =>
      h.replace(/.*aria-live="polite">([^<]*)<.*/s, "$1").trim();
    expect(spoken(later)).toBe(spoken(announced));
    // while the visible line does move, so a reader looking at it sees the truth
    expect(later).toContain("2 perc 23 másodperc");
    expect(announced).toContain("2 perc 30 másodperc");
  });

  test("nothing is rendered while the reader is not locked out", () => {
    expect(render(0, "")).toBe("");
    expect(render(-5, "")).toBe("");
  });

  test("the announcement is empty once the lockout clears", () => {
    // A stale announcement left in the live region would re-read the old
    // sentence on the next lockout.
    expect(render(0, "")).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* The countdown has to survive a reload.                                      */
/* -------------------------------------------------------------------------- */

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

/** A PIN record whose lockout runs out `inSeconds` from now. */
function seedLock(inSeconds: number): void {
  backing[LOCK_KEY] = JSON.stringify({
    salt: "aa",
    hash: "bb",
    iterations: 150_000,
    failedAttempts: 5,
    lockedUntil: Date.now() + inSeconds * 1000,
    updatedAt: 0,
  });
}

function renderGate(): string {
  return renderToStaticMarkup(createElement(PinLockGate));
}

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
});

describe("a lockout already running is still there after a reload", () => {
  test("the gate mounts already counting down, and already announcing", () => {
    seedLock(90);
    const html = renderGate();
    expect(html).toContain("pin-overlay");
    expect(html).toContain("Újra próbálhatod 1 perc 30 másodperc múlva.");
    // Announced, not merely shown: the sentence is in the live region on the
    // very first render, with no effect needed to get it there.
    expect(html).toMatch(/aria-live="polite"[^>]*>Újra próbálhatod/);
    // And the field really is refused, so the countdown is not decorative.
    expect(html).toMatch(/<input[^>]*disabled/);
  });

  test("a lockout that has expired reads as no lockout at all", () => {
    seedLock(-60);
    const html = renderGate();
    expect(html).toContain("pin-overlay");
    expect(html).not.toContain("Újra próbálhatod");
    expect(html).not.toContain("aria-live");
    expect(html).not.toMatch(/<input[^>]*disabled/);
  });

  test("a locked-out reader with no prior lockout sees no countdown", () => {
    // Locked, but never throttled: the deadline is in the past or absent.
    backing[LOCK_KEY] = JSON.stringify({
      salt: "aa",
      hash: "bb",
      iterations: 150_000,
      failedAttempts: 0,
      lockedUntil: 0,
      updatedAt: 0,
    });
    const html = renderGate();
    expect(html).toContain("pin-overlay");
    expect(html).not.toContain("Újra próbálhatod");
  });
});

describe("formatCooldown", () => {
  test("says minutes only when there are any", () => {
    expect(formatCooldown(5)).toBe("Újra próbálhatod 5 másodperc múlva.");
    expect(formatCooldown(65)).toBe("Újra próbálhatod 1 perc 5 másodperc múlva.");
    expect(formatCooldown(1800)).toBe(
      "Újra próbálhatod 30 perc 0 másodperc múlva.",
    );
  });

  test("the sentence the component shows is the one it speaks", () => {
    // One sentence, two surfaces — asserted rather than assumed, because two
    // copies of a sentence a screen reader must agree with is the defect this
    // refactor existed to remove.
    const html = render(65, formatCooldown(65));
    expect(html.split("Újra próbálhatod 1 perc 5 másodperc múlva.").length - 1).toBe(2);
  });
});