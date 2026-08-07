// lucide-react dropped brand/logo icons a while back, so WhatsApp and
// Snapchat need hand-drawn stand-ins here — kept in the same
// stroke-based style (viewBox 0 0 24 24, currentColor) as every other
// lucide icon used alongside them, so they sit at the same visual
// weight instead of looking like a mismatched import.

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 21l1.65-4.95A8.5 8.5 0 1 1 8.9 19.4L3 21z" />
      <path
        d="M8.5 9.6c0 3.1 2.6 5.7 5.7 5.7.3 0 .6-.2.7-.5l.4-1a.7.7 0 0 0-.3-.8l-1.4-.8a.7.7 0 0 0-.8.1l-.4.4a5 5 0 0 1-2.1-2.1l.4-.4a.7.7 0 0 0 .1-.8l-.8-1.4a.7.7 0 0 0-.8-.3l-1 .4a.7.7 0 0 0-.5.7z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function SnapchatIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3c-3 0-5 2.2-5 5.2v2.3c-.6.4-1.4.7-2.2.8-.4 0-.6.5-.3.8.5.5 1.2.9 1.9 1.1-.1.4-.3.8-.6 1.1-.3.3-.1.8.3.8.6.1 1.2.1 1.7.3.2.6.7 1.6 2.2 1.8.9.1 1.3-.3 2-.3s1.1.4 2 .3c1.5-.2 2-1.2 2.2-1.8.5-.2 1.1-.2 1.7-.3.4 0 .6-.5.3-.8-.3-.3-.5-.7-.6-1.1.7-.2 1.4-.6 1.9-1.1.3-.3.1-.8-.3-.8-.8-.1-1.6-.4-2.2-.8V8.2C17 5.2 15 3 12 3z" />
    </svg>
  );
}
