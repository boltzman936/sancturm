import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the parent Downloads/ folder makes
  // Next.js guess the wrong monorepo root — pinning it here is what
  // the build's own warning recommends, and avoids Netlify tracing
  // files outside this project.
  outputFileTracingRoot: __dirname,

  async headers() {
    return [
      {
        // Static art assets (e.g. the offline page's background) —
        // these don't change without also changing the filename, so
        // once a browser has one cached it never needs to re-check.
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
