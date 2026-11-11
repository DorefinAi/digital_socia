import type { Metadata } from "next";

// The X desk's browser tab title; the page itself is a client component, so the title lives here
export const metadata: Metadata = {
  title: "socia/X - Post Draft",
};

export default function XDeskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
