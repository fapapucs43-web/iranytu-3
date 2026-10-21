import { useState } from "react";
import { CollapsibleCard, ConfirmDialog, Segmented } from "./ui/ui";
import { useApp } from "../state/AppContext";
import { Plus, Trash } from "../lib/icons";
import {
  addCustomTracker,
  deleteCustomTracker,
  useCustomTrackers,
  MAX_COUNT,
  type CustomTrackerKind,
} from "../lib/customTrackers";
import { GlyphIcon } from "../state/IconSetContext";
import { t } from "../lib/i18n";

/**
 * Settings manager for custom trackers (Batch 2, P2).
 *
 * Definitions live in their own store; values continue to be saved on daily
 * entries via trackerValues, so the entry shape is untouched.
 */
export default function CustomTrackerManager() {
  const { notify } = useApp();
  const trackers = useCustomTrackers();
  const [icon, setIcon] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<CustomTrackerKind>("slider");
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(10);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function add() {
    const def = addCustomTracker({ icon: icon.trim() || "⭐", label, kind, min, max });
    if (!def) {
      notify(
        trackers.length >= MAX_COUNT
          ? t("customTrackers.limitReached", { max: MAX_COUNT })
          : t("customTrackers.duplicateName"),
        "warn",
      );
      return;
    }
    notify(t("customTrackers.added", { icon: def.icon, label: def.label }));
    setLabel("");
    setIcon("");
  }

  const target = trackers.find((item) => item.id === confirmId);

  return (
    <CollapsibleCard
      id="settings-custom-trackers"
      title={t("customTrackers.title")}
      icon={<Plus />}
      summary={t("customTrackers.intro", { max: MAX_COUNT })}
    >
      <p className="muted-note">{t("customTrackers.intro", { max: MAX_COUNT })}</p>
      <div className="add-row">
        <input
          className="text-input"
          style={{ maxWidth: 72, textAlign: "center" }}
          aria-label={t("customTrackers.emojiLabel")}
          maxLength={4}
          placeholder="⭐"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
        />
        <input
          className="text-input"
          aria-label={t("customTrackers.nameLabel")}
          maxLength={24}
          placeholder={t("customTrackers.namePlaceholder")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <Segmented
        ariaLabel={t("customTrackers.kindLabel")}
        options={[
          { value: "slider", label: t("customTrackers.kindSlider") },
          { value: "checkbox", label: t("customTrackers.kindCheckbox") },
          { value: "text", label: t("customTrackers.kindText") },
        ]}
        value={kind}
        onChange={(v) => setKind(v as CustomTrackerKind)}
      />
      {kind === "slider" && (
        <div className="add-row">
          <label className="field-label" style={{ flex: 1 }}>
            {t("customTrackers.minLabel")}
            <input
              className="text-input"
              type="number"
              min={0}
              max={1000}
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
            />
          </label>
          <label className="field-label" style={{ flex: 1 }}>
            {t("customTrackers.maxLabel")}
            <input
              className="text-input"
              type="number"
              min={0}
              max={1000}
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
            />
          </label>
        </div>
      )}
      <button type="button" className="btn btn-soft" onClick={add}>
        <Plus size="1.1em" /> {t("common.add")}
      </button>

      {trackers.length > 0 && (
        <ul className="goal-list">
          {trackers.map((item) => (
            <li key={item.id} className="goal-row">
              <span>
                <strong>
                  <GlyphIcon glyph={item.icon} /> {item.label}
                </strong>{" "}
                <small className="muted-note">
                  {/* The map callback is `item`, not `t`: `t` is the imported
                      translation function, and shadowing it one line below a
                      `t(...)` call is a trap that reads as correct until the
                      next person adds a key here. Same rename as `find` above. */}
                  {item.kind === "slider"
                    ? t("customTrackers.sliderRange", {
                        kind: t("customTrackers.kindSliderShort"),
                        min: item.min ?? 0,
                        max: item.max ?? 0,
                      })
                    : item.kind === "checkbox"
                      ? t("customTrackers.kindCheckboxShort")
                      : t("customTrackers.kindTextShort")}
                </small>
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("customTrackers.deleteLabel", { label: item.label })}
                onClick={() => setConfirmId(item.id)}
              >
                <Trash size="1.1em" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        title={t("tracker.deleteTitle")}
        message={
          target ? t("customTrackers.deleteMessage", { label: target.label }) : ""
        }
        confirmLabel={t("customTrackers.confirmDelete")}
        onConfirm={() => {
          if (confirmId) deleteCustomTracker(confirmId);
          setConfirmId(null);
          notify(t("customTrackers.deleted"));
        }}
        onCancel={() => setConfirmId(null)}
      />
    </CollapsibleCard>
  );
}
