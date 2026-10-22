/**
 * Phase 5 — the support wall: short, positive notes a reader writes to
 * THEMSELVES, kept on this device and nowhere else.
 *
 * ZERO NETWORK, AND THAT IS A DESIGN CONSTRAINT RATHER THAN A FEATURE TICKET
 * Nothing here imports a client, calls fetch, or hands the text to a
 * moderator — there is no server to hand it to. The whole feature is
 * `localStorage` plus pure functions, which is also why the rules below can be
 * tested without jsdom: the state is a value, the operations return the next
 * value, and only `load`/`save` ever touch storage. The card
 * (`components/SupportWallCard.tsx`) is the only reader.
 *
 * OFF IS THE DEFAULT AND IT MEANS WHAT IT SAYS
 * `enabled: false` comes back for a first-time reader, for a corrupt blob and
 * for an absent one alike. Nothing is written until the reader turns the card
 * on, so a feature they never asked for leaves no residue at all.
 *
 * THE TWO LIMITS, AND WHY PINNED NOTES ARE PROTECTED
 * 280 characters, because the thing being written is a sentence to yourself,
 * not a document — and a counter the reader can see before pressing add beats
 * an error after. 200 notes, because the storage is unbounded and nobody will
 * ever scroll two hundred of them. When a new note would cross the cap the
 * OLDEST UNPINNED one goes: pinning is the reader saying "this one stays", so
 * the cap may spend their unpinned notes but never that promise. If every
 * slot is pinned the add is REFUSED rather than silently evicting a pinned
 * note — both rules keep their word, and the card shows why.
 *
 * WHAT IS NOT HERE
 * No moderation (nothing leaves the device to be moderated), no sharing (no
 * id is ever sent anywhere, so ids are local row keys and nothing else), no
 * account. The key is in `WIPE_KEYS`, so "Minden adat törlése" takes it, and
 * in `BACKUP_INCLUDED_KEYS`, because it is the reader's own writing and the
 * project's rule is that a reader's data travels in a backup by name.
 */

export const SUPPORT_WALL_KEY = "belso-iranytu-support-wall";

/** Characters per note, and notes per wall. */
export const MAX_TEXT = 280;
export const MAX_ENTRIES = 200;

export type SupportNote = {
  id: string;
  text: string;
  /** ISO 8601 — a string, so the stored shape is what a backup carries. */
  createdAt: string;
  pinned?: boolean;
};

export type SupportWallState = {
  enabled: boolean;
  /** Oldest first. Display order is `visibleEntries`, not this order. */
  entries: SupportNote[];
};

export const DEFAULT_SUPPORT_WALL: SupportWallState = { enabled: false, entries: [] };

export type AddFailure = "empty" | "too-long" | "full";
export type AddResult = { ok: true; state: SupportWallState } | { ok: false; reason: AddFailure };

/* ------------------------------- storage -------------------------------- */

/**
 * Read the wall, repairing whatever comes back.
 *
 * Every malformation the blob can carry resolves to a well-typed state rather
 * than an exception: this module has no other reader, and a card that throws
 * on mount over a note somebody edited in devtools is a card nobody can open.
 */
export function loadSupportWall(): SupportWallState {
  let raw: string | null = null;
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_SUPPORT_WALL, entries: [] };
    raw = localStorage.getItem(SUPPORT_WALL_KEY);
  } catch {
    return { ...DEFAULT_SUPPORT_WALL, entries: [] };
  }
  if (raw === null) return { ...DEFAULT_SUPPORT_WALL, entries: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<SupportWallState>;
    return {
      enabled: parsed.enabled === true,
      entries: repairEntries(parsed.entries),
    };
  } catch {
    return { ...DEFAULT_SUPPORT_WALL, entries: [] };
  }
}

/** Write the wall. A blocked storage means the card lives for this session. */
export function saveSupportWall(state: SupportWallState): void {
  try {
    localStorage?.setItem(SUPPORT_WALL_KEY, JSON.stringify(state));
  } catch {
    /* storage blocked or full: the state still holds in memory */
  }
}

