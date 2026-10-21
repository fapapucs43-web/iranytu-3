/**
 * The companion — an optional, forgiving gamification layer.
 *
 * WHY IT IS SEPARATE FROM `AppData`
 * A companion is a mood object, not a record of the reader's life. Keeping it
 * in its own key means (a) a backup/export never carries it, (b) corrupting it
 * cannot take a journal entry down, and (c) "minden adat törlése" can clear it
 * with every other local key through the storage registry.
 *
 * THE ONE RULE THE WHOLE MODULE EXISTS FOR
 * Missing days must never kill the companion. There is no death, no decay and
 * no "lost your streak, start over from zero" dialog. A gap only dims the
 * avatar and resets the streak number; the level, XP, type and colour stay.
 * That is the difference between a companion and another obligation.
 *
 * LEVEL IS DERIVED, NOT REMEMBERED
 * `level` is stored because the state shape is part of the contract, but every
 * read recomputes it from `xp`. A stored level that disagrees with the XP is
 * therefore impossible, and a hand-edited blob cannot claim level 99 with 0 XP.
 */

export type CompanionType = "animal" | "plant" | "light" | "symbol" | "abstract";
export type CompanionColor = "amber" | "sage" | "sky" | "rose" | "violet";

export type CompanionState = {
  type: CompanionType;
  level: number;
  xp: number;
  streak: number;
  /** ISO day `YYYY-MM-DD`; empty means the first activity has not happened. */
  lastActiveDate: string;
  color: CompanionColor;
};

export type CompanionActivity = "journal" | "breathing" | "meditation" | "program";

export type CompanionTypeDef = {
  type: CompanionType;
  icon: string;
  label: string;
  hint: string;
};

/** The five shapes the reader can choose. Icons are content, not chrome. */
export const COMPANION_TYPES: readonly CompanionTypeDef[] = [
  { type: "animal", icon: "🦉", label: "Bagoly", hint: "Csendes megfigyelő" },
  { type: "plant", icon: "🌱", label: "Csírázó növény", hint: "Lassan, de nő" },
  { type: "light", icon: "🏮", label: "Lámpás", hint: "Fény a sötétben" },
  { type: "symbol", icon: "🧭", label: "Iránytű", hint: "Mindig talál irányt" },
  { type: "abstract", icon: "🌊", label: "Hullám", hint: "Jön és megy" },
] as const;

export type CompanionColorDef = {
  color: CompanionColor;
  label: string;
  hex: string;
};

/**
 * Five colours with enough chroma to survive the dark themes as an ACCENT.
 * They are used for the avatar ring, the XP fill and the selection outline —
 * never for body text, which keeps its theme ink and its contrast contract.
 */
export const COMPANION_COLORS: readonly CompanionColorDef[] = [
  { color: "amber", label: "Borostyán", hex: "#d99a2b" },
  { color: "sage", label: "Zsálya", hex: "#5f9e74" },
  { color: "sky", label: "Égkék", hex: "#4c8fc4" },
  { color: "rose", label: "Rózsa", hex: "#c46f8f" },
  { color: "violet", label: "Ibolya", hex: "#8a72c9" },
] as const;

export const COMPANION_STORAGE_KEY = "belso-iranytu-companion";

/** XP needed for one level. Small enough to see progress in a week. */
export const XP_PER_LEVEL = 100;

/** XP each completed action awards. Values are deliberately modest. */
export const COMPANION_XP: Readonly<Record<CompanionActivity, number>> = {
  journal: 20,
  breathing: 10,
  meditation: 25,
  program: 15,
};

export const DEFAULT_COMPANION: CompanionState = {
  type: "animal",
  level: 1,
  xp: 0,
  streak: 0,
  lastActiveDate: "",
  color: "amber",
};

export type CompanionPresence = "new" | "bright" | "dimmed";

const listeners = new Set<(state: CompanionState) => void>();

function isType(value: unknown): value is CompanionType {
  return typeof value === "string" && COMPANION_TYPES.some((t) => t.type === value);
}

function isColor(value: unknown): value is CompanionColor {
  return typeof value === "string" && COMPANION_COLORS.some((c) => c.color === value);
}

function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function levelFor(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
}

