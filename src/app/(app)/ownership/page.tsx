import { Briefcase, Camera, Code, Mail } from "lucide-react";
import { OWNER } from "@/config/ownership";
import { OwnerPhoto } from "./OwnerPhoto";
import { WhatsAppIcon, SnapchatIcon, LinkedInIcon, RedditIcon } from "@/components/shared/BrandIcons";

// lucide-react dropped brand/logo icons — Code and Camera stand in for
// GitHub and Instagram (no close brand equivalent exists either way);
// WhatsApp, Snapchat, LinkedIn, and Reddit get actual hand-drawn logos
// from BrandIcons. Portfolio is handled separately below — it's not a
// real link yet, so it needs a "coming soon" state, not simple hide.
const LINK_META = [
  { key: "whatsapp", label: "WhatsApp", icon: WhatsAppIcon },
  { key: "email", label: "Email", icon: Mail },
  { key: "github", label: "GitHub", icon: Code },
  { key: "instagram", label: "Instagram", icon: Camera },
  { key: "snapchat", label: "Snapchat", icon: SnapchatIcon },
  { key: "linkedin", label: "LinkedIn", icon: LinkedInIcon },
  { key: "reddit", label: "Reddit", icon: RedditIcon },
] as const;

// Static — one person's profile, edited directly in
// src/config/ownership.ts rather than through a database/admin UI.
export default function OwnershipPage() {
  const activeLinks = LINK_META.filter((link) => OWNER.links[link.key]);
  const hasPortfolio = Boolean(OWNER.links.portfolio);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Ownership</h1>
        <p className="text-muted-foreground">Who built and runs Sancturm.</p>
      </div>

      <div className="flex flex-col items-center gap-5 rounded-lg border border-border bg-card p-6 text-center sm:flex-row sm:p-8 sm:text-left">
        {OWNER.photoUrl ? (
          <OwnerPhoto src={OWNER.photoUrl} alt={OWNER.name} />
        ) : (
          <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full border-2 border-border bg-primary/10 text-4xl font-medium text-primary">
            {OWNER.name.charAt(0)}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <p className="text-lg text-foreground">{OWNER.name}</p>
          <p className="text-sm text-muted-foreground">{OWNER.role}</p>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
        {activeLinks.map((link) => (
          <a
            key={link.key}
            href={OWNER.links[link.key]}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <link.icon className="h-4 w-4" />
            {link.label}
          </a>
        ))}

        {hasPortfolio ? (
          <a
            href={OWNER.links.portfolio}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Briefcase className="h-4 w-4" />
            Portfolio
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-2 text-sm text-subtle-foreground opacity-70"
          >
            <Briefcase className="h-4 w-4" />
            Portfolio
            <span className="font-mono text-xs">(soon)</span>
          </span>
        )}
      </div>
    </div>
  );
}
