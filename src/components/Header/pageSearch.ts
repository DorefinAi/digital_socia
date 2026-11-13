// The desk's own pages for the header search, matched on the client in Hindi or English.

// Relative, not "@/", so plain node can load this file for npm test
import { REJECTED_NEWS_LABEL, REJECTED_NEWS_PATH, REJECTED_NEWS_PERMISSION } from "../../lib/rejectedNews";

export type PageId = "rejected" | "dashboard" | "post-studio" | "web-scraper" | "profile" | "access";

export interface SearchPage {
  id: PageId;
  label: string;
  path: string;
  /** Hindi names, Roman spellings and the words an editor might type for this page */
  keywords: string[];
  /** Whether the signed-in user may open it (the same checks as the left navigation) */
  allowed: (p: { can: (key: string) => boolean; canAny: (keys: string[]) => boolean }) => boolean;
}

const POST_STUDIO_PAGES = ["page.post_studio.x", "page.post_studio.instagram", "page.post_studio.facebook", "page.post_studio.youtube"];

export const SEARCH_PAGES: SearchPage[] = [
  {
    id: "dashboard",
    label: "Digital Dashboard",
    path: "/digital",
    keywords: ["डिजिटल डैशबोर्ड", "डैशबोर्ड", "रिपोर्ट", "digital", "dashboard", "analytics", "report", "stats"],
    allowed: ({ can }) => can("page.dashboard"),
  },
  {
    id: "post-studio",
    label: "Post Studio",
    path: "/ai-content",
    keywords: ["पोस्ट स्टूडियो", "पोस्ट", "post", "studio", "x", "twitter", "instagram", "facebook", "youtube"],
    allowed: ({ canAny }) => canAny(POST_STUDIO_PAGES),
  },
  {
    id: "web-scraper",
    label: "Web Scraper",
    path: "/web-scraper",
    keywords: ["ट्रेंड", "ट्रेंडिंग", "वेब स्क्रैपर", "trends", "trending", "scraper"],
    allowed: ({ can }) => can("page.web_scraper"),
  },
  {
    id: "rejected",
    label: REJECTED_NEWS_LABEL,
    path: REJECTED_NEWS_PATH,
    keywords: ["अस्वीकृत खबरें", "अस्वीकृत", "रिजेक्ट", "rejected", "rejected news", "asvikrit"],
    allowed: ({ can }) => can(REJECTED_NEWS_PERMISSION),
  },
  {
    id: "profile",
    label: "Your profile",
    path: "/profile",
    keywords: ["प्रोफ़ाइल", "मेरी प्रोफ़ाइल", "profile", "account", "password", "card background"],
    allowed: () => true,
  },
  {
    id: "access",
    label: "Access",
    path: "/settings/access",
    keywords: ["एक्सेस", "यूज़र", "रोल", "access", "users", "roles", "permissions", "settings"],
    allowed: ({ can, canAny }) => can("page.settings") && canAny(["roles.manage", "users.manage"]),
  },
];

const NUKTA = /़/g;

/**
 * Lower case, NFC, single spaces, and without the nukta, so प्रोफाइल finds प्रोफ़ाइल whichever way
 * the editor's keyboard writes फ़.
 */
export function normaliseSearchText(text: string): string {
  return text.normalize("NFC").replace(NUKTA, "").toLocaleLowerCase("en-IN").replace(/\s+/g, " ").trim();
}

/**
 * The pages that match `query`, best first: a name that starts with the query, then one that contains
 * it, then pages where every word of the query is found somewhere in the names. An empty query lists them all.
 */
export function searchPages<T extends Pick<SearchPage, "label" | "keywords">>(pages: T[], query: string): T[] {
  const q = normaliseSearchText(query);
  if (!q) return pages;
  const words = q.split(" ");
  const ranked: { page: T; rank: number; at: number }[] = [];
  pages.forEach((page, at) => {
    const names = [page.label, ...page.keywords].map(normaliseSearchText);
    let rank = 0;
    if (names.some((n) => n.startsWith(q) || n.split(" ").some((w) => w.startsWith(q)))) rank = 3;
    else if (names.some((n) => n.includes(q))) rank = 2;
    else if (words.every((w) => names.some((n) => n.includes(w)))) rank = 1;
    if (rank) ranked.push({ page, rank, at });
  });
  return ranked.sort((a, b) => b.rank - a.rank || a.at - b.at).map((r) => r.page);
}
