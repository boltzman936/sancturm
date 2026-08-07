// lucide-react dropped brand/logo icons a while back, so every brand
// used on the Ownership page is hand-drawn here as a small "app icon"
// badge — brand-colored background (or gradient, for Instagram) with a
// white glyph on top — since that's the form people actually recognize
// these logos in (phone home screens), far more than a single-color
// line icon ever reads as "the WhatsApp/Instagram/etc. logo". Colors
// are baked into each badge rather than driven by `currentColor`, so
// these ignore the button's text color entirely by design.

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="11" fill="#25D366" />
      <path
        d="M12 5.5a6.5 6.5 0 0 0-5.6 9.8L5.5 18.5l3.3-.9A6.5 6.5 0 1 0 12 5.5z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.3"
      />
      <path
        d="M9.4 9.3c.15-.35.3-.35.45-.36h.35c.12 0 .27 0 .4.32.16.4.55 1.35.6 1.45.05.1.08.22.02.35-.06.13-.09.2-.18.3-.1.1-.2.23-.28.3-.1.1-.2.2-.09.4.12.2.5.9 1.1 1.45.75.7 1.4.94 1.6 1.05.2.1.32.08.45-.05.13-.13.5-.55.65-.75.13-.2.27-.16.45-.1.18.07 1.15.55 1.35.65.2.1.33.15.38.24.05.1.05.55-.13 1.08-.18.53-1.05.98-1.45 1.03-.4.05-.85.22-2.85-.6-2.4-1-3.9-3.45-4-3.6-.1-.15-.85-1.13-.85-2.15s.55-1.53.73-1.75z"
        fill="#fff"
      />
    </svg>
  );
}

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <defs>
        <linearGradient id="ig-grad" x1="0" y1="24" x2="24" y2="0">
          <stop offset="0%" stopColor="#FEE411" />
          <stop offset="25%" stopColor="#F7761A" />
          <stop offset="55%" stopColor="#E4405F" />
          <stop offset="80%" stopColor="#C13584" />
          <stop offset="100%" stopColor="#5851DB" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6.5" fill="url(#ig-grad)" />
      <rect x="6.5" y="6.5" width="11" height="11" rx="3.5" fill="none" stroke="#fff" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="#fff" strokeWidth="1.5" />
      <circle cx="16.3" cy="7.7" r="1" fill="#fff" />
    </svg>
  );
}

export function SnapchatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect x="1" y="1" width="22" height="22" rx="6.5" fill="#FFFC00" />
      {/* Bold, simplified ghost silhouette — plain white shape, no fine
          detail — small brand icons read by silhouette at a glance, not
          by faithfully reproducing every curve of the real mark, and
          finer detail was disappearing entirely at 16-18px. */}
      <path
        d="M12 4.5c-3.6 0-6 2.7-6 6.3v3.3c0 .5-.6.8-1.3 1-.6.2-.6 1 0 1.2.6.2 1.2.4 1.6.7-.1.4-.3.7-.6 1-.4.4-.1 1 .5 1 .8.1 1.5.2 2 .5.6.9 1.7 1.5 3.1 1.5h.4c1.4 0 2.5-.6 3.1-1.5.5-.3 1.2-.4 2-.5.6 0 .9-.6.5-1-.3-.3-.5-.6-.6-1 .4-.3 1-.5 1.6-.7.6-.2.6-1 0-1.2-.7-.2-1.3-.5-1.3-1v-3.3c0-3.6-2.4-6.3-6-6.3z"
        fill="#fff"
      />
    </svg>
  );
}

export function GmailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect x="1" y="1" width="22" height="22" rx="4.5" fill="#fff" />
      <path
        d="M5.5 6.8c-.66 0-1.2.54-1.2 1.2v8c0 .66.54 1.2 1.2 1.2h13c.66 0 1.2-.54 1.2-1.2V8c0-.66-.54-1.2-1.2-1.2h-13z"
        fill="none"
        stroke="#EA4335"
        strokeWidth="1.3"
      />
      <path d="M4.7 7.3 12 12.8l7.3-5.5" fill="none" stroke="#EA4335" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect x="1" y="1" width="22" height="22" rx="4.5" fill="#0A66C2" />
      <circle cx="7.5" cy="7.8" r="1.3" fill="#fff" />
      <rect x="6.3" y="10.3" width="2.4" height="7.2" fill="#fff" />
      <path
        d="M11.3 10.3h2.3v1c.4-.65 1.2-1.2 2.3-1.2 2 0 2.6 1.2 2.6 3v4.4h-2.4v-3.9c0-.9-.3-1.5-1.15-1.5-.8 0-1.2.55-1.2 1.5v3.9h-2.4v-7.2z"
        fill="#fff"
      />
    </svg>
  );
}

export function RedditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="11" fill="#FF4500" />
      <circle cx="12" cy="13.6" r="5.6" fill="#fff" />
      <circle cx="9.3" cy="13.3" r="0.95" fill="#FF4500" />
      <circle cx="14.7" cy="13.3" r="0.95" fill="#FF4500" />
      <path d="M9.5 16c.7.6 1.6.85 2.5.85s1.8-.25 2.5-.85" fill="none" stroke="#FF4500" strokeWidth="0.9" strokeLinecap="round" />
      <line x1="12" y1="8.4" x2="12" y2="6.1" stroke="#fff" strokeWidth="0.9" strokeLinecap="round" />
      <circle cx="12" cy="5.3" r="1.1" fill="#fff" />
      <circle cx="17.3" cy="11.6" r="1.3" fill="#fff" />
    </svg>
  );
}
