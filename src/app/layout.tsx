import type { Metadata } from "next";
import "./globals.css";
import ReduxProvider from "@/providers/ReduxProvider";
import MuiProvider from "@/providers/MuiProvider";
import { NewsroomProvider } from "@/providers/NewsroomProvider";
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
    <html lang="en" suppressHydrationWarning>
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
