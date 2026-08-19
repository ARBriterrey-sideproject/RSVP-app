/**
 * SHARED LINE-ART MOTIFS.
 *
 * Extracted out of InviteLanding, which used to define these privately — the
 * schedule and Today screens need the same palm and wave marks, and a second
 * hand-copied `<svg>` is how the two drift apart the first time one gets a
 * stroke-width tweak the other doesn't.
 */

export function Palm({
  className = "",
  short = false,
}: {
  className?: string;
  short?: boolean;
}) {
  return (
    <svg viewBox="0 0 60 60" aria-hidden className={className}>
      <g
        fill="none"
        stroke="var(--color-tideline)"
        strokeWidth="1.1"
        strokeLinecap="round"
      >
        <path d="M30 0 C30 18 30 34 30 52" />
        <path d="M30 14 C22 16 16 22 13 30" />
        <path d="M30 14 C38 16 44 22 47 30" />
        {short ? (
          <>
            <path d="M30 26 C23 28 18 34 16 41" />
            <path d="M30 26 C37 28 42 34 44 41" />
          </>
        ) : (
          <>
            <path d="M30 24 C23 26 18 32 16 39" />
            <path d="M30 24 C37 26 42 32 44 39" />
            <path d="M30 34 C25 36 21 41 20 47" />
            <path d="M30 34 C35 36 39 41 40 47" />
          </>
        )}
      </g>
    </svg>
  );
}

export function Shell({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 50" aria-hidden className={className}>
      <path
        d="M30 46 C12 46 4 30 8 18 C11 8 22 4 30 4 C38 4 49 8 52 18 C56 30 48 46 30 46 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <g stroke="currentColor" strokeWidth=".9" fill="none" opacity=".8">
        <path d="M30 45 L30 5" />
        <path d="M30 45 L18 8" />
        <path d="M30 45 L42 8" />
        <path d="M30 45 L9 17" />
        <path d="M30 45 L51 17" />
      </g>
    </svg>
  );
}

export function SingleWave({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 10" aria-hidden className={className} fill="none">
      <path
        d="M2 6 Q14 1 26 6 T50 6 T74 6 T98 6"
        stroke="currentColor"
        strokeWidth=".9"
        strokeLinecap="round"
      />
    </svg>
  );
}
