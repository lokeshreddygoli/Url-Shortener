import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/docs`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/register`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];
}