function normalise(raw: unknown): CompanionState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_COMPANION };
  const value = raw as Partial<CompanionState>;
  const xp =
    typeof value.xp === "number" && Number.isFinite(value.xp) ? Math.max(0, Math.round(value.xp)) : 0;
  const streak =
    typeof value.streak === "number" && Number.isFinite(value.streak)
      ? Math.max(0, Math.round(value.streak))
      : 0;
  return {
    type: isType(value.type) ? value.type : DEFAULT_COMPANION.type,
    level: levelFor(xp),
    xp,
    streak,
    lastActiveDate: isIsoDay(value.lastActiveDate) ? value.lastActiveDate : "",
    color: isColor(value.color) ? value.color : DEFAULT_COMPANION.color,
  };
}

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const probe = "__belso_companion_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/** The stored companion, repaired into a valid state. Never throws. */
export function loadCompanion(): CompanionState {
  const s = storage();
  if (!s) return { ...DEFAULT_COMPANION };
  try {
    const raw = s.getItem(COMPANION_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COMPANION };
    return normalise(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_COMPANION };
  }
}

function save(state: CompanionState): CompanionState {
  const clean = normalise(state);
  const s = storage();
  if (s) {
    try {
      s.setItem(COMPANION_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Storage full/unavailable: the session still gets the new state.
    }
  }
  for (const fn of listeners) fn(clean);
  return clean;
}

/** Subscribe to companion changes; returns an unsubscribe function. */
export function subscribeCompanion(fn: (state: CompanionState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Whole days between two ISO days; null when either is not a day. */
function daysBetween(from: string, to: string): number | null {
  if (!isIsoDay(from) || !isIsoDay(to) || from === "" || to === "") return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * How the companion should look today.
 *
 * `dimmed` is the forgiving half: a gap of two or more days dims the avatar,
 * while the state itself is untouched. Today or yesterday counts as present.
 */
export function companionPresence(state: CompanionState, today: string): CompanionPresence {
  if (state.lastActiveDate === "") return "new";
  const gap = daysBetween(state.lastActiveDate, today);
  if (gap === null) return "bright";
  return gap <= 1 ? "bright" : "dimmed";
}

/** 0–100 — the fill of the XP bar inside the current level. */
export function levelProgress(xp: number): number {
  const safe = Math.max(0, xp);
  return Math.round(((safe % XP_PER_LEVEL) / XP_PER_LEVEL) * 100);
}

/** XP still needed for the next level. */
export function xpToNextLevel(xp: number): number {
  return XP_PER_LEVEL - (Math.max(0, xp) % XP_PER_LEVEL);
}

/**
 * Record one completed activity.
 *
 * Streak rules, in order:
 *  - same day: no streak change (a second entry is still the same day);
 *  - exactly yesterday: streak + 1;
 *  - any longer gap, or the first activity: streak = 1.
 *
 * The XP is added on EVERY completion, which is the point: the companion
 * rewards the practice, not a perfect calendar.
 */
export function recordCompanionActivity(
  activity: CompanionActivity,
  date: string,
): CompanionState {
  const current = loadCompanion();
  const last = current.lastActiveDate;
  const gap = last === "" ? null : daysBetween(last, date);
  const streak =
    last === date
      ? Math.max(1, current.streak)
      : gap === 1
        ? Math.max(1, current.streak) + 1
        : 1;
  const xp = current.xp + (COMPANION_XP[activity] ?? 0);
  return save({
    ...current,
    xp,
    level: levelFor(xp),
    streak,
    lastActiveDate: date,
  });
}

/** Change the chosen shape or colour without touching XP or the streak. */
export function updateCompanionPreferences(
  patch: Partial<Pick<CompanionState, "type" | "color">>,
): CompanionState {
  const current = loadCompanion();
  return save({ ...current, ...patch });
}

/** Type definition for a state; total, so a render never has to check. */
export function companionTypeDef(type: CompanionType): CompanionTypeDef {
  return COMPANION_TYPES.find((t) => t.type === type) ?? COMPANION_TYPES[0]!;
}

/** Colour definition for a state; total, so a render never has to check. */
export function companionColorDef(color: CompanionColor): CompanionColorDef {
  return COMPANION_COLORS.find((c) => c.color === color) ?? COMPANION_COLORS[0]!;
}

/** Wipe the companion. Used by "Minden adat törlése" and the tests. */
export function resetCompanion(): void {
  try {
    storage()?.removeItem(COMPANION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn({ ...DEFAULT_COMPANION });
}
