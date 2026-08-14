import { Briefcase } from "lucide-react";
import { OWNER } from "@/config/ownership";
import { OwnerPhoto } from "./OwnerPhoto";
import { WhatsAppIcon, GmailIcon, InstagramIcon, LinkedInIcon } from "@/components/shared/BrandIcons";
import { cn } from "@/lib/utils";

// Exactly 4 social links + Portfolio — see this file's own final-layout
// comment below for why that's a 2x2 grid plus one more cell, not 3
// columns. Each brand icon carries its own color baked in (not
// currentColor-driven), so no color class is needed here.
const LINK_META = [
  { key: "whatsapp", label: "WhatsApp", icon: WhatsAppIcon },
  { key: "email", label: "Email", icon: GmailIcon },
  { key: "instagram", label: "Instagram", icon: InstagramIcon },
  { key: "linkedin", label: "LinkedIn", icon: LinkedInIcon },
] as const;

// Shared by every button, Portfolio included — identical height,
// radius, padding, gap, and text size everywhere, so Portfolio reads
// as a normal button in the set (just dashed/disabled), not a
// special-cased one. Slightly larger than before (h-12/h-14, text-sm/
// text-base) since dropping Snapchat/Reddit left the page feeling
// empty at the old sizing. `w-full` fills whatever a 2-column grid
// cell works out to — same fixed 2 columns at every breakpoint (see
// the grid below), so this never needs a responsive column-count
// override.
const LINK_BUTTON_BASE =
  "flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap overflow-hidden rounded-md border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-primary active:border-primary hover:text-primary active:text-primary sm:h-14 sm:gap-2.5 sm:px-4 sm:text-base";

const LINK_BUTTON_CLASS = LINK_BUTTON_BASE;

// Portfolio sits in its own full-width grid row (see the grid's own
// comment below) so it can be centered under BOTH columns, but the
// button itself must stay exactly one column wide — not stretch to
// fill that whole row. calc() derives that width directly from the
// grid's own gap (gap-2 → sm:gap-3), so "one column" here can never
// drift out of sync with the real grid, at any viewport width,
// without needing JS measurement or a fixed pixel guess.
const PORTFOLIO_BUTTON_CLASS = cn(
  LINK_BUTTON_BASE,
  "w-[calc((100%-0.5rem)/2)] sm:w-[calc((100%-0.75rem)/2)]"
);

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
          exactly the "arrangement changed" bug this fixes. Fixed at
          grid-cols-2 on EVERY breakpoint (no lg: override) — desktop,
          tablet, and mobile all get the same 2-column layout; a cell's
          width just scales proportionally with the container instead
          of the column count changing. Portfolio sits in its own
          col-span-2 row so it can be CENTERED under the full grid
          width — not left-aligned under column 1 (auto-placement's
          default) and not stretched to fill the row (col-span-2 is
          only on the wrapper; the button itself is pinned to exactly
          one column's width, see PORTFOLIO_BUTTON_CLASS). */}
      <div className="grid grid-cols-2 gap-2 pb-14 sm:gap-3">
        {activeLinks.map((link) => (
          <a
            key={link.key}
            href={OWNER.links[link.key]}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_BUTTON_CLASS}
          >
            <link.icon className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
            {link.label}
          </a>
        ))}

        <div className="col-span-2 flex justify-center">
          {hasPortfolio ? (
            <a
              href={OWNER.links.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              className={PORTFOLIO_BUTTON_CLASS}
            >
              <Briefcase className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
              Portfolio
            </a>
          ) : (
            <span aria-disabled="true" className={cn(PORTFOLIO_BUTTON_CLASS, "border-dashed text-subtle-foreground opacity-70")}>
              <Briefcase className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
              Portfolio
              <span className="font-mono text-xs">(soon)</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
