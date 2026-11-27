import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/dashboard", "/join"] },
    ],
    sitemap: "https://amrutashubham.com/sitemap.xml",
  };
}
