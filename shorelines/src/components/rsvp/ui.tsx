/**
 * The small parts of screen 1c, isolated so the step components stay readable.
 *
 * Sizes here (24px check, 22px radio, 34px stepper, 3px accent stripe) are the
 * mockup's, not approximations. Tap targets that fall below ~44px are given
 * padding rather than being resized, so the visual weight survives.
 */

export function Eyebrow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-driftwood-faint ${className}`}
    >
      {children}
    </div>
  );
}

export function StepTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[38px] leading-none text-deeptide">
      {children}
    </h2>
  );
}

export function StepIntro({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 font-sans text-sm leading-[1.6] text-driftwood-soft">
      {children}
    </p>
  );
}

/** The cream card that nearly every row in 1c sits on. */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card bg-card p-4 ${className}`}>{children}</div>
  );
}

/**
 * Text input styled as a card, so fields and static cards share one silhouette.
 * 16px minimum on the font size — anything smaller makes iOS Safari zoom the
 * viewport on focus, which wrecks the fixed-height layout.
 */
export function TextField({
  label,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <input
      aria-label={label}
      placeholder={label}
      className={`w-full rounded-card bg-card px-4 py-3.5 font-sans text-base text-driftwood outline-none ring-1 ring-transparent transition placeholder:text-driftwood-faint focus:bg-white focus:ring-deeptide ${className}`}
      {...props}
    />
  );
}

/** 24px circle: hollow ring when off, filled deeptide tick when on. */
export function CheckCircle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-6 flex-none place-items-center rounded-full font-sans text-xs font-medium transition-colors ${
        checked
          ? "bg-deeptide text-sand"
          : "border-[1.5px] border-hairline text-transparent"
      }`}
    >
      ✓
    </span>
  );
}

/** 22px circle with a palm-green dot — the menu picker in "At the table". */
export function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className="grid size-[22px] flex-none place-items-center rounded-full border-[1.5px] border-hairline"
    >
      <span
        className={`size-3 rounded-full transition-colors ${
          selected ? "bg-palm" : "bg-transparent"
        }`}
      />
    </span>
  );
}

/**
 * The −/+ counter. The minus is outlined and the plus is a filled deeptide
 * disc: the mockup deliberately makes adding the easier, more inviting action.
 */
export function Stepper({
  value,
  min = 0,
  max,
  onChange,
  fewerLabel,
  moreLabel,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
  /**
   * Both labels arrive whole rather than being built here from a noun. "One
   * fewer child" needs the noun inflected in Hindi, Kannada and Odia, and this
   * component has no way to do that — the caller owns the sentence.
   */
  fewerLabel: string;
  moreLabel: string;
}) {
  return (
    <div className="flex flex-none items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={fewerLabel}
        className="grid size-[34px] place-items-center rounded-full border border-hairline font-sans text-lg leading-none text-deeptide transition-colors hover:bg-deeptide/8 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        −
      </button>

      <span
        aria-live="polite"
        className="min-w-4 text-center font-sans text-[19px] leading-none text-driftwood tabular-nums"
      >
        {value}
      </span>

      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={moreLabel}
        className="grid size-[34px] place-items-center rounded-full bg-deeptide font-sans text-lg leading-none text-sand transition-colors hover:bg-deeptide-deep disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

/** The 46×27 pill switch on the travel step. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[27px] w-[46px] flex-none rounded-pill transition-colors ${
        checked ? "bg-deeptide" : "bg-hairline"
      }`}
    >
      <span
        className={`absolute top-[3px] size-[21px] rounded-full bg-white shadow-sm transition-[left] duration-200 ${
          checked ? "left-[22px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

/** The little gold wave that sits beside the footnote on the party step. */
export function WaveRule() {
  return (
    <svg
      viewBox="0 0 100 14"
      aria-hidden
      className="mt-1 w-14 flex-none"
      fill="none"
    >
      <path
        d="M2 8 Q14 1 26 8 T50 8 T74 8 T98 8"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

const SCALLOP_TILE_PATH: Record<"bottom" | "top", string> = {
  bottom: "M0 0 A5 5 0 0 0 10 0 L10 8 L0 8 Z",
  top: "M0 8 A5 5 0 0 1 10 8 L10 0 L0 0 Z",
};

function scallopMaskImage(edge: "bottom" | "top") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 8"><path d="${SCALLOP_TILE_PATH[edge]}" fill="black"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const SCALLOP_MASK_IMAGE: Record<"bottom" | "top", string> = {
  bottom: scallopMaskImage("bottom"),
  top: scallopMaskImage("top"),
};

/**
 * The scalloped edge where a coloured band meets the sand. A single scallop
 * tile is repeated via a CSS mask (rather than stretched across a fixed
 * viewBox) so the number of frills scales with the rendered width — each
 * stays a true circle at any viewport, continuously through a live resize,
 * with no JS measurement.
 *
 * `edge` is which side of the band it sits on. The two tiles differ by the
 * arc sweep flag — bottom bites upward into the band, top bites downward —
 * so a band with both gets scallops that curve the same way rather than
 * mirroring.
 */
export function ScallopEdge({
  className = "",
  edge = "bottom",
}: {
  className?: string;
  edge?: "bottom" | "top";
}) {
  const maskImage = SCALLOP_MASK_IMAGE[edge];

  return (
    <div
      aria-hidden
      className={`absolute inset-x-0 h-4 w-full ${
        edge === "bottom" ? "-bottom-px" : "-top-px"
      } ${className}`}
      style={{
        backgroundColor: "currentColor",
        WebkitMaskImage: maskImage,
        maskImage,
        WebkitMaskRepeat: "repeat-x",
        maskRepeat: "repeat-x",
        WebkitMaskSize: "20px 16px",
        maskSize: "20px 16px",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
