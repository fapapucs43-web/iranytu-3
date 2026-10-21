import { useState } from "react";
import { useApp } from "../state/AppContext";
import { MOODS } from "../lib/mood";
import { formatHuman } from "../lib/dates";
import { ConfirmDialog } from "./ui/ui";
import { getAttachmentDataUrl } from "../lib/attachments";
import { Activity, ClipboardList, Pencil, Save, Target, Trash, X, Zap } from "../lib/icons";
import ContentIcon from "./ContentIcon";
import type { Entry, MoodLevel } from "../types";
import { GlyphIcon } from "../state/IconSetContext";
import { describeValue, displayDefs, recordedGroups } from "../lib/trackerDisplay";
import { useCustomTrackers } from "../lib/customTrackers";
import { t } from "../lib/i18n";
import { CrisisStrip } from "./CrisisCard";

function AttachmentGallery({ attachments }: { attachments: Entry["attachments"] }) {
  return (
    <div className="attachment-list">
      {(attachments ?? []).map((a) => {
        const url = getAttachmentDataUrl(a.id);
        if (!url) return null;
        if (a.kind === "video") {
          return <video key={a.id} controls src={url} preload="metadata" className="attachment-video" />;
        }
        if (a.kind === "audio") {
          return <audio key={a.id} controls src={url} preload="none" />;
        }
        return <img key={a.id} src={url} alt={t("attachments.photoAlt")} className="attachment-thumb" />;
      })}
    </div>
  );
}

