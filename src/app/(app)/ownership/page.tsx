import { Briefcase, Camera, Code, Mail } from "lucide-react";
import { OWNER } from "@/config/ownership";
import { OwnerPhoto } from "./OwnerPhoto";
import { WhatsAppIcon, SnapchatIcon, LinkedInIcon, RedditIcon } from "@/components/shared/BrandIcons";
import { cn } from "@/lib/utils";

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

// Every social button shares this exact class string (width, height,
// radius, padding, gap) so they line up on a perfect grid regardless
// of label length — a button sized to fit its own text ("Email" vs
// "Instagram") is what broke the identical-size look before.
const LINK_BUTTON_CLASS =
  "flex h-10 w-40 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border bg-card px-4 text-sm text-foreground transition-colors hover:border-primary active:border-primary hover:text-primary active:text-primary";

// Static — one person's profile, edited directly in
// src/config/ownership.ts rather than through a database/admin UI.
export default function OwnershipPage() {
  const activeLinks = LINK_META.filter((link) => OWNER.links[link.key]);
  const hasPortfolio = Boolean(OWNER.links.portfolio);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-medium text-foreground">Ownership</h1>
          <p className="text-muted-foreground">Who built and runs Sancturm.</p>
        </div>

        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-5 text-center sm:flex-row sm:p-6 sm:text-left">
          {OWNER.photoUrl ? (
            <OwnerPhoto
              src={OWNER.photoUrl}
              fullSrc={OWNER.photoFullUrl || OWNER.photoUrl}
              alt={OWNER.name}
            />
          ) : (
            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-2 border-border bg-primary/10 text-3xl font-medium text-primary">
              {OWNER.name.charAt(0)}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-lg font-medium text-foreground">{OWNER.name}</p>
            <p className="text-xs text-subtle-foreground">({OWNER.batch})</p>
            <p className="text-sm text-muted-foreground">{OWNER.role}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2 pb-14 sm:justify-start">
        {activeLinks.map((link) => (
          <a
            key={link.key}
            href={OWNER.links[link.key]}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_BUTTON_CLASS}
          >
            <link.icon className="h-4 w-4 shrink-0" />
            {link.label}
          </a>
        ))}

        {hasPortfolio ? (
          <a
            href={OWNER.links.portfolio}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_BUTTON_CLASS}
          >
            <Briefcase className="h-4 w-4 shrink-0" />
            Portfolio
          </a>
        ) : (
          <span aria-disabled="true" className={cn(LINK_BUTTON_CLASS, "border-dashed text-subtle-foreground opacity-70")}>
            <Briefcase className="h-4 w-4 shrink-0" />
            Portfolio
            <span className="font-mono text-xs">(soon)</span>
          </span>
        )}
      </div>
    </div>
  );
}
