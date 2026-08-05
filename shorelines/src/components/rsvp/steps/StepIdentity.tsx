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
  if (awaitingCode) {
    return (
      <div className="animate-fade-in">
        <StepTitle>Check your phone</StepTitle>
        <StepIntro>
          We sent a six-digit code to {toE164(phone) ?? phone}. It keeps your
          reply yours — and lets you come back and change it.
        </StepIntro>

        <div className="mt-[22px]">
          <TextField
            label="Six digit code"
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
            Use a different number
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <StepTitle>Is this you?</StepTitle>
      <StepIntro>
        Your number is how we find your reply again — no passwords, no account
        to make.
      </StepIntro>

      <div className="mt-[22px]">
        <TextField
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="98765 43210"
        />
        <Eyebrow className="mt-3 px-1 normal-case tracking-[0.04em]">
          Outside India? Add your country code, like +44.
        </Eyebrow>
      </div>
    </div>
  );
}
