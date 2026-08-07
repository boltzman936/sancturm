import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the parent Downloads/ folder makes
  // Next.js guess the wrong monorepo root — pinning it here is what
  // the build's own warning recommends, and avoids Netlify tracing
  // files outside this project.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
