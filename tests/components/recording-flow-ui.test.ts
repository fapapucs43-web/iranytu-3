/**
 * Batch A — the recording flow's rendered contract, static-markup tests in
 * the style of batch11/full-system: React renders the component, hooks run
 * for real, and the assertions read the markup a screen reader would hear.
 */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "../../src/state/AppContext";
import { ThemeProvider } from "../../src/state/ThemeContext";
import { FontProvider } from "../../src/state/FontContext";
import { IconSetProvider } from "../../src/state/IconSetContext";

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

const { default: RecordingFlow, coordsFromPoint } = await import("../../src/components/RecordingFlow");
const { default: TodayView } = await import("../../src/views/TodayView");
const { quadrantFromCoords, QUADRANTS } = await import("../../src/lib/quadrant");

function fullStack(el: React.ReactElement): string {
  return renderToStaticMarkup(
    createElement(
      AppProvider,
      null,
      createElement(ThemeProvider, null, createElement(FontProvider, null, createElement(IconSetProvider, null, el))),
    ),
  );
}

function flow(overrides: Record<string, unknown> = {}): string {
  return fullStack(
    createElement(RecordingFlow, {
      customEmotions: [],
      onAddCustomEmotion: () => {},
      onFinish: () => {},
      onCancel: () => {},
      ...overrides,
    }),
  );
}

describe("RecordingFlow — step 1 markup contract", () => {
  test("the flow is a labelled modal dialog", () => {
    const html = flow();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Hangulat rögzítése"');
  });

  test("the meter is a slider with value semantics and a Hungarian value text", () => {
    const html = flow();
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuemin="1"');
    expect(html).toContain('aria-valuemax="100"');
    // Default position (5,5): stream value (4*10+5)=45, announced as the
    // centre quadrant in Hungarian.
    expect(html).toContain('aria-valuenow="45"');
    expect(html).toContain("Energia 5 / 10, kellemesség 5 / 10");
    expect(html).toContain("Derűs és aktív");
  });

  test("the four quadrant labels are painted from the pinned palette", () => {
    const html = flow();
    for (const hex of ["#ef4444", "#fbbf24", "#3b82f6", "#10b981"]) {
      expect(html).toContain(hex);
    }
  });

  test("the pre-filled position moves the point and the value text", () => {
    const html = flow({ initial: { moodEnergy: 8, pleasantness: 2 } });
    expect(html).toContain("Energia 8 / 10, kellemesség 2 / 10");
    expect(html).toContain("Feszült és aktív");
  });

  test("step 1 offers Back (cancel) and Next only", () => {
    const html = flow();
    expect(html).toContain("Vissza");
    expect(html).toContain("Tovább");
    expect(html).not.toContain("Mentés");
  });

  test("an energy slider stands BESIDE the meter, and the grid is still there", () => {
    const html = flow();
    // A real range input, not a decorated div: keyboard, touch and screen
    // reader support come with the native control rather than being rebuilt.
    const input = /<input[^>]*id="rec-energy-range"[^>]*\/?>/.exec(html);
    expect(input, "step 1 must render the energy slider").not.toBeNull();
    expect(input![0]).toContain('type="range"');
    expect(input![0]).toContain('min="1"');
    expect(input![0]).toContain('max="10"');
    expect(input![0]).toContain('value="5"'); // the meter's own default position
    // Bound to its label, with the live number beside it.
    expect(html).toContain('for="rec-energy-range"');
    expect(html).toContain("rec-energy-value");
    // ADDITIVE, and this is the assertion that says so: the 2 × 2 grid is
    // still rendered in the same step, with all four tiles and its own slider
    // role. The slider was added ALONGSIDE it, not in place of it.
    expect(html).toContain("rec-meter");
    expect(html).toContain('role="slider"');
    expect(html.split("rec-quad ").length - 1).toBe(4);
  });

  test("the slider and the meter read ONE value, so they cannot disagree", () => {
    const html = flow({ initial: { moodEnergy: 8, pleasantness: 2 } });
    const input = /<input[^>]*id="rec-energy-range"[^>]*\/?>/.exec(html)!;
    expect(input[0]).toContain('value="8"');
    // …and the meter agrees with it in the same render, both in its announced
    // value text and in where it puts the point.
    expect(html).toContain("Energia 8 / 10, kellemesség 2 / 10");
    // …and the point stands 8/10 of the way up, which is the same number as a
    // press would have left (a prefix, because the value is a float literal
    // and pinning its last digit would be pinning the printer, not the rule).
    const point = /class="rec-point" style="([^"]*)"/.exec(html);
    expect(point, "the marked point must render").not.toBeNull();
    expect(point![1]).toContain("bottom:77.7");
  });

  test("the slider writes the meter's own energy state, unconditionally", () => {
    const source = readFileSync(new URL("../../src/components/RecordingFlow.tsx", import.meta.url), "utf8");
    // The one line that makes the two controls a single value.
    expect(source).toContain("onChange={(e) => setEnergy(clamp10(Number(e.target.value)))}");
    // And it is NOT behind a condition: the flow takes no settings channel at
    // all (`useApp` appears nowhere in it), so the Ma card's energy-module
    // toggle cannot reach this control. The meter above it is not gated either
    // — they are the recorder's own fields, which is what makes energy always
    // recordable.
    expect(source).not.toContain("useApp");
    expect(source).toContain('className="rec-energy"');
  });

  test("the slider is drawn in the flow's own palette and stays big enough to hit", () => {
    const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
    const rule = (selector: string) => {
      const m = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css);
      expect(m, `${selector} must have a rule`).not.toBeNull();
      return m![1]!;
    };
    // 44px of hit area, the same as every other slider in the app.
    expect(rule(".rec-energy-range")).toContain("height: 44px");
    // The track is the dialog's own light ink rather than a theme token: in a
    // dark theme a token track would vanish into `.rec-flow`'s #0f172a, which
    // is the one theme where an unstyled control disappears.
    expect(rule(".rec-energy-range::-webkit-slider-runnable-track")).toContain("rgba(248, 250, 252");
    // The thumb is the amber energy accent the Ma card's own slider uses.
    expect(rule(".rec-energy-range::-webkit-slider-thumb")).toContain("var(--accent)");
  });
});

