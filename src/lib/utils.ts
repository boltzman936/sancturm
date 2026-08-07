import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind classes safely, resolving conflicts (e.g. "p-2 p-4" -> "p-4").
 * Every shadcn/ui component uses this — you'll see `className={cn(...)}` everywhere.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
