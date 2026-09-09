import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AGENTS.md yra musu taisykliu failas. Neleidziam Next.js i ji rasyti per kiekviena `next dev`.
  agentRules: false,
};

export default nextConfig;