/**
 * The meter, answered by a press.
 *
 * The bug this file exists for: the four coloured tiles are `<div>`s, the only
 * pointer-transparent layer sat ON TOP of them, and nothing below it had a
 * handler — so the Mood Meter, the app's default first question, moved only on
 * the arrow keys. A reader pressing a corner got silence.
 *
 * No jsdom here either, so the split is deliberate: the GEOMETRY is tested as
 * the pure function it now is (every quadrant, every axis, the clamps, the
 * degenerate box), and the WIRING is pinned by reading the component and the
 * stylesheet, because a static render cannot show a handler at all — and a
 * geometry test alone would have stayed green through the original bug.
 */
describe("RecordingFlow — the meter answers a press", () => {
  const BOX = { left: 0, top: 0, width: 300, height: 300 };

  test("all four tiles are selectable: a press in each one selects that quadrant", () => {
    // One point per quadrant, 20% inside its edges so no press sits on a
    // boundary: left column = unpleasantness 3, right = 8; top = energy 8,
    // bottom = energy 3.
    const pressIn: Array<[x: number, y: number]> = [
      [60, 60],
      [240, 60],
      [60, 240],
      [240, 240],
    ];
    const got = pressIn.map(([x, y]) => {
      const { energy, pleasantness } = coordsFromPoint(BOX, x, y);
      return quadrantFromCoords(energy, pleasantness);
    });
    expect(got.sort()).toEqual([...QUADRANTS].sort());
    // And each press lands on the tile it was aimed at, by name — the ordering
    // check above could pass with all four reversed.
    expect(quadrantFromCoords(...press(240, 60))).toBe("high-pos");
    expect(quadrantFromCoords(...press(60, 60))).toBe("high-neg");
    expect(quadrantFromCoords(...press(240, 240))).toBe("low-pos");
    expect(quadrantFromCoords(...press(60, 240))).toBe("low-neg");
  });

  function press(x: number, y: number): [number, number] {
    const { energy, pleasantness } = coordsFromPoint(BOX, x, y);
    return [energy, pleasantness];
  }

  test("the two axes run the way the captions say: pleasantness left→right, energy bottom→top", () => {
    expect(coordsFromPoint(BOX, 0, 150)).toMatchObject({ pleasantness: 1 });
    expect(coordsFromPoint(BOX, 300, 150)).toMatchObject({ pleasantness: 10 });
    // Bottom is 1, top is 10 — the inverse of the screen, which is the one
    // thing a meter like this gets backwards.
    expect(coordsFromPoint(BOX, 150, 300)).toMatchObject({ energy: 1 });
    expect(coordsFromPoint(BOX, 150, 0)).toMatchObject({ energy: 10 });
    // The exact middle of both axes is 5.5, and 1..10 has no middle: it rounds
    // to 6. Pinned rather than smoothed over, because the default position (5,5)
    // therefore sits one step below-left of centre — the same place the arrow
    // keys start from, so the two routes cannot disagree.
    expect(coordsFromPoint(BOX, 150, 150)).toEqual({ energy: 6, pleasantness: 6 });
    expect(coordsFromPoint(BOX, 133, 167)).toEqual({ energy: 5, pleasantness: 5 });
  });

  test("every cell of the 10 × 10 grid is reachable, and each axis takes all ten values", () => {
    const energies = new Set<number>();
    const pleasantnesses = new Set<number>();
    for (let i = 0; i <= 9; i++) {
      const offset = (i * 300) / 9;
      for (let j = 0; j <= 9; j++) {
        const other = (j * 300) / 9;
        const p = coordsFromPoint(BOX, offset, other);
        expect(p.energy).toBeGreaterThanOrEqual(1);
        expect(p.energy).toBeLessThanOrEqual(10);
        expect(p.pleasantness).toBeGreaterThanOrEqual(1);
        expect(p.pleasantness).toBeLessThanOrEqual(10);
        expect(Number.isInteger(p.energy)).toBe(true);
        expect(Number.isInteger(p.pleasantness)).toBe(true);
        energies.add(p.energy);
        pleasantnesses.add(p.pleasantness);
      }
    }
    expect(energies.size).toBe(10);
    expect(pleasantnesses.size).toBe(10);
  });

  test("a press past the edge clamps into range instead of storing 0 or 11", () => {
    expect(coordsFromPoint(BOX, -400, -400)).toEqual({ energy: 10, pleasantness: 1 });
    expect(coordsFromPoint(BOX, 9000, 9000)).toEqual({ energy: 1, pleasantness: 10 });
  });

  test("a press on a box that has no size yet yields a real coordinate, never NaN", () => {
    // A hidden meter, or a layout that has not happened: division by zero
    // here would write NaN into the entry as a mood.
    const collapsed = coordsFromPoint({ left: 10, top: 10, width: 0, height: 0 }, 10, 10);
    expect(Number.isInteger(collapsed.energy)).toBe(true);
    expect(Number.isInteger(collapsed.pleasantness)).toBe(true);
    expect(collapsed.energy).toBeGreaterThanOrEqual(1);
    expect(collapsed.pleasantness).toBeGreaterThanOrEqual(1);
  });

  test("a press moves the state: the value text and the point follow it", () => {
    // The state IS the answer: energy/pleasantness are what the flow submits,
    // so a press that moves them is a press that reaches the entry. Rendered
    // from a pre-filled position the way a press would have left it.
    const afterPress = press(240, 60);
    const html = flow({
      initial: { moodEnergy: afterPress[0], pleasantness: afterPress[1] },
    });
    expect(html).toContain("Energia 8 / 10, kellemesség 8 / 10");
    expect(html).toContain("Derűs és aktív");
  });

  test("the chosen tile is marked, not only the point moved", () => {
    for (const [start, want] of [
      [{ moodEnergy: 8, pleasantness: 2 }, "rec-quad-high-neg"],
      [{ moodEnergy: 9, pleasantness: 9 }, "rec-quad-high-pos"],
      [{ moodEnergy: 1, pleasantness: 1 }, "rec-quad-low-neg"],
      [{ moodEnergy: 2, pleasantness: 8 }, "rec-quad-low-pos"],
    ] as const) {
      const html = flow({ initial: start });
      // Exactly ONE tile carries the ring — a second would say "two moods".
      expect(html.split("rec-quad-active").length - 1).toBe(1);
      expect(html).toContain(`rec-quad ${want} rec-quad-active`);
      // And no other quadrant is marked.
      const others = ["high-neg", "high-pos", "low-neg", "low-pos"].filter((q) => q !== want.slice("rec-quad-".length));
      for (const other of others) {
        expect(html).not.toContain(`rec-quad-${other} rec-quad-active`);
      }
    }
  });

  test("Next is enabled and reachable from step 1 whatever the position", () => {
    for (const initial of [
      { moodEnergy: 1, pleasantness: 1 },
      { moodEnergy: 5, pleasantness: 5 },
      { moodEnergy: 10, pleasantness: 10 },
    ]) {
      const html = flow({ initial });
      const next = /<button[^>]*>Tovább<\/button>/.exec(html);
      expect(next, "step 1 must offer the Next button").not.toBeNull();
      expect(next![0]).not.toContain("disabled");
    }
  });

  test("the frame owns the press: pointerdown, capture, and a drag that keeps painting", async () => {
    const source = readFileSync(new URL("../../src/components/RecordingFlow.tsx", import.meta.url), "utf8");
    // The handler is on the frame, not on the decorative grid: this is the
    // exact regression, so it is pinned where the regression was.
    const frame = /<div\s+className="rec-meter-frame"[\s\S]{0,600}?>/.exec(source);
    expect(frame, "the meter frame element must exist").not.toBeNull();
    expect(frame![0]).toContain("onPointerDown={onFramePointerDown}");
    expect(frame![0]).toContain("onPointerMove={onFramePointerMove}");
    expect(frame![0]).toContain("onPointerUp={endPress}");
    expect(frame![0]).toContain("ref={frameRef}");
    // A drag has to keep painting while the finger is down, and stop when it
    // is not — one without the other gives either a dead drag or a hover that
    // writes moods. Both halves are pinned INSIDE the move handler: the same
    // guard line also appears in the release handler, so a file-wide `toContain`
    // would stay green if the move handler lost either one.
    const move = /function onFramePointerMove\([\s\S]*?\n  \}/.exec(source);
    expect(move, "the move handler must exist").not.toBeNull();
    expect(move![0]).toContain("if (!pressedRef.current) return;");
    expect(move![0]).toContain("paintAt(event.clientX, event.clientY)");
    expect(source).toContain("setPointerCapture(event.pointerId)");
    // Both handlers read the SAME geometry, so a press and an arrow key cannot
    // disagree about where value 8 lives.
    const reads = source.match(/coordsFromPoint\(/g) ?? [];
    expect(reads.length).toBe(2); // the definition's own signature is not a call
  });

  test("the stylesheet keeps the keyboard surface transparent and the frame grabbable", () => {
    const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
    const rule = (selector: string) => {
      const m = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css);
      expect(m, `${selector} must have a rule`).not.toBeNull();
      return m![1]!;
    };
    // Still transparent to the pointer: it is the aria surface, not an input.
    expect(rule(".rec-slider")).toContain("pointer-events: none");
    // And now the layer that takes the press says it is a control, and does
    // not let a touch scroll steal the gesture.
    expect(rule(".rec-meter-frame")).toContain("cursor: crosshair");
    expect(rule(".rec-meter-frame")).toContain("touch-action: none");
    // The chosen tile's ring exists, so "selected" is not the dot alone.
    expect(rule(".rec-quad-active")).toContain("box-shadow");
  });
});

