"use client";

// Root-level fallback for anything (app)/error.tsx can't reach — the
// Cockpit intro, /login, /maintenance, /offline, or the root layout
// itself. Replaces the whole document when it fires (Next's own
// requirement for this exact file), so it can't reuse globals.css's
// theme tokens the way (app)/error.tsx does — plain inline styles
// only, deliberately minimal since this is the last line of defense,
// not a normal page.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0e1822",
          color: "#ffffff",
        }}
      >
        <h1 style={{ fontSize: "1.125rem", fontWeight: 500, margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: "20rem", fontSize: "0.875rem", color: "#b7c6dc", margin: 0 }}>
          Sancturm hit an unexpected error. Try again, or reload the page.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            borderRadius: "0.375rem",
            background: "#799dce",
            color: "#0e1822",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
