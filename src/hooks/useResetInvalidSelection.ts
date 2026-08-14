"use client";

import { useEffect } from "react";

/**
 * Resets `value` to `fallback` once `validValues` has loaded and no
 * longer contains it. For filter state whose validity depends on a
 * selection that can change from OUTSIDE the component that owns it
 * (e.g. Branch/Year, set globally via the sidebar switchers) — where
 * there's no local onChange to extend with an explicit reset. Skips
 * while validValues is still loading (undefined). Callers must include
 * any always-valid sentinels (e.g. an "all" option) in `validValues`.
 *
 * Where the parent selector's onChange lives in the same component
 * (Manage's Branch/Year/Type filters, CRUploadForm's branch picker),
 * an explicit reset call in that onChange is preferred over this hook
 * — it matches this codebase's existing convention and avoids an
 * extra render/effect cycle.
 */
export function useResetInvalidSelection<T>(
  value: T,
  validValues: T[] | undefined,
  fallback: T,
  setValue: (value: T) => void
) {
  useEffect(() => {
    if (validValues === undefined) return;
    if (!validValues.includes(value)) setValue(fallback);
  }, [value, validValues, fallback, setValue]);
}
