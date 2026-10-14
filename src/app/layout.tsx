import type { Metadata } from "next";
import "./globals.css";
import ReduxProvider from "@/providers/ReduxProvider";
import MuiProvider from "@/providers/MuiProvider";
import { NewsroomProvider } from "@/providers/NewsroomProvider";
export const metadata: Metadata = {
  title: "Socia - Digital Automation Platform",
  description: "Socia automates social publishing for 1st India News: FTP intake, branded cards and clips, approval and posting to X and Instagram, and analytics.",
  keywords: "socia, 1st india news, social publishing, digital desk, analytics",
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