describe("RecordingFlow — the three steps are one dialog", () => {
  test("all three steps share the aria-live announcement channel", () => {
    const html = flow();
    expect(html).toContain('aria-live="polite"');
  });

  test("reduced motion skips the enter animation class; motion-safe renders it", () => {
    // The component asks through lib/media's one-owner helper, whose window
    // fallback reads `window`. Stub both answers and assert the conditional:
    // the animation exists only for users who have not asked for stillness.
    const g = globalThis as unknown as { window?: unknown };
    const originalWindow = g.window;
    try {
      g.window = { matchMedia: (q: string) => ({ matches: q.includes("prefers-reduced-motion") }) };
      expect(flow()).not.toContain("rec-enter");
      g.window = { matchMedia: () => ({ matches: false }) };
      expect(flow()).toContain("rec-enter");
      // And a browser with no matchMedia at all defaults to motion-safe.
      g.window = {};
      expect(flow()).toContain("rec-enter");
    } finally {
      g.window = originalWindow;
    }
  });
});

describe("TodayView — the recorder switch", () => {
  test("the default (absent moodFlow) shows the new-flow call to action", async () => {
    for (const k of Object.keys(backing)) delete backing[k];
    backing["belso-iranytu-data-v2"] = JSON.stringify({
      version: 2,
      entries: [],
      goals: [],
      dailyQuestion: null,
      medications: [],
      medicationChecks: {},
      profile: { name: "", goal: "" },
      settings: { textSize: "normal", theme: "light" },
    });
    const { default: FreshTodayView } = await import(`../../src/views/TodayView?fresh=${Math.random()}`);
    const html = fullStack(createElement(FreshTodayView));
    expect(html).toContain("Hangulat rögzítése");
    // The old buttons are NOT on the default path.
    expect(html).not.toContain('role="radiogroup" aria-label="Hangulat kiválasztása"');
  });
});
