import type { Metadata } from "next";
import "./globals.css";

/* eslint-disable @next/next/no-page-custom-font -- App Router loads the shared brand fonts from the root layout. */

export const metadata: Metadata = {
  title: "Vibekit — Build for your Solana community",
  description: "Describe, design and publish a real website for your Solana token community.",
  icons: { icon: "/vibecoder-logo.png", shortcut: "/vibecoder-logo.png", apple: "/vibecoder-logo.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500;6..72,600&display=swap" rel="stylesheet" />
  </head><body>{children}</body></html>;
}
