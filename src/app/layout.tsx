import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Devanagari, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import ReduxProvider from "@/providers/ReduxProvider";
import MuiProvider from "@/providers/MuiProvider";
import { NewsroomProvider } from "@/providers/NewsroomProvider";

// One type family across Latin, Hindi and file paths
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });
const devanagari = IBM_Plex_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600", "700"], variable: "--font-deva", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "VARTAMAN AI - Intelligent News Management",
  description: "AI-powered dashboard for editorial approval, digital analytics, and content review.",
  keywords: "vartaman, AI, editorial, news management, content review, digital analytics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${devanagari.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <ReduxProvider>
          <MuiProvider>
            <NewsroomProvider>
              {children}
            </NewsroomProvider>
          </MuiProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
