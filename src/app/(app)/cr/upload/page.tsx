import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { CRUploadForm } from "@/features/resources/components/CRUploadForm";

export default async function CRUploadPage() {
  // branches/terms don't depend on role at all (same reference data
  // for everyone), so there's no reason to wait for role resolution
  // before starting them — that was one full sequential round trip
  // paid for nothing every time this page loaded.
  const supabase = await createClient();
  const [role, { data: branches }, { data: terms }] = await Promise.all([
    getCurrentRole(),
    // Always fetched now, not just for admin — a CR also needs the
    // full branch list when uploading a PYQ (any CR can publish a PYQ
    // to any branch; only notes_lab stays locked to their own). Terms
    // fetched the same way — admin picks freely, a CR's is locked to
    // their own.
    supabase.from("branches").select("id, name").order("sort_order"),
    supabase.from("academic_terms").select("id, label").order("sort_order"),
  ]);

  if (!role) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-muted-foreground">
        Your account isn&apos;t linked to a CR or admin profile yet. Ask the
        person who manages Sancturm to add one.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Upload</h1>
      </div>

      <CRUploadForm
        branches={branches ?? []}
        terms={terms ?? []}
        fixedBranchId={role.type === "cr" ? role.branchId : undefined}
        fixedTermId={role.type === "cr" ? role.termId : undefined}
        isAdmin={role.type === "admin"}
      />
    </div>
  );
}
