import type { Entry, TrackerValue } from "../types";
import { toISODate } from "./dates";

/**
 * Encode a `flags` value as `id=1;id=0` pairs.
 *
 * Explicit pairs rather than a positional bitmask because the import side has
 * no registry to resolve positions against — a mask would need the option list,
 * and a list that has grown since the export would silently shift every value.
 */
function flagsToCell(flags: Record<string, boolean>): string {
  return Object.entries(flags)
    .map(([id, on]) => `${id}=${on ? 1 : 0}`)
    .join(";");
}

/**
 * The inverse of `flagsToCell`.
 *
 * A key that is not a boolean-ish value is skipped. A key the REGISTRY does not
 * know survives into the imported blob, and is dropped a moment later by
 * `sanitizeTrackerValue`, which rebuilds the map from the def's own option list.
 * That split is deliberate: this module stays free of registry knowledge, and
 * the one component that is allowed to decide what a valid flag is does.
 */
function cellToFlags(raw: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim() === "1";
  }
  return out;
}

/** Escape a CSV cell (quotes, commas, newlines). */
function cell(value: string | number | null): string {
  const s = String(value ?? "");
  if (/["\n\r,]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export function entriesToCsv(entries: Entry[]): string {
  // Tracker ids are user-defined and unbounded, so they cannot live in a fixed
  // column list. They are emitted as one column each, prefixed so the importer
  // can recognise them, and the per-tracker KIND is carried in the header so a
  // checkbox never comes back as a slider (or vice versa) on import.
  const trackerIds = new Set<string>();
  for (const e of entries) {
    for (const id of Object.keys(e.trackerValues ?? {})) trackerIds.add(id);
  }
  const sortedTrackers = [...trackerIds].sort();
  const trackerKind = new Map<string, TrackerValue["kind"]>();
  for (const e of entries) {
    for (const [id, v] of Object.entries(e.trackerValues ?? {})) {
      if (!trackerKind.has(id)) trackerKind.set(id, v.kind);
    }
  }

  const header = [
    "date",
    "mood",
    "stress",
    "energy",
    "sleepHours",
    "restingHr",
    "hrv",
    "note",
    "emotions",
    "activities",
    "tags",
    "feeling",
    "stressReason",
    "need",
    ...sortedTrackers.map((id) => `tracker:${id}:${trackerKind.get(id) ?? "text"}`),
  ].join(",");

  const rows = entries.map((e) =>
    [
      e.date,
      e.mood,
      e.stress,
      e.energy,
      e.vitals.sleepHours ?? "",
      e.vitals.restingHr ?? "",
      e.vitals.hrv ?? "",
      cell(e.note),
      e.emotions.join("|"),
      e.activities.join("|"),
      e.tags.join("|"),
      cell(e.reflection.feeling),
      cell(e.reflection.stressReason),
      cell(e.reflection.need),
      ...sortedTrackers.map((id) => {
        const v = e.trackerValues?.[id];
        if (!v) return "";
        if (v.kind === "checkbox") return v.value ? "true" : "false";
        if (v.kind === "flags") return cell(flagsToCell(v.value));
        // A `number` holding null is "not recorded" and leaves the cell EMPTY,
        // so it comes back from an import as absent rather than as a 0.
        if (v.kind === "number") return v.value === null ? "" : cell(v.value);
        // slider, text and select are all a single scalar cell.
        return cell(v.value);
      }),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse hu-HU and common export dates: "2026.05.03.", "2026-05-03", "05/03/2026", "15/03/2026". */
export function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim().replaceAll(".", "-").replace(/-+$/, "");
  if (ISO_DATE.test(s)) return s;
  const parts: string[] = s.split(/[-/]/).map((p: string) => p.trim());
  if (parts.length !== 3 || parts.some((p) => !/^\d{1,4}$/.test(p))) return null;
  const [a, b, c] = parts.map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  // Year first: 2026-5-3
  if (a > 31 || parts[0].length === 4) return `${a}-${pad(b)}-${pad(c)}`;
  // Year last: 15/3/2026 (day first, European) or 3/15/2026 (US)
  if (c > 31 || parts[2].length === 4) {
    return a > 12 ? `${c}-${pad(b)}-${pad(a)}` : `${c}-${pad(a)}-${pad(b)}`;
  }
  // Ambiguous short year — assume Y-M-D with a 2-digit year.
  return `${2000 + a}-${pad(b)}-${pad(c)}`;
}

/** Import entries from CSV text; tolerant of other apps' headers. */
export function csvToEntries(text: string): Entry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  // Matching is case-insensitive (a foreign export may say "Mood"), but the
  // ORIGINAL casing has to survive for the one thing that is a data key rather
  // than a column name: a tracker id. Batch 7e found this the hard way — it
  // drafted the new trackers with camelCase ids, and `sportDuration` came back
  // from its own export as `sportduration`, which matches no definition, so the
  // value was orphaned and the field silently showed its default. The ids are
  // kebab-case now, and the bug is fixed anyway: a custom tracker id or a
  // hand-edited export must not be able to lose its own name. The lowercase
  // copy is for `idx()`; this one is for identity.
  const rawHeaders = splitCsvLine(lines[0]).map((h) => h.trim());
  const headers = rawHeaders.map((h) => h.toLowerCase());

  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex((h) => h.includes(n));
      if (i !== -1) return i;
    }
    return -1;
  };

  const iDate = idx("date", "dátum", "nap");
  const iMood = idx("mood", "hangulat", "érzés", "emotion");
  const iStress = idx("stress", "stressz");
  const iEnergy = idx("energy", "energia");
  const iSleep = idx("sleep", "alvás");
  const iHr = idx("hr", "pulzus");
  const iHrv = idx("hrv");
  const iNote = idx("note", "jegyzet", "text");
  // "emotions" must come first: it is the header entriesToCsv writes. The old
  // alias list only had "emotion_list", so this column was silently never
  // imported (a pre-existing round-trip loss, surfaced by the Batch 4 tests).
  const iEmo = idx("emotions", "emotion_list", "érzelmek", "feelings");
  const iAct = idx("activities", "tevékenység", "aktivitas");
  const iTags = idx("tags", "címke", "tag", "cimke");

  // Dynamic tracker columns: "tracker:<id>:<kind>" written by entriesToCsv.
  // Only those exact headers are claimed, so a foreign CSV that happens to have
  // a "tracker" column is not silently consumed. Read from the RAW headers:
  // the id is a key, and a key that has been lowercased is a different key.
  const trackerCols: { i: number; id: string; kind: TrackerValue["kind"] }[] = [];
  rawHeaders.forEach((h, i) => {
    if (!h.startsWith("tracker:")) return;
    const rest = h.slice("tracker:".length);
    const sep = rest.lastIndexOf(":");
    if (sep <= 0) return;
    const id = rest.slice(0, sep);
    const kind = rest.slice(sep + 1).toLowerCase();
    if (
      kind === "checkbox" ||
      kind === "slider" ||
      kind === "text" ||
      kind === "number" ||
      kind === "select" ||
      kind === "flags"
    ) {
      trackerCols.push({ i, id, kind });
    }
  });

  const out: Entry[] = [];
  for (const line of lines.slice(1)) {
    const row = splitCsvLine(line);
    const dateRaw = iDate !== -1 ? row[iDate] : "";
    const date = parseFlexibleDate(dateRaw) ?? toISODate();
    const moodRaw = iMood !== -1 ? Number(row[iMood]) : NaN;

    const trackerValues: Record<string, TrackerValue> = {};
    for (const col of trackerCols) {
      const raw = row[col.i];
      if (raw === undefined || raw === "") continue;
      if (col.kind === "checkbox") {
        const on = raw === "true" || raw === "1" || raw.toLowerCase() === "igen";
        trackerValues[col.id] = { kind: "checkbox", value: on };
      } else if (col.kind === "slider") {
        const n = Number(raw);
        if (!Number.isNaN(n)) trackerValues[col.id] = { kind: "slider", value: n };
      } else if (col.kind === "number") {
        // A cell of spaces is not a zero. The shared blank check above already
        // caught "", and `Number(" ")` would otherwise have been one.
        if (raw.trim() === "") continue;
        const n = Number(raw);
        if (!Number.isFinite(n)) continue;
        trackerValues[col.id] = { kind: "number", value: n };
      } else if (col.kind === "select") {
        trackerValues[col.id] = { kind: "select", value: raw };
      } else if (col.kind === "flags") {
        trackerValues[col.id] = { kind: "flags", value: cellToFlags(raw) };
      } else {
        trackerValues[col.id] = { kind: "text", value: raw };
      }
    }

    out.push({
      id: crypto.randomUUID(),
      date,
      mood: (moodRaw >= 1 && moodRaw <= 5 ? Math.round(moodRaw) : 3) as Entry["mood"],
      stress: clamp10(iStress !== -1 ? Number(row[iStress]) : 5),
      energy: clamp10(iEnergy !== -1 ? Number(row[iEnergy]) : 5),
      note: iNote !== -1 ? row[iNote] : "",
      emotions: iEmo !== -1 ? row[iEmo].split("|").filter(Boolean) : [],
      activities: iAct !== -1 ? row[iAct].split("|").filter(Boolean) : [],
      tags: iTags !== -1 ? row[iTags].split("|").filter(Boolean) : [],
      reflection: {
        feeling: idx("feeling") !== -1 ? row[idx("feeling")] ?? "" : "",
        stressReason: idx("stressreason") !== -1 ? row[idx("stressreason")] ?? "" : "",
        need: idx("need") !== -1 ? row[idx("need")] ?? "" : "",
      },
      vitals: {
        sleepHours: iSleep !== -1 && row[iSleep] ? Number(row[iSleep]) : null,
        restingHr: iHr !== -1 && row[iHr] ? Number(row[iHr]) : null,
        hrv: iHrv !== -1 && row[iHrv] ? Number(row[iHrv]) : null,
      },
      source: "import",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(Object.keys(trackerValues).length > 0 ? { trackerValues } : {}),
    });
  }
  return out;
}

function clamp10(n: number): number {
  if (Number.isNaN(n)) return 5;
  return Math.min(10, Math.max(1, Math.round(n)));
}
