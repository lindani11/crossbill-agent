import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No ESLint setup yet; keep builds from failing on a missing linter.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