export default function EntryDetail({
  entry,
  onClose,
}: {
  entry: Entry | null;
  onClose: () => void;
}) {
  const { saveEntry, deleteEntry, notify } = useApp();
  const [editing, setEditing] = useState(false);
  const [mood, setMood] = useState<MoodLevel>(3);
  const [stress, setStress] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  // A hook, so it goes with the others and above the early return below.
  const customDefs = useCustomTrackers();

  // Sync local edit fields whenever a different entry is opened.
  if (entry && entry.id !== loadedId) {
    setLoadedId(entry.id);
    setEditing(false);
    setMood(entry.mood);
    setStress(entry.stress);
    setEnergy(entry.energy);
    setNote(entry.note);
  }

  if (!entry) return null;

  // What was RECORDED on this entry — never what the settings enable now.
  // Those keys are written for every enabled tracker the day an entry is
  // created, so their presence is a record of the settings of that day, not of
  // anything the user typed; and a tracker they filled in and have since
  // switched off is still theirs. `lib/trackerDisplay` owns that decision.
  const trackerGroups = recordedGroups(entry.trackerValues, displayDefs(customDefs));

  function save() {
    // Pass only what this dialog edits; saveEntry merges the rest, so
    // attachments and trackerValues survive an edit.
    saveEntry({
      date: entry!.date,
      mood,
      stress,
      energy,
      note,
    });
    notify(t("entry.detail.savedToast"));
    setEditing(false);
    onClose();
  }

  function remove() {
    deleteEntry(entry!.id);
    notify(t("entry.detail.deletedToast"));
    setConfirmDelete(false);
    onClose();
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t("entry.detail.aria")} onClick={onClose}>
      <div className="dialog dialog-wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>{formatHuman(entry.date)}</h2>
          <button type="button" className="icon-btn" aria-label={t("entry.detail.close")} onClick={onClose}>
            <X size="1.1em" />
          </button>
        </div>

        {!editing ? (
          <>
            <p className="detail-mood">
              <span aria-hidden="true"><GlyphIcon glyph={MOODS.find((m) => m.level === entry.mood)?.emoji ?? ""} /></span>{" "}
              {MOODS.find((m) => m.level === entry.mood)?.label}
            </p>
            <div className="detail-stats">
              <span><Activity size="1.1em" /> {t("entry.detail.stressField", { value: entry.stress })}</span>
              <span><Zap size="1.1em" /> {t("entry.detail.energyField", { value: entry.energy })}</span>
              {entry.vitals.sleepHours != null && <span><ContentIcon name="Bed" size="1.1em" /> {t("entry.detail.sleep", { hours: entry.vitals.sleepHours })}</span>}
              {entry.vitals.restingHr != null && <span><ContentIcon name="Heart" size="1.1em" /> {t("entry.detail.pulse", { value: entry.vitals.restingHr })}</span>}
            </div>
            {entry.activities.length > 0 && (
              <p className="detail-tags"><Target size="1.1em" /> {entry.activities.join(" · ")}</p>
            )}
            {entry.emotions.length > 0 && (
              <p className="detail-tags"><ContentIcon name="Heart" size="1.1em" /> {entry.emotions.join(" · ")}</p>
            )}
            {entry.note && <p className="detail-note">{entry.note}</p>}
            {trackerGroups.length > 0 && (
              <div className="detail-trackers">
                <h3>
                  <ClipboardList size="1.1em" /> {t("entry.detail.trackersTitle")}
                </h3>
                {trackerGroups.map((group) => (
                  <div
                    key={group.head.id}
                    className={
                      // The same rule the daily card uses: a box around a lone
                      // row is noise, so a solo tracker gets no box and no
                      // heading. The classes are its, not new ones.
                      group.members.length > 1
                        ? "tracker-group"
                        : "tracker-group tracker-group-solo"
                    }
                  >
                    {group.members.length > 1 && (
                      <p className="tracker-read-head">
                        <GlyphIcon glyph={group.head.icon} /> {group.head.label}
                      </p>
                    )}
                    {group.members.map(({ def, value }) => {
                      const shown = describeValue(def, value);
                      if (!shown) return null;
                      return (
                        <div
                          key={def.id}
                          className={
                            shown.kind === "flags"
                              ? "tracker-read-row tracker-read-row-wide"
                              : "tracker-read-row"
                          }
                        >
                          <span className="tracker-read-label">
                            <GlyphIcon glyph={def.icon} /> {def.label}
                          </span>
                          {shown.kind === "flags" ? (
                            <span className="tracker-flags">
                              {shown.labels.map((label) => (
                                <span key={label} className="tracker-chip">
                                  {label}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="tracker-read-value">{shown.text}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            {entry.attachments && entry.attachments.length > 0 && (
              <AttachmentGallery attachments={entry.attachments} />
            )}
            {(entry.reflection.feeling || entry.reflection.stressReason || entry.reflection.need) && (
              <div className="detail-reflection">
                <h3><ContentIcon name="Brain" size="1.1em" /> {t("entry.detail.reflectionTitle")}</h3>
                {entry.reflection.feeling && <p>{t("entry.detail.feeling", { value: entry.reflection.feeling })}</p>}
                {entry.reflection.stressReason && <p>{t("entry.detail.stressReason", { value: entry.reflection.stressReason })}</p>}
                {entry.reflection.need && <p>{t("entry.detail.need", { value: entry.reflection.need })}</p>}
              </div>
            )}
            <div className="dialog-actions">
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash size="1.1em" /> {t("entry.detail.delete")}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
                <Pencil size="1.1em" /> {t("entry.detail.edit")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mood-row" role="radiogroup" aria-label={t("entry.detail.moodAria")}>
              {MOODS.map((m) => (
                <button
                  key={m.level}
                  type="button"
                  role="radio"
                  aria-label={m.label}
                  aria-checked={mood === m.level}
                  className={`mood-btn ${mood === m.level ? "mood-btn-active" : ""}`}
                  onClick={() => setMood(m.level as MoodLevel)}
                >
                  <span className="mood-emoji" aria-hidden="true"><GlyphIcon glyph={m.emoji} /></span>
                </button>
                ))}
            </div>
            <label className="field-label" htmlFor="edit-stress">{t("entry.detail.stressField", { value: stress })}</label>
            <input id="edit-stress" type="range" min={1} max={10} value={stress} onChange={(e) => setStress(Number(e.target.value))} className="slider slider-rose" />
            <label className="field-label" htmlFor="edit-energy">{t("entry.detail.energyField", { value: energy })}</label>
            <input id="edit-energy" type="range" min={1} max={10} value={energy} onChange={(e) => setEnergy(Number(e.target.value))} className="slider slider-amber" />
            <label className="field-label" htmlFor="edit-note">{t("entry.detail.noteLabel")}</label>
            <textarea id="edit-note" className="text-area journal-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                {t("entry.detail.cancel")}
              </button>
              <button type="button" className="btn btn-primary" onClick={save}>
                <Save size="1.1em" /> {t("entry.detail.save")}
              </button>
            </div>
          </>
        )}
        {/* Mount point 4 of 4. Outside the editing ternary on purpose: the
            strip has to be on screen both when the entry is being read AND
            while it is being changed, because editing a record of a hard day
            is as likely a moment to want help as reading it. Never
            conditional, and above the action buttons so it is not the last
            thing below the fold. */}
        <CrisisStrip />
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={t("entry.deleteTitle")}
        message={t("entry.detail.deleteMessage")}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
