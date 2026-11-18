import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["192.168.100.*"],
  experimental: {
    agentUpgrade: "security",
  },
};


export default nextConfig;
