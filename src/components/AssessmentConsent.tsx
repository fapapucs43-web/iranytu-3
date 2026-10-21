/**
 * Informed-consent gate for the Önreflexiós kérdőív (Batch 6).
 *
 * The module is off by default and this dialog is the only way in. It has
 * to answer three questions honestly before someone ticks a box: what does
 * this do, what happens to my answers, and what happens if I change my mind.
 *
 * The source attribution lives here rather than in the running
 * questionnaire — naming the instrument while someone answers would lend it
 * clinical authority this app has not earned.
 */
import { SOURCE_ATTRIBUTION } from "../lib/assessments";
import { t } from "../lib/i18n";
import { ConfirmDialog } from "./ui/ui";
import CrisisCard from "./CrisisCard";

export default function AssessmentConsent({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title={t("assessment.consentTitle")}
      message={
        <>
          <span>
            {t("assessment.consentBody", { source: SOURCE_ATTRIBUTION })}
          </span>
          {/* Mount point 3 of 4. The reason this screen holds the card at
              all: someone deciding whether to switch a clinical
              questionnaire ON should see, before they decide, that the help
              is reachable either way. Declining must not cost them a phone
              number, and putting the card in this dialog is the only way to
              say that in the moment the choice is being made.

              The disclaimer moved out of the prose above and into the card,
              which renders the identical `DISCLAIMER` constant — one copy,
              not two. */}
          <CrisisCard />
        </>
      }
      confirmLabel={t("assessment.consentConfirm")}
      cancelLabel={t("assessment.consentCancel")}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
