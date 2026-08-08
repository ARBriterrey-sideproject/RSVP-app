"use client";

/**
 * The small parts both editing panels are built from.
 *
 * Deliberately not a component library — three functions that keep the Schedule
 * and Emergency-contacts panels looking like one screen rather than two. The
 * field follows the same shape as the sign-in screen's: a cream card that is
 * itself the label, with a borderless input inside it, so a form on the
 * dashboard reads the way the form that let you in did.
 */

export function Field({
  label,
  value,
  onChange,
  ...input
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block rounded-card bg-card px-3.5 py-2.5">
      <span className="block font-sans text-[10px] uppercase tracking-[0.16em] text-driftwood-faint">
        {label}
      </span>
      <input
        {...input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent font-sans text-[15px] leading-snug text-driftwood outline-none placeholder:text-driftwood-faint"
      />
    </label>
  );
}

/**
 * The one place a panel reports what happened.
 *
 * Errors carry the callable's own message rather than a generic line — the
 * server's validation strings name the row on screen ("haldi would end before
 * it starts"), which is the difference between a fixable message and a shrug.
 *
 * "Within a minute" is not hedging: guest pages read this document through a
 * 60-second cache, and saying so here is cheaper than a support message asking
 * why the site still shows the old time.
 */
export function SaveBar({
  dirty,
  busy,
  error,
  saved,
  label,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  busy: boolean;
  error: string | null;
  saved: boolean;
  label: string;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="mt-4 border-t border-hairline/60 pt-4">
      {error ? (
        <p className="mb-3 font-sans text-[13px] leading-snug text-coral-ink">
          {error}
        </p>
      ) : null}
      {saved && !dirty ? (
        <p className="mb-3 font-sans text-[13px] leading-snug text-palm">
          Saved. Guests see this within a minute.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={onSave}
          className="rounded-pill bg-coral px-5 py-2.5 font-sans text-[14px] font-medium text-foam transition-colors hover:bg-coral-deep disabled:opacity-40"
        >
          {busy ? "Saving…" : label}
        </button>
        {dirty && !busy ? (
          <button
            type="button"
            onClick={onDiscard}
            className="font-sans text-[13px] text-driftwood-soft underline underline-offset-4"
          >
            Discard changes
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** A one-line explanation under a panel heading. */
export function PanelNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-xs leading-relaxed text-driftwood-soft">
      {children}
    </p>
  );
}
