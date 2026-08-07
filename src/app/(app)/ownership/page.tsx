import { Briefcase, Code } from "lucide-react";
import { OWNER } from "@/config/ownership";
import { OwnerPhoto } from "./OwnerPhoto";
import {
  WhatsAppIcon,
  GmailIcon,
  InstagramIcon,
  SnapchatIcon,
  LinkedInIcon,
  RedditIcon,
} from "@/components/shared/BrandIcons";
import { cn } from "@/lib/utils";

// lucide-react dropped brand/logo icons — Code stands in for GitHub
// (no close brand equivalent exists). WhatsApp, Gmail, Instagram,
// Snapchat, LinkedIn, and Reddit get real hand-drawn "app icon" badges
// from BrandIcons — each one carries its own brand color baked in, not
// driven by `currentColor`, so no color class is needed here for
// those. Portfolio is handled separately below — it's not a real link
// yet, so it needs a "coming soon" state, not simple hide.
const LINK_META = [
  { key: "whatsapp", label: "WhatsApp", icon: WhatsAppIcon },
  { key: "email", label: "Email", icon: GmailIcon },
  { key: "github", label: "GitHub", icon: Code },
  { key: "instagram", label: "Instagram", icon: InstagramIcon },
  { key: "snapchat", label: "Snapchat", icon: SnapchatIcon },
  { key: "linkedin", label: "LinkedIn", icon: LinkedInIcon },
  { key: "reddit", label: "Reddit", icon: RedditIcon },
] as const;

// Shared by every button below — height, radius, padding, and colors
// stay identical for the social grid AND Portfolio. `w-full` (not a
// fixed px width) so each button fills its grid cell exactly — sizing
// itself to whatever 3 equal columns works out to at the current
// viewport width, instead of a fixed width that either wraps to a new
// row or leaves dead space depending on how wide the container is.
const LINK_BUTTON_BASE =
  "flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap overflow-hidden rounded-md border border-border bg-card px-2 text-xs text-foreground transition-colors hover:border-primary active:border-primary hover:text-primary active:text-primary sm:h-10 sm:gap-2 sm:px-3 sm:text-sm";

const LINK_BUTTON_CLASS = LINK_BUTTON_BASE;

// Portfolio sits on its own row, centered, at ~2/3 width — capped so
// it doesn't balloon on wide screens — rather than joining the social
// grid, since as the one button with a "(soon)" qualifier it reads
// better as a deliberately wider, standalone row.
const PORTFOLIO_BUTTON_CLASS = cn(LINK_BUTTON_BASE, "mx-auto w-2/3 max-w-[260px]");

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

        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4 text-center sm:flex-row sm:p-5 sm:text-left">
          {OWNER.photoUrl ? (
            <OwnerPhoto
              src={OWNER.photoUrl}
              fullSrc={OWNER.photoFullUrl || OWNER.photoUrl}
              alt={OWNER.name}
            />
          ) : (
            <div className="flex h-[123px] w-[123px] shrink-0 items-center justify-center rounded-full border-2 border-border bg-primary/10 text-3xl font-medium text-primary">
              {OWNER.name.charAt(0)}
            </div>
          )}

          <div className="flex flex-col gap-0.5">
            <p className="text-lg font-medium text-foreground">{OWNER.name}</p>
            <p className="text-xs text-subtle-foreground">({OWNER.batch})</p>
            <p className="text-sm text-muted-foreground">{OWNER.role}</p>
          </div>
        </div>
      </div>

      {/* A real CSS grid, not flex-wrap — flex-wrap reflows to however
          many columns fit once the container gets wide enough, which is
          exactly the "arrangement changed" bug this fixes. grid-cols-2
          (mobile/tablet) and lg:grid-cols-3 (desktop, 1024px+) pin an
          exact column count at each tier; each button is w-full so it
          sizes itself to whatever that column works out to, rather than
          wrapping to a new row or leaving dead space. Only Portfolio
          sits outside this grid, on its own centered row below. */}
      <div className="flex flex-col gap-2 pb-14">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {activeLinks.map((link) => (
            <a
              key={link.key}
              href={OWNER.links[link.key]}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_BUTTON_CLASS}
            >
              <link.icon className="h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px]" />
              {link.label}
            </a>
          ))}
        </div>

        {hasPortfolio ? (
          <a
            href={OWNER.links.portfolio}
            target="_blank"
            rel="noopener noreferrer"
            className={PORTFOLIO_BUTTON_CLASS}
          >
            <Briefcase className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            Portfolio
          </a>
        ) : (
          <span aria-disabled="true" className={cn(PORTFOLIO_BUTTON_CLASS, "border-dashed text-subtle-foreground opacity-70")}>
            <Briefcase className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            Portfolio
            <span className="font-mono text-xs">(soon)</span>
          </span>
        )}
      </div>
    </div>
  );
}
