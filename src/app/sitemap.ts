import type { MetadataRoute } from "next";
import { publicSitemapPages } from "@/lib/seo/public-pages";
import { siteUrl } from "@/lib/seo/structured-data";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicSitemapPages.map((page) => ({
    url: new URL(page.path, siteUrl).toString(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
