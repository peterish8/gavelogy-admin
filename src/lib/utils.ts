import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Merges Tailwind class names, resolving conflicts via tailwind-merge and handling conditionals via clsx.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
