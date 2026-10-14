import {
  Story,
  AIContent,
  Reporter,
  PlatformEngagement,
  ActivityItem,
  Notification,
  StoryCategory,
  StoryPriority,
  StoryStatus,
  Platform,
  AIContentStatus,
  FtpNewsItem,
  SocialPost,
  SocialDraft,
  HashtagRule,
  HandleEntry,
} from "@/types/newsroom";
import { generateDraftSeed, generateFtpNews, generateHandleDirectory, generateHashtagRules, generatePostedSeed } from "@/data/ftpNewsData";

// ─── Rajasthan Regional Reporters ──────────────────────────────────────────────
export const DEMO_REPORTERS: Reporter[] = [
  { id: "r1", name: "Vikram Singh Rathore", avatar: "", email: "vikram.rathore@vartaman.ai", beat: "Politics" },
  { id: "r2", name: "Ananya Purohit", avatar: "", email: "ananya.purohit@vartaman.ai", beat: "Heritage & Tourism" },
  { id: "r3", name: "Deepak Bishnoi", avatar: "", email: "deepak.bishnoi@vartaman.ai", beat: "Environment & Wildlife" },
  { id: "r4", name: "Pooja Choudhary", avatar: "", email: "pooja.choudhary@vartaman.ai", beat: "Education & Youth" },
  { id: "r5", name: "Manish Shekhawat", avatar: "", email: "manish.shekhawat@vartaman.ai", beat: "Business & Trade" },
];

// ─── Categories & Helpers ──────────────────────────────────────────────────────
const CATEGORIES: StoryCategory[] = [
  "Politics", "Sports", "Business", "Technology", "Entertainment", "Health", "International",
];
const PRIORITIES: StoryPriority[] = ["low", "medium", "high", "urgent"];
const STATUSES: StoryStatus[] = [
  "draft", "assigned", "pending_review", "pending_approval", "approved", "rejected", "published",
];
const PLATFORMS: Platform[] = ["YouTube", "Instagram", "X (Twitter)", "Facebook", "LinkedIn"];

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// ─── Rajasthan Realistic Stories ────────────────────────────────────────────────
const STORY_TITLES: string[] = [
  "Jaipur Metro Phase 2 Extension Approved: Connecting Sanganer to Sitapura",
  "NEET Aspirants Protest in Kota: Demanding Revamped Exam Guidelines",
  "Indira Gandhi Canal Water Release Increased for Ganganagar & Hanumangarh Farmers",
  "Jodhpur Umaid Bhawan & Mehrangarh Fort Record Peak Festival Footfall",
  "Pushkar Camel Fair 2026 Dates Announced: Over 2 Lakh Visitors Expected",
  "Bikaner Solar Park Reaches 3,000 MW Capacity Milestone in Thar Desert",
  "Ranthambore & Sariska Census Reports Rise in Bengal Tiger Population",
  "Udaipur Lake Rejuvenation Project Enters Final Phase Ahead of Monsoons",
  "Rajasthan Government Unveils New Heritage Tourism & Haveli Policy",
  "Chittorgarh Fort Restoration Initiative Launched by Archaeological Survey",
  "Shekhawati Haveli Restoration Boosts Local Handicraft & Textile Hubs",
  "Barmer Refinery Expansion Project Begins Pipeline Installation",
  "Jaipur Literature Festival Preview Highlights Regional Marwari Authors",
  "Alwar EV Industrial Hub Attracts ₹5,000 Cr Investment",
  "Mount Abu Winter Festival Prepares for Record Tourist Inflow",
];

const STORY_BODIES: string[] = [
  "In a significant policy update directly impacting millions of residents across Rajasthan, key administrators have finalized execution plans. On-ground coverage from Jaipur and regional hubs confirms that field teams are coordinating with local authorities to ensure swift implementation. Community leaders have welcomed the announcement, emphasizing its potential to drive regional economic growth, improve infrastructure, and create sustainable employment opportunities across Marwar, Mewar, and Shekhawati regions.",
  "Ground reports from Kota and Jaipur reveal high interest among students, local traders, and civic groups following recent administrative announcements. Independent observers note that the initiative marks a strategic shift in addressing long-standing regional priorities. Regional delegates have voiced support while requesting transparent timelines for execution.",
  "Experts monitoring Western Rajasthan's agricultural and industrial infrastructure report steady progress on key infrastructure projects. The convergence of renewable energy initiatives, heritage conservation efforts, and urban transit expansion is positioning Rajasthan as a leading hub for sustainable development. Regional administrative bodies are scheduled to review milestone reports later this week.",
];

