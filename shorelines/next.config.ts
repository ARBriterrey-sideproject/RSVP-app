import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* config options here */
};

// Points at src/i18n/request.ts by default. No middleware is registered with
// it, because the locale comes from a cookie rather than a route segment.
export default createNextIntlPlugin()(nextConfig);
