/**
 * Phase 5 — the support wall card: "Bátorítások", short positive notes the
 * reader writes to themselves, on this device only.
 *
 * OFF BY DEFAULT, AND THE CARD EXPLAINS INSTEAD OF VANISHING
 * The plan allows hiding or explaining; it explains, for the reason
 * `WeeklyAiSummaryCard` explains: the drawer's contents are part of the tab's
 * reorderable world and a card that appears and disappears with a switch
 * makes the surface's shape unpredictable. The note also says WHERE the wall
 * lives (this device, no network), which is the one thing a reader deciding
 * whether to write something honest needs to know BEFORE writing it.
 *
 * THE COUNTER IS THE CONTRACT
 * `draft.length / 280` sits next to the box, so the cap is visible while the
 * sentence is being written rather than discovered by an error afterwards —
 * and the button's disabled state is derived from the same two values the
 * engine refuses on (`empty`, `too-long`), so the UI cannot promise a press
 * the engine will reject.
 *
 * NOTHING LEAVES THE DEVICE — see `lib/supportWall.ts` for the rules; this
 * file only draws them.
 */
import { useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { t } from "../lib/i18n";
import {
  MAX_TEXT,
  addNote,
  loadSupportWall,
  removeNote,
  saveSupportWall,
  setEnabled,
  togglePin,
  visibleEntries,
  type SupportWallState,
} from "../lib/supportWall";

type Notice = "none" | "added" | "full" | "too-long";

export default function SupportWallCard() {
  const [state, setState] = useState<SupportWallState>(() => loadSupportWall());
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<Notice>("none");

  /** The one writer: memory first, then the key the wipe and backup both know. */
  function commit(next: SupportWallState) {
    setState(next);
    saveSupportWall(next);
  }

  function add() {
    const result = addNote(state, draft);
    if (result.ok) {
      commit(result.state);
      setDraft("");
      setNotice("added");
    } else {
      setNotice(result.reason === "empty" ? "none" : result.reason);
    }
  }

  const tooLong = draft.length > MAX_TEXT;
  const canAdd = draft.trim() !== "" && !tooLong;
  const notes = visibleEntries(state);

  return (
    <CollapsibleCard
      id="tools-support-wall"
      title={t("wall.title")}
      icon={<ContentIcon name="Award" />}
      summary={
        state.enabled
          ? t("wall.summaryCount", { count: notes.length })
          : t("wall.summaryOff")
      }
    >
      {!state.enabled ? (
        <>
          <p className="muted-note">{t("wall.off")}</p>
          <div className="weather-try">
            <button
              type="button"
              className="btn"
              onClick={() => commit(setEnabled(state, true))}
            >
              {t("wall.enable")}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="field-label" htmlFor="wall-text">
            {t("wall.placeholder")}
          </label>
          <textarea
            id="wall-text"
            className="text-area"
            rows={2}
            value={draft}
            placeholder={t("wall.placeholder")}
            onChange={(e) => {
              setDraft(e.target.value);
              if (notice !== "none") setNotice("none");
            }}
          />
          <div className="weather-try">
            <button type="button" className="btn" disabled={!canAdd} onClick={add}>
              {t("wall.add")}
            </button>
            {/* Digits and a slash: language-neutral on purpose, so it needs no
                catalogue line and cannot drift between the three of them. */}
            <small className="muted-note" aria-live="polite">
              {draft.length}/{MAX_TEXT}
            </small>
          </div>

          {notice === "too-long" && (
            <p className="muted-note" role="alert">
              {t("wall.tooLong")}
            </p>
          )}
          {notice === "full" && (
            <p className="muted-note" role="alert">
              {t("wall.full")}
            </p>
          )}
          {notice === "added" && (
            <p className="muted-note" role="status">
              {t("wall.added")}
            </p>
          )}

          {notes.length === 0 ? (
            <p className="muted-note">{t("wall.empty")}</p>
          ) : (
            <ul className="wall-list">
              {notes.map((note) => (
                <li key={note.id} className={note.pinned ? "wall-note wall-note-pinned" : "wall-note"}>
                  <p>{note.text}</p>
                  <small className="muted-note">
                    {new Date(note.createdAt).toLocaleDateString()}
                  </small>
                  <div className="weather-try">
                    <button
                      type="button"
                      className="btn btn-soft"
                      aria-pressed={note.pinned === true}
                      onClick={() => commit(togglePin(state, note.id))}
                    >
                      {note.pinned ? t("wall.unpin") : t("wall.pin")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-soft"
                      onClick={() => commit(removeNote(state, note.id))}
                    >
                      {t("wall.delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="muted-note">{t("wall.localNote")}</p>
          <div className="weather-try">
            <button
              type="button"
              className="btn"
              onClick={() => commit(setEnabled(state, false))}
            >
              {t("wall.disable")}
            </button>
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}
