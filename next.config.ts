import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static onboarding deck lives at public/deck/index.html. It's reachable
  // only via this exact bookmarkable path — intentionally not in any nav.
  async rewrites() {
    return [{ source: "/deck", destination: "/deck/index.html" }];
  },
};

export default nextConfig;
