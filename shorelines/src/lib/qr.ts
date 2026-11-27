"use client";

/**
 * QR codes, rendered client-side to a data URI.
 *
 * Shared by the family QR (guest-facing, on the RSVP done screen) and the
 * dashboard's venue QR. Both want the same house colouring, so the palette
 * lives here once.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Level = "L" | "M" | "Q" | "H";

export function qrDataUrl(
  text: string,
  { width = 320, level = "M" }: { width?: number; level?: Level } = {}
): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 1,
    width,
    errorCorrectionLevel: level,
    // Deeptide on white. Anything lighter than this stops scanning reliably
    // off a phone screen at an angle, which is exactly how it gets used.
    color: { dark: "#1F6F73FF", light: "#FFFFFFFF" },
  });
}

/**
 * An absolute link for `path` on whatever host the page is served from, and a
 * QR of it.
 *
 * Both land in one piece of state on purpose: the URL is only knowable in the
 * browser, so a separate hook for it would mean a setState in an effect body
 * and a cascading render on every mount. `qr` is null if rendering failed —
 * survivable, the copyable link sits beside it.
 */
export function useLinkQr(
  path: string,
  options: { width?: number; level?: Level } = {}
): { url: string; qr: string | null } | null {
  const { width, level } = options;
  const [link, setLink] = useState<{ url: string; qr: string | null } | null>(
    null
  );

  useEffect(() => {
    let live = true;
    const url = `${window.location.origin}${path}`;

    qrDataUrl(url, { width, level })
      .then((qr) => {
        if (live) setLink({ url, qr });
      })
      .catch(() => {
        if (live) setLink({ url, qr: null });
      });

    return () => {
      live = false;
    };
  }, [path, width, level]);

  return link;
}
