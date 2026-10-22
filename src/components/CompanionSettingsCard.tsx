/**
 * Settings → Megjelenés — choose the companion's shape and accent.
 *
 * There is no settings field to write: the choice belongs to the companion's
 * own key, next to its XP. These two controls patch that state directly and
 * leave the level and the streak untouched, which is what makes a change of
 * mind cost nothing.
 */
import { useEffect, useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import {
  COMPANION_COLORS,
  COMPANION_TYPES,
  companionColorDef,
  companionTypeDef,
  loadCompanion,
  subscribeCompanion,
  updateCompanionPreferences,
  type CompanionState,
} from "../lib/companion";

export default function CompanionSettingsCard() {
  const [state, setState] = useState<CompanionState>(() => loadCompanion());

  useEffect(() => subscribeCompanion(setState), []);

  const def = companionTypeDef(state.type);
  const color = companionColorDef(state.color);

  return (
    <CollapsibleCard
      id="settings-companion"
      title="Kísérő"
      icon={<ContentIcon name="Sprout" />}
      summary={`${def.label} · ${color.label}`}
    >
      <p className="muted-note">
        Válassz egy kísérőt. Nem kell gondozni, és nem lehet elveszíteni: a kihagyott
        napok csak elszenderítik.
      </p>

      <div
        className="companion-picker"
        role="radiogroup"
        aria-label="Kísérő típusa"
        style={{ ["--companion-color" as string]: color.hex }}
      >
        {COMPANION_TYPES.map((type) => {
          const active = type.type === state.type;
          return (
            <button
              key={type.type}
              type="button"
              role="radio"
              aria-checked={active}
              className={`companion-type-btn${active ? " companion-type-btn-on" : ""}`}
              onClick={() => updateCompanionPreferences({ type: type.type })}
            >
              <span className="companion-type-icon" aria-hidden="true">
                {type.icon}
              </span>
              <span>
                <strong>{type.label}</strong>
                <small>{type.hint}</small>
              </span>
            </button>
          );
        })}
      </div>

      <span className="field-label">Kísérő színe</span>
      <div className="companion-colors" role="radiogroup" aria-label="Kísérő színe">
        {COMPANION_COLORS.map((c) => {
          const active = c.color === state.color;
          return (
            <button
              key={c.color}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={c.label}
              title={c.label}
              className={`companion-color${active ? " companion-color-on" : ""}`}
              style={{ ["--swatch" as string]: c.hex }}
              onClick={() => updateCompanionPreferences({ color: c.color })}
            >
              <span aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <p className="muted-note">
        A kísérő a saját naplójában él, nem kerül a mentésbe, és a „Minden adat
        törlése” vele együtt törli.
      </p>
    </CollapsibleCard>
  );
}
