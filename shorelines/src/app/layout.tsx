import type { Metadata, Viewport } from "next";
import { Parisienne, Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";

const parisienne = Parisienne({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-parisienne",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
});

const jost = Jost({
  subsets: ["latin"],
  variable: "--font-jost",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shorelines",
  description: "Four days barefoot on the same stretch of sand.",
};

export const viewport: Viewport = {
  themeColor: "#1f6f73",
  // The RSVP is a fixed-height app shell, so it has to extend under the
  // notch and home indicator rather than letterboxing inside them.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${parisienne.variable} ${cormorant.variable} ${jost.variable} h-full`}
    >
      {/* overscroll-none stops the rubber-band bounce revealing white behind
          the sand background on iOS, which reads as a broken app shell. */}
      <body className="h-full overscroll-none font-sans">{children}</body>
    </html>
  );
}
