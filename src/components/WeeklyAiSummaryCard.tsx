/**
 * Phase 4 — the weekly AI summary: one button, the week it is looking at, and
 * the text that comes back.
 *
 * THE CARD IS ALWAYS THERE; THE BUTTON IS NOT ALWAYS MEANINGFUL
 * The plan allows two answers to "AI is off" — hide, or explain. It explains,
 * because the section is part of the tab's reorderable list and a section that
 * vanishes depending on a Settings choice leaves a row in the reorder panel
 * that draws nothing. The note names where the switch is, which is the only
 * thing a reader who wants this feature needs to be told.
 *
 * ONLY THE WEEK GOES IN
 * `entries` is the week the tab is showing — the same array the week's own
 * card summarises above. Nothing here reaches for the journal, so the prompt
 * cannot grow past what the screen is showing, and the reader can see exactly
 * which days are in scope before pressing the button.
 *
 * A FAILED CALL IS A SENTENCE, NOT A BLANK
 * Every failure the engine can return maps to its own catalogue line, so a
 * rejected key, a dead network and a switched-off mode read differently. The
 * one thing the card never does is render an empty paragraph as if the model
 * had said something.
 */
import { useState } from "react";
import type { Entry } from "../types";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { t } from "../lib/i18n";
import { aiFailureMessage, generateWeeklySummary, getAiConfig } from "../lib/ai";

type Status = "idle" | "busy" | "done" | "error";

export default function WeeklyAiSummaryCard({ entries }: { entries: readonly Entry[] }) {
  const [status, setStatus] = useState<Status>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  async function run() {
    if (status === "busy") return;
    setStatus("busy");
    setError("");
    const result = await generateWeeklySummary([...entries]);
    if (result.ok) {
      setText(result.text);
      setStatus("done");
    } else {
      setError(aiFailureMessage(result.reason));
      setStatus("error");
    }
  }

  const mode = getAiConfig().mode;

  return (
    <CollapsibleCard
      id="insights-ai-summary"
      title={t("insights.ai.title")}
      icon={<ContentIcon name="Brain" />}
      summary={t("insights.ai.summary")}
    >
      {mode === "off" ? (
        <p className="muted-note">{t("insights.ai.off")}</p>
      ) : entries.length === 0 ? (
        <p className="muted-note">{t("insights.ai.empty")}</p>
      ) : (
        <>
          <div className="weather-try">
            <button
              type="button"
              className="btn btn-primary"
              disabled={status === "busy"}
              onClick={() => void run()}
            >
              {status === "busy" ? t("insights.ai.busy") : t("insights.ai.generate")}
            </button>
          </div>
          {status === "error" && (
            <p className="muted-note" role="alert">
              {error}
            </p>
          )}
          {status === "done" && (
            <>
              <p>{text}</p>
              <p className="muted-note">{t("insights.ai.machineNote")}</p>
            </>
          )}
          <p className="muted-note">{t("insights.ai.privacyNote")}</p>
        </>
      )}
    </CollapsibleCard>
  );
}
