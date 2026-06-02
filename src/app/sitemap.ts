// =============================================================================
// Sitemap — SEO
// =============================================================================
//
// Generates a sitemap.xml at build time with all public pages.
// Uses NEXT_PUBLIC_SITE_URL for the base URL, falls back to localhost.
// =============================================================================

import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://block-chain.vercel.app';

  return [
    { url: siteUrl, lastModified: new Date(), changeFrequency: 'monthly', priority: 1 },
    { url: `${siteUrl}/login`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/register`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/onboarding`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${siteUrl}/perfil`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
  ];
}
