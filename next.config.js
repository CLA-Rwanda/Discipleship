const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  // Do not cache dynamic documents/API navigations. This prevents an
  // installed phone PWA from mixing HTML from one deployment with chunks from
  // another after a new deploy.
  runtimeCaching: [],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = withPWA(nextConfig);
