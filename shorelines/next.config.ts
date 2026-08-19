import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Playwright's baseURL is 127.0.0.1 (see playwright.config.ts); Next 16
  // treats that as cross-origin from the dev server's own "localhost" and
  // silently drops every _next/static chunk request without this, which
  // leaves the page unhydrated with no console error to point at why.
  //
  // The sandboxed browser tool used for manual smoke-testing can't resolve
  // "localhost" back to this host and instead loads pages over the LAN IP,
  // which needs the same allowance.
  allowedDevOrigins: ["127.0.0.1", "192.168.3.4"],
};

// Points at src/i18n/request.ts by default. No middleware is registered with
// it, because the locale comes from a cookie rather than a route segment.
export default createNextIntlPlugin()(nextConfig);