const AI_HEADLINES: string[] = [
  "Breaking: Rajasthan Cabinet Finalizes Major Infrastructure Project",
  "Ground Report: Key Updates from Jaipur, Jodhpur & Kota",
  "Analysis: How Rajasthan's New Heritage Policy Boosts Local Tourism",
  "Special Feature: Thar Desert Green Energy Milestone Achieved",
  "Update: Regional Authorities Respond to Citizen Demands",
];

const AI_SUMMARIES: string[] = [
  "This story highlights major regional developments across Rajasthan with direct social and economic impact. Field reporters from Jaipur, Jodhpur, and Kota provide comprehensive insights into administrative actions and local reactions.",
  "An in-depth look at infrastructure, tourism, and education initiatives shaping Rajasthan's growth. The report incorporates verified local data and expert opinions from regional stakeholders.",
  "A detailed overview of environmental and economic milestones in Western and Central Rajasthan, highlighting green energy progress and heritage conservation efforts.",
];

function generateStories(): Story[] {
  return STORY_TITLES.map((title, i) => {
    const reporter = DEMO_REPORTERS[i % DEMO_REPORTERS.length];
    const daysAgo = randInt(0, 14);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const due = new Date(date);
    due.setDate(due.getDate() + randInt(1, 3));
    return {
      id: `story-${i + 1}`,
      title,
      reporter: reporter.name,
      category: CATEGORIES[i % CATEGORIES.length],
      priority: PRIORITIES[i % PRIORITIES.length],
      status: STATUSES[i % STATUSES.length],
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
      body: STORY_BODIES[i % STORY_BODIES.length],
      aiSummary: AI_SUMMARIES[i % AI_SUMMARIES.length],
      aiSuggestedHeadline: AI_HEADLINES[i % AI_HEADLINES.length],
      tags: ["rajasthan", reporter.beat.toLowerCase().split(" ")[0], CATEGORIES[i % CATEGORIES.length].toLowerCase()],
      assignedTo: reporter.name,
      dueDate: due.toISOString(),
    };
  });
}

// ─── AI Content With Relevant Topic-Mapped Photos ─────────────────────────────────
const TOPIC_POSTS = [
  {
    caption: "Jaipur Metro Phase 2 expansion approved! Connecting Sanganer to Sitapura for seamless daily commute. 🚆 #Jaipur #RajasthanDevelopment #MetroNews",
    imageUrl: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80",
    campaign: "Rajasthan Elections & Governance",
  },
  {
    caption: "NEET aspirants in Kota rally for transparent exam guidelines and student welfare reforms. Ground report from Coaching City. 📚 #KotaNEET #Education",
    imageUrl: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80",
    campaign: "Kota Student Voice & Education",
  },
  {
    caption: "Pushkar Camel Fair 2026 dates announced! Get ready for vibrant desert culture, folk music, and heritage cattle fair. 🐪✨ #PushkarFair #RajasthanTourism",
    imageUrl: "https://images.unsplash.com/photo-1609949279531-cf48d64bed89?auto=format&fit=crop&w=800&q=80",
    campaign: "Rajasthan Heritage & Tourism",
  },
  {
    caption: "Western Rajasthan leads India's solar wave! Bikaner Solar Park hits 3,000 MW capacity in Thar Desert. ☀️⚡ #CleanEnergy #RajasthanSolar",
    imageUrl: "https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=800&q=80",
    campaign: "Thar Desert Green Energy Drive",
  },
  {
    caption: "Ranthambore & Sariska Tiger Census reveals promising growth in tiger population! 🐅 Watch our wildlife special. #SaveTigers #WildRajasthan",
    imageUrl: "https://images.unsplash.com/photo-1561731216-c3a4d99437d5?auto=format&fit=crop&w=800&q=80",
    campaign: "Wildlife & Eco Special",
  },
  {
    caption: "Jodhpur's Sun City shines as Mehrangarh Fort opens new heritage gallery for tourists. 🏰 #Jodhpur #HeritageRajasthan",
    imageUrl: "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=800&q=80",
    campaign: "Rajasthan Heritage & Tourism",
  },
  {
    caption: "Barmer Refinery expansion project set to generate over 15,000 jobs in Marwar region! 🏭 #MarwarDevelopment #RajasthanJobs",
    imageUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80",
    campaign: "Marwar Industrial Watch",
  },
  {
    caption: "Udaipur's Lake Pichola & Fateh Sagar clean-up drive yields remarkable results ahead of monsoon. 🌊 #Udaipur #CleanLakes",
    imageUrl: "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=800&q=80",
    campaign: "Rajasthan Heritage & Tourism",
  },
  {
    caption: "New Rajasthan Heritage Policy offers incentives for restoring ancestral Havelis in Shekhawati. 🏛️ #Shekhawati #HeritageConservation",
    imageUrl: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=800&q=80",
    campaign: "Rajasthan Heritage & Tourism",
  },
  {
    caption: "Indira Gandhi Canal releases extra water quota to support farmers in Sri Ganganagar & Hanumangarh. 🌾 #RajasthanFarmers #CanalWater",
    imageUrl: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80",
    campaign: "Rajasthan Elections & Governance",
  },
];

