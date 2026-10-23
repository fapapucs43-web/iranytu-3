/**
 * Phase 5 — the support wall's rules, without a component and without jsdom.
 *
 * WHY THIS FILE CAN BE PURE
 * `lib/supportWall.ts` is two storage functions and a set of state
 * transitions; the transitions take a state and return the next one. So the
 * three promises a reader would notice if they broke — the 280-character cap,
 * the 200-note cap, and "pinned means it stays" — are asserted as functions of
 * values, and only the storage block needs a double. That double is the same
 * shape `tests/lib/storage-keys.test.ts` uses: an object with getItem /
 * setItem / removeItem over a plain record, installed on `globalThis`, because
 * the suite ships no jsdom and does not want one.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * The card's markup. `tests/lib/collapsible-audit` pins its id and summary,
 * `tests/views/tools-split.test.ts` pins its drawer, and the i18n suite pins
 * its sentences; a third copy of any of those in this file would be the kind
 * of duplicate this repository's guards exist to refuse.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SUPPORT_WALL,
  MAX_ENTRIES,
  MAX_TEXT,
  SUPPORT_WALL_KEY,
  addNote,
  loadSupportWall,
  removeNote,
  saveSupportWall,
  setEnabled,
  togglePin,
  visibleEntries,
  type SupportNote,
  type SupportWallState,
} from "../../src/lib/supportWall";

/* --------------------------- the storage double ------------------------ */

const backing: Record<string, string> = {};
const globals = globalThis as unknown as { localStorage?: unknown };
const saved = globalThis.localStorage;

