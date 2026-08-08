"use client";

import { useTranslations } from "next-intl";
import { toE164 } from "@/lib/firebase/auth";
import { Eyebrow, StepIntro, StepTitle, TextField } from "../ui";

/**
 * Step 1 — establish who is replying.
 *
 * The mockup has no equivalent screen: it starts at "Which days?" and shows the
 * guest's name and email as already-known facts. Since there is no guest list,
 * identity has to be established here instead, written in the same voice as the
 * mockup's own step titles (all of which are questions).
 */
export function StepIdentity({
  phone,
  onPhoneChange,
  code,
  onCodeChange,
  awaitingCode,
  onUseAnotherNumber,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
  awaitingCode: boolean;
  onUseAnotherNumber: () => void;
}) {
  const t = useTranslations("rsvp.identity");

  if (awaitingCode) {
    return (
      <div className="animate-fade-in">
        <StepTitle>{t("codeTitle")}</StepTitle>
        <StepIntro>{t("codeIntro", { phone: toE164(phone) ?? phone })}</StepIntro>

        <div className="mt-[22px]">
          <TextField
            label={t("codeLabel")}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ""))}
            placeholder="······"
            className="text-center text-[22px] tracking-[0.5em]"
          />

          <button
            type="button"
            onClick={onUseAnotherNumber}
            className="mt-4 w-full font-sans text-xs font-medium uppercase tracking-[0.14em] text-coral-ink"
          >
            {t("useAnotherNumber")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <StepTitle>{t("title")}</StepTitle>
      <StepIntro>{t("intro")}</StepIntro>

      <div className="mt-[22px]">
        <TextField
          label={t("phoneLabel")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="98765 43210"
        />
        <Eyebrow className="mt-3 px-1 normal-case tracking-[0.04em]">
          {t("countryCodeHint")}
        </Eyebrow>
      </div>
    </div>
  );
}
