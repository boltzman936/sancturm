"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Copy, HeartHandshake } from "lucide-react";
import { useSupportConfig } from "@/features/support/queries";
import { createContribution } from "@/features/support/actions";
import { cn } from "@/lib/utils";

const MAX_CUSTOM_AMOUNT = 100_000;

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="flex items-center gap-1.5 rounded-md border border-border bg-background-secondary px-3 py-2 text-sm text-foreground transition-colors hover:border-primary active:border-primary"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * The two states a real payment-provider redirect would land a
 * visitor in — reachable today only via a manually-typed
 * ?status=successful|failed|cancelled&contribution=<id> URL, since no
 * provider is wired up to redirect here yet. Built now (not stubbed)
 * so wiring a real gateway later is "point its redirect URL here",
 * not "build these screens".
 */
function RedirectOutcome({ status }: { status: "successful" | "failed" | "cancelled" }) {
  const copy = {
    successful: {
      title: "Thank you!",
      body: "Your contribution has been received. It genuinely helps keep Sancturm running.",
    },
    failed: {
      title: "Payment didn't go through",
      body: "Nothing was charged. You can try again below.",
    },
    cancelled: {
      title: "Payment cancelled",
      body: "No charge was made.",
    },
  }[status];

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-6 text-center">
      <h2 className="text-lg font-medium text-foreground">{copy.title}</h2>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
    </div>
  );
}

function DisabledState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center">
      <HeartHandshake className="h-8 w-8 text-subtle-foreground" />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-medium text-foreground">Support Sancturm</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      <span className="rounded-full border border-border bg-background-secondary px-3 py-1 font-mono text-xs text-subtle-foreground">
        Not needed yet
      </span>
    </div>
  );
}

function EnabledFlow({
  upiId,
  qrUrl,
  suggestedAmounts,
  paymentInstructions,
}: {
  upiId: string;
  qrUrl: string | null;
  suggestedAmounts: number[];
  paymentInstructions: string;
}) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(suggestedAmounts[0] ?? null);
  const [customAmount, setCustomAmount] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [utr, setUtr] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const effectiveAmount = customAmount.trim() ? Number(customAmount) : selectedAmount;
  const amountValid =
    typeof effectiveAmount === "number" &&
    Number.isInteger(effectiveAmount) &&
    effectiveAmount > 0 &&
    effectiveAmount <= MAX_CUSTOM_AMOUNT;

  function handleSubmit() {
    if (!amountValid || !effectiveAmount) return;
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createContribution({
          amount: effectiveAmount,
          isAnonymous,
          displayName: isAnonymous ? null : displayName,
          utr: utr.trim() || null,
        });
        setSubmittedId(id);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Couldn't record your contribution. Try again.");
      }
    });
  }

  if (submittedId) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-primary/40 bg-card p-6 text-center">
        <h2 className="text-lg font-medium text-foreground">Thanks for reaching out!</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          We&apos;ve noted your contribution and will verify it shortly. No need to do anything else.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
      <div className="text-center">
        <h1 className="text-xl font-medium text-foreground">Support Sancturm</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every contribution goes straight toward storage and hosting costs.
        </p>
      </div>

      {qrUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- admin-set external URL, not a build-time-known asset next/image can optimize.
        <img
          src={qrUrl}
          alt="UPI payment QR code"
          className="mx-auto h-48 w-48 rounded-lg border border-border bg-white p-2 object-contain"
        />
      )}

      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background-secondary px-3 py-2">
        <span className="truncate font-mono text-sm text-foreground">{upiId}</span>
        <CopyButton value={upiId} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">amount</span>
        <div className="flex flex-wrap gap-2">
          {suggestedAmounts.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => {
                setSelectedAmount(amount);
                setCustomAmount("");
              }}
              className={cn(
                "rounded-md border px-4 py-2 text-sm transition-colors",
                !customAmount && selectedAmount === amount
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border text-foreground hover:border-primary active:border-primary"
              )}
            >
              ₹{amount}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={1}
          max={MAX_CUSTOM_AMOUNT}
          value={customAmount}
          onChange={(event) => setCustomAmount(event.target.value)}
          placeholder="Custom amount (₹)"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {paymentInstructions && (
        <p className="whitespace-pre-wrap rounded-md border border-border bg-background-secondary p-3 text-xs text-muted-foreground">
          {paymentInstructions}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={!isAnonymous}
            onChange={(event) => setIsAnonymous(!event.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Show my name to the admin (optional)
        </label>
        {!isAnonymous && (
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your name"
            maxLength={80}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
        <input
          value={utr}
          onChange={(event) => setUtr(event.target.value)}
          placeholder="UPI transaction reference / UTR (optional, speeds up verification)"
          maxLength={40}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!amountValid || isPending}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? "Recording…" : "I've sent the payment"}
      </button>
      {error && <p className="text-center font-mono text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function SupportSancturmPanel() {
  const { data: config, isLoading, isError } = useSupportConfig();
  const searchParams = useSearchParams();
  const redirectStatus = searchParams.get("status");

  if (redirectStatus === "successful" || redirectStatus === "failed" || redirectStatus === "cancelled") {
    return <RedirectOutcome status={redirectStatus} />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-8">
        <div className="h-8 w-8 animate-shimmer rounded-full bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_25%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_75%)] bg-[length:200%_100%]" />
        <div className="h-4 w-40 animate-shimmer rounded bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_25%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_75%)] bg-[length:200%_100%]" />
      </div>
    );
  }

  if (isError || !config) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-card p-8 text-center text-destructive">
        Couldn&apos;t load this page. Try refreshing.
      </div>
    );
  }

  if (!config.enabled || !config.upi_id) {
    return <DisabledState message={config.support_message} />;
  }

  return (
    <EnabledFlow
      upiId={config.upi_id}
      qrUrl={config.qr_url}
      suggestedAmounts={config.suggested_amounts}
      paymentInstructions={config.payment_instructions}
    />
  );
}