function makeStore() {
  return {
    getItem: (k: string) => (k in backing ? backing[k]! : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
}

function clearAll(): void {
  for (const k of Object.keys(backing)) delete backing[k];
  globals.localStorage = makeStore();
}

beforeEach(clearAll);
afterAll(() => {
  clearAll();
  if (saved === undefined) delete globals.localStorage;
  else globals.localStorage = saved;
});

/* ------------------------------ helpers -------------------------------- */

function note(over: Partial<SupportNote> = {}): SupportNote {
  return {
    id: over.id ?? "n",
    text: over.text ?? "meg tudod csinálni",
    createdAt: over.createdAt ?? "2026-10-01T08:00:00.000Z",
    ...(over.pinned ? { pinned: true } : {}),
  };
}

function wall(entries: SupportNote[], enabled = true): SupportWallState {
  return { enabled, entries };
}

/** `count` pinned or unpinned notes, oldest first, uniquely dated. */
function fill(count: number, pinned: boolean): SupportWallState {
  return wall(
    Array.from({ length: count }, (_, i) =>
      note({
        id: `n${i}`,
        createdAt: `2026-10-${String((i % 28) + 1).padStart(2, "0")}T08:00:00.000Z`,
        ...(pinned ? { pinned: true } : {}),
      }),
    ),
  );
}

/* ----------------------------- the two caps ---------------------------- */

describe("the 280-character cap, and the empty line", () => {
  test("empty and whitespace-only are refused, not stored as blanks", () => {
    expect(addNote(wall([]), "")).toEqual({ ok: false, reason: "empty" });
    expect(addNote(wall([]), "   \n  ")).toEqual({ ok: false, reason: "empty" });
  });

  test("280 characters is in, 281 is out, and the reader is told which", () => {
    const ok = addNote(wall([]), "a".repeat(MAX_TEXT));
    expect(ok.ok).toBe(true);
    const tooLong = addNote(wall([]), "a".repeat(MAX_TEXT + 1));
    expect(tooLong).toEqual({ ok: false, reason: "too-long" });
  });

  test("the stored text is trimmed, so the cap counts what the reader sees", () => {
    const result = addNote(wall([]), "  köszönöm, hogy itt vagy  ");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.state.entries).toHaveLength(1);
    expect(result.state.entries[0]!.text).toBe("köszönöm, hogy itt vagy");
  });
});

describe("the 200-note cap spends unpinned notes and never a pinned promise", () => {
  test("a full wall of unpinned notes drops the OLDEST, not the new one", () => {
    const full = fill(MAX_ENTRIES, false);
    const result = addNote(full, "az új");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.state.entries).toHaveLength(MAX_ENTRIES);
    expect(result.state.entries.some((e) => e.text === "az új")).toBe(true);
    // The head of the stored list is the oldest note — the one enforceCap
    // spends — so its id is the proof of WHICH note went.
    expect(result.state.entries.some((e) => e.id === "n0")).toBe(false);
  });

  test("every slot pinned: the add is refused rather than evicting one", () => {
    const result = addNote(fill(MAX_ENTRIES, true), "az új");
    expect(result).toEqual({ ok: false, reason: "full" });
  });

  test("mixed wall: the oldest UNPINNED goes, the pinned oldest stay", () => {
    const state = wall([
      ...Array.from({ length: MAX_ENTRIES - 1 }, (_, i) =>
        note({ id: `p${i}`, pinned: true, createdAt: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T08:00:00.000Z` }),
      ),
      note({ id: "loose", createdAt: "2026-10-20T08:00:00.000Z" }),
    ]);
    const result = addNote(state, "az új");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.state.entries).toHaveLength(MAX_ENTRIES);
    expect(result.state.entries.some((e) => e.id === "loose")).toBe(false);
    expect(result.state.entries.some((e) => e.id === "p0")).toBe(true);
  });
});

/* ------------------------------ the ordering --------------------------- */

describe("what the reader sees is pinned first, newest first", () => {
  test("pinned float above unpinned, each group newest first", () => {
    const state = wall([
      note({ id: "old-unpinned", createdAt: "2026-10-01T08:00:00.000Z" }),
      note({ id: "new-unpinned", createdAt: "2026-10-08T08:00:00.000Z" }),
      note({ id: "old-pinned", pinned: true, createdAt: "2026-10-02T08:00:00.000Z" }),
      note({ id: "new-pinned", pinned: true, createdAt: "2026-10-09T08:00:00.000Z" }),
    ]);
    expect(visibleEntries(state).map((e) => e.id)).toEqual([
      "new-pinned",
      "old-pinned",
      "new-unpinned",
      "old-unpinned",
    ]);
  });

  test("pinning does not move the stored row — only the view reorders", () => {
    const state = wall([note({ id: "a" }), note({ id: "b" })]);
    const pinned = togglePin(state, "b");
    expect(pinned.entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(visibleEntries(pinned).map((e) => e.id)).toEqual(["b", "a"]);
  });
});

/* --------------------------- edits, and off ---------------------------- */

describe("removing, unpinning, and the switch itself", () => {
  test("delete takes exactly that note and leaves its neighbours", () => {
    const state = wall([note({ id: "a" }), note({ id: "b" }), note({ id: "c" })]);
    expect(removeNote(state, "b").entries.map((e) => e.id)).toEqual(["a", "c"]);
  });

  test("unpin flips the flag in place, and twice is back to where it was", () => {
    const state = wall([note({ id: "a", pinned: true })]);
    expect(togglePin(state, "a").entries[0]!.pinned).toBe(false);
    expect(togglePin(togglePin(state, "a"), "a").entries[0]!.pinned).toBe(true);
  });

  test("off is the default, and the switch touches only itself", () => {
    expect(DEFAULT_SUPPORT_WALL.enabled).toBe(false);
    expect(loadSupportWall()).toEqual({ enabled: false, entries: [] });
    const on = setEnabled(loadSupportWall(), true);
    expect(on.enabled).toBe(true);
    expect(setEnabled(on, false).enabled).toBe(false);
  });
});

/* ------------------------------- storage ------------------------------- */

describe("the blob, including the ones a reader never wrote", () => {
  test("save → load round-trips the whole state", () => {
    const state = wall([note({ id: "a", pinned: true })], true);
    saveSupportWall(state);
    expect(backing[SUPPORT_WALL_KEY]).toContain("a");
    expect(loadSupportWall()).toEqual(state);
  });

  test("corrupt JSON reads as a fresh wall instead of throwing", () => {
    backing[SUPPORT_WALL_KEY] = "{not json";
    expect(loadSupportWall()).toEqual({ enabled: false, entries: [] });
  });

  test("a blob of wrong-typed rows is repaired, not rejected", () => {
    backing[SUPPORT_WALL_KEY] = JSON.stringify({
      enabled: true,
      entries: [
        { id: "ok", text: " jó sor ", createdAt: "2026-10-01T08:00:00.000Z" },
        { id: 7, text: "rossz id" },
        { id: "x" },
        "nem objektum",
        { id: "hossz", text: "x".repeat(MAX_TEXT + 50), createdAt: "2026-10-01T08:00:00.000Z" },
      ],
    });
    const loaded = loadSupportWall();
    expect(loaded.enabled).toBe(true);
    expect(loaded.entries).toHaveLength(3);
    expect(loaded.entries[0]!.text).toBe("jó sor");
    // An unusable id is regenerated rather than duplicated — two rows sharing
    // one id would be one React key and one pin button for both.
    expect(new Set(loaded.entries.map((e) => e.id)).size).toBe(3);
    // And the cap holds even on a blob nobody wrote through addNote.
    expect(loaded.entries[2]!.text).toHaveLength(MAX_TEXT);
  });

  test("no localStorage at all: the wall still loads, empty and off", () => {
    delete globals.localStorage;
    expect(() => loadSupportWall()).not.toThrow();
    expect(loadSupportWall()).toEqual({ enabled: false, entries: [] });
    expect(() => saveSupportWall(wall([note()]))).not.toThrow();
  });
});

/* ----------------------------- zero network --------------------------- */

describe("nothing leaves the device — the promise, asserted on the source", () => {
  // The wall's one promise to a reader deciding whether to write something
  // honest is that it stays on this device. The engine's rules are pure and
  // this file already proves them; this guard covers the half a pure test
  // cannot see: a future `fetch` added to the ENGINE or the CARD would keep
  // every rule above passing while the promise quietly stopped being true.
  // So both files are scanned for the network primitives a browser offers —
  // a source scan, not a runtime interception, because the suite has no
  // browser and a stubbed global would only prove the stub works.
  const ROOT = fileURLToPath(new URL("../..", import.meta.url));
  const SOURCES = ["src/lib/supportWall.ts", "src/components/SupportWallCard.tsx"];
  const PRIMITIVES = ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource", "navigator."];

  test("neither the engine nor the card names a network primitive", () => {
    for (const path of SOURCES) {
      const source = readFileSync(`${ROOT}/${path}`, "utf8");
      for (const primitive of PRIMITIVES) {
        expect(source.includes(primitive), `${path} mentions ${primitive}`).toBe(false);
      }
    }
  });

  test("the scan covers both files — a third surface would need naming here", () => {
    // Vacuity guard: an empty SOURCES list would make the test above pass on
    // nothing, which is the failure mode this whole block exists to prevent.
    expect(SOURCES).toHaveLength(2);
    for (const path of SOURCES) {
      expect(readFileSync(`${ROOT}/${path}`, "utf8").length).toBeGreaterThan(500);
    }
  });
});