const AI_CONTENT_STATUSES: AIContentStatus[] = ["pending", "approved", "rejected"];

function generateAIContent(): AIContent[] {
  return Array.from({ length: 20 }, (_, i) => {
    const topic = TOPIC_POSTS[i % TOPIC_POSTS.length];
    const daysAgo = randInt(0, 7);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return {
      id: `ai-${i + 1}`,
      caption: topic.caption,
      imageUrl: topic.imageUrl,
      platform: PLATFORMS[i % PLATFORMS.length],
      generatedAt: date.toISOString(),
      campaign: topic.campaign,
      confidenceScore: randInt(82, 99),
      status: AI_CONTENT_STATUSES[i % AI_CONTENT_STATUSES.length],
      storyId: `story-${(i % 15) + 1}`,
    };
  });
}

// ─── Engagement ────────────────────────────────────────────────────────────────
function generateEngagement(): PlatformEngagement[] {
  return [
    {
      platform: "YouTube",
      views: randInt(450000, 1200000),
      likes: randInt(25000, 85000),
      shares: randInt(8000, 32000),
      comments: randInt(4500, 19000),
      engagementRate: 6.8,
      growth: 18.4,
      icon: "YouTube",
      color: "#FF0000",
    },
    {
      platform: "Instagram",
      views: randInt(600000, 1800000),
      likes: randInt(45000, 140000),
      shares: randInt(12000, 48000),
      comments: randInt(8000, 29000),
      engagementRate: 8.2,
      growth: 24.1,
      icon: "Instagram",
      color: "#E4405F",
    },
    {
      platform: "X (Twitter)",
      views: randInt(800000, 2500000),
      likes: randInt(30000, 95000),
      shares: randInt(18000, 62000),
      comments: randInt(6000, 22000),
      engagementRate: 5.4,
      growth: 12.8,
      icon: "X",
      color: "#000000",
    },
    {
      platform: "Facebook",
      views: randInt(250000, 800000),
      likes: randInt(15000, 50000),
      shares: randInt(6000, 25000),
      comments: randInt(3000, 12000),
      engagementRate: 4.1,
      growth: 8.5,
      icon: "Facebook",
      color: "#1877F2",
    },
    {
      platform: "LinkedIn",
      views: randInt(120000, 450000),
      likes: randInt(8000, 28000),
      shares: randInt(3000, 14000),
      comments: randInt(1500, 7000),
      engagementRate: 5.9,
      growth: 15.2,
      icon: "LinkedIn",
      color: "#0A66C2",
    },
  ];
}

