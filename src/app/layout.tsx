import type { Metadata } from "next";
import "./globals.css";
import { notoDevanagari, roboto, robotoMono } from "@/constants/fonts";
import ReduxProvider from "@/providers/ReduxProvider";
import MuiProvider from "@/providers/MuiProvider";
import { NewsroomProvider } from "@/providers/NewsroomProvider";
import { SociaSessionProvider } from "@/providers/SociaSessionProvider";
import AgentAssistant from "@/components/Chat/Chatbot";

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
    <html lang="en" suppressHydrationWarning className={`${roboto.variable} ${robotoMono.variable} ${notoDevanagari.variable}`}>
      <body>
        <ReduxProvider>
          <MuiProvider>
            <SociaSessionProvider>
              <NewsroomProvider>
                {children}
              </NewsroomProvider>
              {/* Inside the session so it can greet the signed-in person by name */}
              <AgentAssistant />
            </SociaSessionProvider>
          </MuiProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
