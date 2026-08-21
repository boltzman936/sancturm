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
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('sancturm:theme');if(t!=='1'&&t!=='2'&&t!=='3'&&t!=='4')t='1';var m=localStorage.getItem('sancturm:mode');if(m!=='light'&&m!=='dark')m='light';document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-mode',m);}catch(e){}})();`;

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
