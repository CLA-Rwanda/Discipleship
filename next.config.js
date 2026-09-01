const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  // Cache only the public attendance document as a shell. Supabase-backed
  // requests and all other dynamic pages remain network-only so stale data
  // cannot be shown. The shell is refreshed whenever the network is available.
  runtimeCaching: [
    {
      urlPattern: /\/attendance(?:\/)?(?:\?.*)?$/,
      handler: "NetworkFirst",
      options: {
        cacheName: "attendance-shell",
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 7 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = withPWA(nextConfig);
