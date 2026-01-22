import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google"; // Switched to Inter as requested
import "./globals.css";

const inter = Inter({
  variable: "--font-inter", // Specific name to avoid collision with theme key
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gavelogy Admin",
  description: "Gavelogy Admin Panel - Manage case notes, quizzes, and more",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased font-sans`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
