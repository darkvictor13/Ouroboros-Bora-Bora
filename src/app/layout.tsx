import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";

import { SidebarProvider } from "../context/SidebarContext";
import { DataProvider } from "../context/DataContext";
import { ThemeProvider } from "../context/ThemeContext";
import { NotificationProvider } from "../context/NotificationContext";
import Sidebar from "../components/Sidebar";
import MainContentWrapper from "../components/MainContentWrapper";
import ClientLayoutWrapper from "@/components/ClientLayoutWrapper";
import { Providers } from "./providers";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bora Estudar Concursos",
  description: "Plataforma de estudos para concursos: planejamento, revisões e estatísticas.",
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-64.png', sizes: '64x64', type: 'image/png' },
      { url: '/favicon-128.png', sizes: '128x128', type: 'image/png' },
    ],
    apple: '/favicon-256.png',
  },
  openGraph: {
    title: "Bora Estudar Concursos",
    description: "Plataforma de estudos para concursos: planejamento, revisões e estatísticas.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1A56DB" },
    { media: "(prefers-color-scheme: dark)", color: "#080D16" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${dmSans.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <body
        className="font-sans antialiased"
      >
        <Providers>
          <SidebarProvider>
            <NotificationProvider>
              <ThemeProvider>
                <DataProvider>
                  <Sidebar />
                  <MainContentWrapper>
                    <ClientLayoutWrapper>{children}</ClientLayoutWrapper>
                  </MainContentWrapper>
                </DataProvider>
              </ThemeProvider>
            </NotificationProvider>
          </SidebarProvider>
        </Providers>
      </body>
    </html>
  );
}
