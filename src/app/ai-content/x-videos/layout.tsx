import type { Metadata } from "next";

// The X Videos desk's browser tab title; the page itself is a client component, so the title lives here
export const metadata: Metadata = {
  title: "socia/X - Clip Draft",
};

export default function XVideosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
