"use client";

import { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { deleteNotice } from "@/features/notices/actions";

export function DeleteNoticeButton({ noticeId }: { noticeId: string }) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Remove this notice?")) return;
        startTransition(async () => {
          await deleteNotice(noticeId);
          // Same reasoning as NoticeComposer — revalidatePath only
          // refreshes server-rendered pages, not the client-side
          // TanStack Query cache /notices reads from.
          queryClient.invalidateQueries({ queryKey: ["notices"] });
        });
      }}
      className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
    >
      {isPending ? "Removing…" : "Remove"}
    </button>
  );
}
