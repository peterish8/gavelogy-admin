"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  // Thin wrapper that centralizes app theme configuration around next-themes.
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
