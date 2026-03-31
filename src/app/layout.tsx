import type { Metadata } from "next";
import { Inter, Geist_Mono, Lora, Playfair_Display, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Body serif — warm readable serif for note body text
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
});

// Title serif — high-contrast elegant serif for headings/case titles
const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

// Monospace — for citations, metadata, code
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Gavelogy Admin",
  description: "Gavelogy Admin Panel - Manage case notes, quizzes, and more",
  icons: {
    icon: "/favicon.png",
  },
};

// Root app layout that loads the global fonts, theme provider, and shared document shell.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
<body
        suppressHydrationWarning
        className={`${inter.variable} ${geistMono.variable} ${lora.variable} ${playfairDisplay.variable} ${ibmPlexMono.variable} antialiased font-sans`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
