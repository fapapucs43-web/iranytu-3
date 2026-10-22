/**
 * The Ma tab's companion card, mounted directly under the mood card.
 *
 * It reads its own store and subscribes to it, so a saved entry, a completed
 * breathing session or a finished meditation updates the level without a reload.
 * A missing day dims the avatar; the copy names that as a pause, never a loss.
 */
import { useEffect, useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { todayISO } from "../lib/dates";
import {
  companionColorDef,
  companionPresence,
  companionTypeDef,
  levelProgress,
  loadCompanion,
  subscribeCompanion,
  xpToNextLevel,
  type CompanionState,
} from "../lib/companion";

export default function CompanionCard() {
  const [state, setState] = useState<CompanionState>(() => loadCompanion());
  const today = todayISO();

  useEffect(() => subscribeCompanion(setState), []);

  const def = companionTypeDef(state.type);
  const color = companionColorDef(state.color);
  const presence = companionPresence(state, today);
  const progress = levelProgress(state.xp);

  const status =
    presence === "new"
      ? "Még csak most ismerkedtek. Egy bejegyzés, egy légzés vagy egy meditáció elindítja."
      : presence === "dimmed"
        ? "Egy ideje nem jártatok itt. Ez csak szünet — a kísérő ugyanaz, és vár."
        : state.streak > 1
          ? `${state.streak} napja együtt. Jó látni.`
          : "Itt van veled. Nem kell semmit bizonyítanod.";

  return (
    <CollapsibleCard
      id="today-companion"
      title="Kísérő"
      icon={<ContentIcon name="Sprout" />}
      summary={`${def.label} · ${state.level}. szint · ${state.xp} XP`}
    >
      <div
        className={`companion-card${
          presence === "dimmed" ? " companion-dimmed" : presence === "new" ? " companion-new" : ""
        }`}
        style={{ ["--companion-color" as string]: color.hex }}
      >
        <div className="companion-avatar" aria-hidden="true">
          {def.icon}
        </div>
        <div className="companion-copy">
          <div className="companion-title-row">
            <strong>{def.label}</strong>
            <span className="companion-level">{state.level}. szint</span>
          </div>
          <p className="muted-note">{def.hint}</p>
          <div
            className="companion-xp"
            role="progressbar"
            aria-label="Haladás a következő szintig"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className="companion-xp-line">
            {state.xp} XP · még {xpToNextLevel(state.xp)} XP a következő szintig
          </p>
        </div>
      </div>
      <p className="muted-note" role="status">
        {status}
      </p>
      <p className="muted-note">
        Naplózásért, légzésért és meditációért nő. A kihagyott napok nem törlik el — csak
        elszenderedik.
      </p>
    </CollapsibleCard>
  );
}
