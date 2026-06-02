import type { NextConfig } from "next";

const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'on',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
} as const;

const nextConfig: NextConfig = {
  output: 'standalone',

  async headers() {
    return [
      {
        source: '/:path*',
        headers: Object.entries(securityHeaders).map(([key, value]) => ({ key, value })),
      },
      {
        // Cache static build assets immutably
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
