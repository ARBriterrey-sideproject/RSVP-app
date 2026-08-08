import type { Metadata } from "next";
import { APP_NAME } from "@/content/wedding";

export const metadata: Metadata = {
  title: `Dashboard · ${APP_NAME}`,
  // Nothing in the invite links here, but the URL is guessable and the page
  // has no business in a search result.
  robots: { index: false, follow: false },
};

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return children;
}
