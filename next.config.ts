import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  // Disable error overlay in development
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Suppress hydration warnings
  experimental: {
    optimizePackageImports: ['@headlessui/react'],
  },
};

export default nextConfig;
