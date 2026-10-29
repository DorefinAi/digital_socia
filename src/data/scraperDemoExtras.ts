// Demo-mode extras for the Web Scraper (contract: handoff/scraper-analytics-contract.md, section A):
// a district per demo topic, same-story groups with their sources, and YouTube channel names.
// Live mode gets all of this from GET /trends.

import type { TrendClusterSource } from "@/lib/socia/trends";

/** District each demo topic is about (null: state-wide) */
export const DEMO_DISTRICT: Record<string, string | null> = {
  "sc-top-1": "Jaipur",
  "sc-top-2": "Kota",
  "sc-top-3": "Ajmer",
  "sc-top-4": "Bikaner",
  "sc-top-5": "Sawai Madhopur",
  "sc-top-6": "Jodhpur",
  "sc-top-7": "Barmer",
  "sc-top-8": "Udaipur",
  "sc-top-9": "Jhunjhunu",
  "sc-top-10": "Sri Ganganagar",
  "sc-top-11": "Alwar",
  "sc-top-12": "Chittorgarh",
  "sc-top-13": "Jaipur",
  "sc-top-14": "Sirohi",
  "sc-top-15": "Ajmer",
  "sc-top-16": "Jaisalmer",
  "sc-top-17": "Bhilwara",
  "sc-top-18": null,
  "sc-top-19": "Bharatpur",
  "sc-top-20": "Pali",
};

/** Channel names for the demo items that came from YouTube */
export const DEMO_CHANNEL = ["First India News", "Zee Rajasthan", "ETV Bharat Rajasthan", "Patrika TV", "News18 Rajasthan"];

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** Same-story groups: the demo topic, and every publisher that told it */
export function demoSources(id: string): TrendClusterSource[] {
  const base: Record<string, [string, string, number][]> = {
    "sc-top-1": [
      ["Dainik Bhaskar", "https://www.bhaskar.com/local/rajasthan/jaipur/", 40],
      ["Times of India Jaipur", "https://timesofindia.indiatimes.com/city/jaipur", 55],
      ["Rajasthan Patrika", "https://www.patrika.com/jaipur-news/", 70],
      ["First India News", "https://www.youtube.com/@FirstIndiaNews", 95],
    ],
    "sc-top-2": [
      ["Amar Ujala", "https://www.amarujala.com/rajasthan", 65],
      ["Dainik Bhaskar", "https://www.bhaskar.com/local/rajasthan/kota/", 80],
    ],
    "sc-top-5": [
      ["Indian Express Jaipur", "https://indianexpress.com/section/cities/jaipur/", 120],
      ["Hindustan Times Jaipur", "https://www.hindustantimes.com/cities/jaipur-news", 150],
      ["Zee Rajasthan", "https://zeenews.india.com/hindi/india/rajasthan", 170],
    ],
    "sc-top-10": [
      ["Dainik Navjyoti", "https://www.dainiknavjyoti.com/", 200],
      ["Rajasthan Patrika", "https://www.patrika.com/sri-ganganagar-news/", 230],
    ],
    "sc-top-15": [
      ["ETV Bharat Rajasthan", "https://www.etvbharat.com/hindi/rajasthan", 90],
      ["Amar Ujala", "https://www.amarujala.com/rajasthan/ajmer", 110],
      ["Dainik Bhaskar", "https://www.bhaskar.com/local/rajasthan/ajmer/", 140],
      ["NDTV India", "https://ndtv.in/", 180],
      ["Google News (hi)", "https://news.google.com/", 200],
    ],
  };
  return (base[id] ?? []).map(([name, url, m]) => ({ name, url, publishedAt: minsAgo(m) }));
}

/** Keywords the demo user watches before changing anything */
export const DEMO_WATCH_KEYWORDS = ["Jaipur", "बाघ", "Tiger"];
