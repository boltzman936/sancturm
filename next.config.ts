import type { NextConfig } from "next";

// Built from env, not hardcoded — this runs at build/server time to
// produce a header STRING, so referencing server-only vars here (e.g.
// R2_PUBLIC_URL, which has no NEXT_PUBLIC_ prefix) never ships them to
// the browser; only the resulting CSP value does.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const r2PublicUrl = process.env.R2_PUBLIC_URL ?? "";
// The presigned-upload target (uploadFileToR2 PUTs straight here from
// the browser) is a DIFFERENT host from R2_PUBLIC_URL (the public read
// domain, often a custom domain) — both need to be allowed or uploads
// silently break.
const r2UploadHost = process.env.R2_ACCOUNT_ID
  ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : "";

// Next.js's dev-mode webpack (Fast Refresh/HMR) evaluates code via
// eval(), which 'unsafe-inline' alone doesn't cover — production's
// bundled/minified output never does this, so relaxing script-src
// with 'unsafe-eval' only outside production keeps the real policy
// (what actually ships) unaffected by dev tooling's own requirements.
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  // 'unsafe-inline' here is a real, deliberate trade-off, not an
  // oversight: Next.js's App Router streams small inline <script>
  // snippets for selective hydration (used by the /cr/* loading.tsx
  // boundaries), and there's no dangerouslySetInnerHTML/innerHTML/eval
  // anywhere in this codebase for it to enable — the actual XSS path
  // this app had (arbitrary content-type on uploads, rendered in an
  // unsandboxed iframe) is closed at its source instead, in
  // uploads/actions.ts and ResourceViewerDialog. A nonce-based CSP
  // would remove this trade-off but needs middleware running on every
  // route to mint a per-request nonce — reintroducing exactly the
  // auth-refresh-on-every-navigation cost that was deliberately scoped
  // down to /cr/* only for performance.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Radix (the Year/Branch switcher, the calendar popover) positions
  // its portaled content with inline style attributes — blocking
  // those wouldn't stop meaningful XSS (style-based injection is a
  // far narrower vector than script) but would visibly break every
  // dropdown/popover in the app.
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${r2PublicUrl} ${supabaseUrl}`.trim(),
  `font-src 'self'`,
  // The R2 domains here are for the PDF viewer's own fetch() (pdf.js
  // reads the file's bytes directly, not through an <iframe>) — see
  // ResourceViewerDialog/PdfViewer.
  `connect-src 'self' ${supabaseUrl} ${r2UploadHost} ${r2PublicUrl}`.trim(),
  // pdf.js's worker is loaded from /pdf.worker.min.mjs (same-origin —
  // see the postinstall script in package.json), which 'self' already
  // covers; stated explicitly so it can't silently start depending on
  // default-src's fallback chain instead.
  "worker-src 'self'",
  // Nothing gets framed anymore — the PDF viewer used to be an
  // <iframe src={file_url}>, which is exactly what broke inconsistently
  // across browsers (see PdfViewer's own comment). Rendering pages to
  // canvas via fetch() removed the need for frame-src entirely.
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Belt-and-suspenders with the X-Frame-Options header below —
  // frame-ancestors is the modern replacement and wins in browsers
  // that support both, X-Frame-Options covers the rest.
  "frame-ancestors 'none'",
]
  .join("; ")
  // Collapse the accidental double-spaces from empty env vars in dev
  // (e.g. R2_PUBLIC_URL unset locally) into single spaces — cosmetic,
  // doesn't change what the policy allows.
  .replace(/ {2,}/g, " ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

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
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
