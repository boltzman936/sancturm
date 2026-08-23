import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { OfflineWatcher } from "@/components/OfflineWatcher";

// Display + body face. Loaded once here and exposed as a CSS variable —
// every component gets it "for free" via the --font-sans token in
// globals.css, so you never import a font file more than once.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Used for code blocks, terminal-style UI, and PYQ/notice reference
// numbers — anywhere the content is literal rather than prose.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Sancturm",
  description: "One place. Every resource.",
};

// Runs synchronously, before first paint — sets [data-theme]/[data-mode]
// on <html> from localStorage (falling back to Theme 1 + Light, the
// product default — deliberately NOT the browser's own
// prefers-color-scheme, so every first-time visitor lands on the same
// designed look) so the very first frame already matches what
// useTheme()/useColorMode() will settle on once React hydrates.
// Without this, the page would paint once with no attributes (whatever
// globals.css's un-attributed fallback is), then flash to the real
// theme a moment later — the classic "flash of wrong theme" a
// useEffect-only theme switcher can't avoid. Mirrors useTheme.ts's and
// useColorMode.ts's own resolution logic exactly; keep the three in
// sync if any of them ever changes.
//
// Also covers a second, different flash — the warm theme color (body's
// own bg-background) briefly visible before Cockpit's black wrapper
// div paints over it, on the very first request to "/". Both divs
// involved ARE server-rendered (not a hydration-timing issue) — this
// is a real streaming race: on a slow connection, the browser can
// apply <head>'s CSS (giving body its themed background) before the
// rest of the HTML response (body's own content, further down the
// same document) has fully arrived to paint over it. body's
// background can't be fixed unconditionally to black — every OTHER
// route legitimately wants its own theme color as the first thing
// painted — so this only intervenes for the exact "/" pathname, and
// only for as long as it takes: writing a plain <style> tag into
// <head> (not touching body directly — body doesn't exist in the DOM
// yet when a <head> script runs, so there's nothing to style
// directly) is itself synchronous, ordered before the browser
// continues parsing/painting body, matching this whole script's own
// "runs before first paint, no timing race possible" guarantee.
//
// Self-removing, NOT left in <head> permanently — leaving it in place
// forever meant it kept forcing body black even after a client-side
// navigation away from "/" (Next's App Router doesn't reload <head> on
// a route change), so anyone landing on Notes/PYQs/etc. straight from
// Cockpit inherited a black body background unrelated to their actual
// theme.
//
// Removed on the `load` event, NOT a fixed double-requestAnimationFrame
// timer — that was the actual remaining bug: two rAF frames is ~33ms,
// long enough on a fast connection but nowhere near long enough on a
// genuinely slow/throttled one, where the HTML for body's own content
// (Cockpit's black wrapper div, streamed in as part of the same
// response, further down the document) can take far longer than 33ms
// to actually arrive and paint. Removing the override on that fixed
// timer re-exposed body's real themed background for however much
// longer the real content took beyond that — exactly the "warm flash
// still visible on a slow load" report, even though the override
// itself was working correctly for the first 33ms. `load` fires only
// once the entire document (including that streamed-in body content)
// has fully loaded, so the override now survives for exactly as long
// as the gap it exists to cover, on any connection speed — not a fixed
// guess tuned for a fast one. The 4s fallback is only a safety net for
// `load` somehow never firing (a genuinely hung request, which means
// nothing is painting anyway); harmless either way since real Cockpit
// content is black too, so overshooting slightly is invisible.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('sancturm:theme');if(t!=='1'&&t!=='2'&&t!=='3'&&t!=='4')t='1';var m=localStorage.getItem('sancturm:mode');if(m!=='light'&&m!=='dark')m='light';document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-mode',m);if(window.location.pathname==='/'){var s=document.createElement('style');s.textContent='body{background:#000!important}';document.head.appendChild(s);var done=false;function remove(){if(done)return;done=true;s.remove();}window.addEventListener('load',remove);setTimeout(remove,4000);}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: data-theme/data-mode are set by the
    // inline script below (and thereafter by useTheme/useColorMode),
    // not by anything server-rendered, so the server and first-client-
    // render HTML deliberately differ on these two attributes only.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <OfflineWatcher />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
