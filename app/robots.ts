import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN, isIndexableBuild } from "./seo-config";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableBuild()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    // Keep page URLs crawlable so crawlers can observe noindex headers.
    // Robots exclusions are not an authorization or indexing control.
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
  };
}
