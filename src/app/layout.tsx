import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/auth/AuthProvider";
import ParticipanteProvider from "@/components/auth/ParticipanteProvider";
import AppShell from "@/components/shared/AppShell";
import ThemeInitializer from "@/components/shared/ThemeInitializer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BlockChain — Micro-Lending Platform",
  description: "Plataforma de micro-créditos comunitaria en Celo Alfajores",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://block-chain.vercel.app';

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* ── JSON-LD Structured Data ── */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'BlockChain',
              description: 'Plataforma de micro-créditos comunitaria en Celo Alfajores',
              url: siteUrl,
            }),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Skip link — visible on keyboard focus, lets users skip navigation */}
        <a
          href="#main-content"
          className="absolute -top-10 left-4 z-[100] rounded-b-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition-all focus:top-0 focus:outline-none focus:ring-2 focus:ring-white/50"
        >
          Saltar al contenido principal
        </a>

        <ThemeInitializer />
        <AuthProvider>
          <ParticipanteProvider>
            <AppShell>{children}</AppShell>
          </ParticipanteProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
