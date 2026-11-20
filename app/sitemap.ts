import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN, PUBLIC_INDEX_PATHS, isIndexableBuild } from "./seo-config";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexableBuild()) return [];
  return PUBLIC_INDEX_PATHS.map((path) => ({ url: `${CANONICAL_ORIGIN}${path}` }));
}
