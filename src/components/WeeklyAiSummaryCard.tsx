/**
 * Phase 4 — the weekly AI summary: one button, the week it is looking at, and
 * the text that comes back — and under it, one question about that same week
 * ("Kérdezz a hetedről"), which shares everything the summary shares.
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
 * which days are in scope before pressing the button. The question goes in on
 * top of those same facts: one question, one week, no history — this is a
 * question about the week, not a conversation the app would have to store.
 *
 * A FAILED CALL IS A SENTENCE, NOT A BLANK
 * Every failure the engine can return maps to its own catalogue line, so a
 * rejected key, a dead network and a switched-off mode read differently. The
 * one thing the card never does is render an empty paragraph as if the model
 * had said something.
 *
 * THE CRISIS BLOCK IS NEVER OPTIONAL
 * Both calls pass `lib/crisisGuard` before any network, key or model is
 * touched: a week or a question carrying a self-harm signal is answered with
 * the app's helpline list — instantly, offline — and an answer that touches
 * the topic gets the same list appended by the engine. That is why the output
 * renders line by line: the block is one sentence plus a bullet list, and it
 * must read as both, not as one collapsed paragraph.
 */
import { useState } from "react";
import type { Entry } from "../types";
import { CollapsibleCard, TextInput } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { t } from "../lib/i18n";
import {
  aiFailureMessage,
  askAboutWeek,
  generateWeeklySummary,
  getAiConfig,
} from "../lib/ai";

type Status = "idle" | "busy" | "done" | "error";

/** One line per paragraph line: blank spacer lines collapse on purpose. */
function OutputLines({ text }: { text: string }) {
  return (
    <>
      {text
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line, i) => <p key={i}>{line}</p>)}
    </>
  );
}

export default function WeeklyAiSummaryCard({ entries }: { entries: readonly Entry[] }) {
  const [status, setStatus] = useState<Status>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatError, setChatError] = useState("");

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

  async function ask() {
    if (chatBusy) return;
    const q = question.trim();
    if (q === "") return;
    setChatBusy(true);
    setChatError("");
    setChatText("");
    const result = await askAboutWeek(q, entries);
    if (result.ok) {
      setChatText(result.text);
    } else {
      setChatError(aiFailureMessage(result.reason));
    }
    setChatBusy(false);
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
          {/* THE VISIBLE WAIT. The button's own label swaps while the summary
              runs — but the FIRST on-device press also downloads the model,
              minutes during which a disabled button is the only feedback the
              reader would have. One line, announced as a status, covers BOTH
              calls: it is on screen while the summary runs and while the
              question does. */}
          {(status === "busy" || chatBusy) && (
            <p className="muted-note" role="status">
              {t("ai.thinking")}
            </p>
          )}
          {status === "error" && (
            <p className="muted-note" role="alert">
              {error}
            </p>
          )}
          {status === "done" && (
            <>
              <OutputLines text={text} />
              <p className="muted-note">{t("insights.ai.machineNote")}</p>
            </>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <label className="field-label" htmlFor="ai-chat-question">
              {t("insights.ai.chatLabel")}
            </label>
            <TextInput
              id="ai-chat-question"
              type="text"
              placeholder={t("insights.ai.chatPlaceholder")}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <div className="weather-try">
              <button
                type="submit"
                className="btn"
                disabled={chatBusy || question.trim() === ""}
              >
                {chatBusy ? t("insights.ai.chatBusy") : t("insights.ai.chatSubmit")}
              </button>
            </div>
            {chatError !== "" && (
              <p className="muted-note" role="alert">
                {chatError}
              </p>
            )}
            {chatText !== "" && (
              <>
                <OutputLines text={chatText} />
                <p className="muted-note">{t("insights.ai.machineNote")}</p>
              </>
            )}
          </form>
          <p className="muted-note">{t("insights.ai.privacyNote")}</p>
        </>
      )}
    </CollapsibleCard>
  );
}