// ─── Activity Timeline ─────────────────────────────────────────────────────────
function generateActivity(): ActivityItem[] {
  return [
    { id: "a1", action: "approved", actor: "Vikram Singh Rathore", target: "Jaipur Metro Phase 2 Story", timestamp: new Date(Date.now() - 250000).toISOString(), details: "Approved for lead editorial release" },
    { id: "a2", action: "generated", actor: "AI System", target: "Instagram Reel for Kota NEET Protest", timestamp: new Date(Date.now() - 550000).toISOString() },
    { id: "a3", action: "edited", actor: "Ananya Purohit", target: "Pushkar Camel Fair 2026 special", timestamp: new Date(Date.now() - 850000).toISOString(), details: "Added visitor stats and cattle fair quotes" },
    { id: "a4", action: "approved", actor: "Digital Team", target: "YouTube thumbnail for Bikaner Solar Park video", timestamp: new Date(Date.now() - 1150000).toISOString() },
    { id: "a5", action: "assigned", actor: "Pooja Choudhary", target: "Kota Coaching Hub Guidelines story", timestamp: new Date(Date.now() - 1750000).toISOString(), details: "Assigned to Pooja Choudhary" },
    { id: "a6", action: "published", actor: "Deepak Bishnoi", target: "Ranthambore & Sariska Tiger Census", timestamp: new Date(Date.now() - 2350000).toISOString() },
  ];
}

// ─── Notifications ─────────────────────────────────────────────────────────────
function generateNotifications(): Notification[] {
  return [
    { id: "n1", type: "story_approved", message: "Jaipur Metro Phase 2 story approved for lead publication", timestamp: new Date(Date.now() - 250000).toISOString(), read: false },
    { id: "n2", type: "ai_caption_edited", message: "AI caption updated for Kota NEET Aspirants protest reel", timestamp: new Date(Date.now() - 550000).toISOString(), read: false },
    { id: "n3", type: "instagram_post_ready", message: "Instagram post ready: Pushkar Fair 2026 dates unveiled", timestamp: new Date(Date.now() - 850000).toISOString(), read: true },
    { id: "n4", type: "new_assignment", message: "New assignment: Barmer Refinery Pipeline project assigned to Manish Shekhawat", timestamp: new Date(Date.now() - 1750000).toISOString(), read: false },
    { id: "n5", type: "ai_content_approved", message: "YouTube script approved: Bikaner Solar Park 3000 MW Special", timestamp: new Date(Date.now() - 2350000).toISOString(), read: true },
  ];
}

// ─── Master Generator ──────────────────────────────────────────────────────────
export interface NewsroomData {
  stories: Story[];
  aiContent: AIContent[];
  engagement: PlatformEngagement[];
  activity: ActivityItem[];
  notifications: Notification[];
  reporters: Reporter[];
  ftpNews: FtpNewsItem[];
  socialPosts: SocialPost[];
  socialDrafts: SocialDraft[];
  hashtagRules: HashtagRule[];
  handleDirectory: HandleEntry[];
  ftpSyncedAt: string;
  version?: string;
}

const STORAGE_KEY = "newsroom_data";
const CURRENT_VERSION = "v7_socia_console";

export function generateAndStoreData(): NewsroomData {
  const data: NewsroomData = {
    stories: generateStories(),
    aiContent: generateAIContent(),
    engagement: generateEngagement(),
    activity: generateActivity(),
    notifications: generateNotifications(),
    reporters: DEMO_REPORTERS,
    ftpNews: generateFtpNews(),
    socialPosts: generatePostedSeed(),
    socialDrafts: generateDraftSeed(),
    hashtagRules: generateHashtagRules(),
    handleDirectory: generateHandleDirectory(),
    ftpSyncedAt: new Date().toISOString(),
    version: CURRENT_VERSION,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  return data;
}

export function loadData(): NewsroomData | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return generateAndStoreData();
  try {
    const parsed = JSON.parse(stored);
    // Force reload if data version is missing or old
    if (parsed.version !== CURRENT_VERSION) {
      return generateAndStoreData();
    }
    return parsed;
  } catch {
    return generateAndStoreData();
  }
}

export function saveData(data: NewsroomData): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

export function resetData(): NewsroomData {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
  return generateAndStoreData();
}
