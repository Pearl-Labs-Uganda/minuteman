import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minuteman — Study Partner | Pearl Labs",
  description:
    "Minuteman turns your lectures and recordings into study material — transcribe locally with Whisper, then chat, review, and learn. Built at Pearl Labs.",
  keywords: [
    "study partner",
    "lecture transcription",
    "speech to text",
    "Whisper AI",
    "local transcription",
    "KAIST",
  ],
  robots: "index, follow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/*
          Fonts load at runtime from the Google Fonts CDN (as in the original
          app), with a system-ui fallback. This avoids a build-time network
          fetch and degrades gracefully offline. The font-family CSS variables
          are defined in globals.css and referenced by the Tailwind theme.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Manrope:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-pl-bg text-pl-text font-body h-screen flex flex-col overflow-hidden">
        {children}
      </body>
    </html>
  );
}
