import type { MetadataRoute } from "next";

const siteUrl = "https://www.leadhost.it";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/accesso-anticipato`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/proprietari`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/termini`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