/**
 * Malformed entries out, invariants back: only strings, text within the cap,
 * a unique id per row, newest within the count cap (oldest unpinned first).
 */
function repairEntries(entries: unknown): SupportNote[] {
  if (!Array.isArray(entries)) return [];
  const seen = new Set<string>();
  const clean: SupportNote[] = [];
  for (const e of entries) {
    if (typeof e !== "object" || e === null) continue;
    const note = e as Partial<SupportNote>;
    if (typeof note.text !== "string") continue;
    const text = note.text.trim().slice(0, MAX_TEXT);
    if (text === "") continue;
    const id = typeof note.id === "string" && note.id !== "" && !seen.has(note.id)
      ? note.id
      : newId();
    seen.add(id);
    clean.push({
      id,
      text,
      createdAt: typeof note.createdAt === "string" ? note.createdAt : new Date(0).toISOString(),
      ...(note.pinned === true ? { pinned: true } : {}),
    });
  }
  return enforceCap(clean);
}

/* -------------------------------- the rules ------------------------------ */

/**
 * Enforce the 200-note cap: drop the oldest UNPINNED notes until it fits,
 * and if pinning alone overfills it, drop the oldest pinned one as well —
 * a wall of 201 is not worth breaking the cap's promise in either direction.
 * Callers that would rather refuse use `addNote`, which asks first.
 */
function enforceCap(entries: SupportNote[]): SupportNote[] {
  if (entries.length <= MAX_ENTRIES) return entries;
  const overflow = entries.length - MAX_ENTRIES;
  const unpinnedOldestFirst = entries.filter((e) => !e.pinned);
  const dropUnpinned = Math.min(overflow, unpinnedOldestFirst.length);
  const doomed = new Set(unpinnedOldestFirst.slice(0, dropUnpinned).map((e) => e.id));
  let next = entries.filter((e) => !doomed.has(e.id));
  if (next.length > MAX_ENTRIES) next = next.slice(next.length - MAX_ENTRIES);
  return next;
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `sw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function setEnabled(state: SupportWallState, enabled: boolean): SupportWallState {
  return { ...state, enabled };
}

/**
 * Append one note, or say why not.
 *
 * The refusal order is the reader's experience, not the code's: empty first
 * (the button is disabled, so this is belt-and-braces), then the cap they
 * can see in the counter, then the full wall — the one case where the
 * protection rule above turns into a sentence they can act on.
 */
export function addNote(state: SupportWallState, rawText: string): AddResult {
  const text = rawText.trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (text.length > MAX_TEXT) return { ok: false, reason: "too-long" };
  if (state.entries.length >= MAX_ENTRIES && !state.entries.some((e) => !e.pinned)) {
    // Every slot is pinned: the cap may spend unpinned notes but never a
    // pinned promise, so the add itself is what gives up.
    return { ok: false, reason: "full" };
  }
  const note: SupportNote = { id: newId(), text, createdAt: new Date().toISOString() };
  // `enforceCap` is a no-op below the cap, and at the cap it drops the OLDEST
  // unpinned note — never this one, which is the newest thing in the list.
  return { ok: true, state: { ...state, entries: enforceCap([...state.entries, note]) } };
}

export function removeNote(state: SupportWallState, id: string): SupportWallState {
  return { ...state, entries: state.entries.filter((e) => e.id !== id) };
}

export function togglePin(state: SupportWallState, id: string): SupportWallState {
  return {
    ...state,
    entries: state.entries.map((e) =>
      e.id === id ? (e.pinned ? { ...e, pinned: false } : { ...e, pinned: true }) : e,
    ),
  };
}

/**
 * What the card lists: pinned first (newest pinned on top), then the rest
 * newest first. The stored order stays oldest-first so the cap rule reads as
 * "the head of the list is the oldest note", which is what it drops.
 */
export function visibleEntries(state: SupportWallState): SupportNote[] {
  const pinned = state.entries.filter((e) => e.pinned).sort(byNewest);
  const rest = state.entries.filter((e) => !e.pinned).sort(byNewest);
  return [...pinned, ...rest];
}

function byNewest(a: SupportNote, b: SupportNote): number {
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}
