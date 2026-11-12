import type { Metadata } from "next";

// Post Studio → Templates' browser tab title; the page itself is a client component, so the title lives here
export const metadata: Metadata = {
  title: "socia - Templates",
};

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
