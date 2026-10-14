import { FtpNewsItem, HandleEntry, HashtagRule, SocialDraft, SocialPost } from "@/types/newsroom";
import { CHANNEL } from "@/constants";

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1400&q=80`;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

type FtpSeed = Omit<FtpNewsItem, "receivedAt">;

// ─── Items already on the FTP (tagged breaking / big breaking) ─────────────────
const FTP_SEED: FtpSeed[] = [
  {
    id: "ftp-1",
    headline: "जयपुर मेट्रो फेज-2 को कैबिनेट की मंजूरी",
    body: "राजस्थान कैबिनेट ने जयपुर मेट्रो फेज-2 के विस्तार को मंजूरी दे दी है। सांगानेर से सीतापुरा तक बनने वाले इस कॉरिडोर पर करीब 12 हजार करोड़ रुपये खर्च होंगे। मुख्यमंत्री भजनलाल शर्मा ने कहा कि काम इसी साल शुरू होगा और रोजाना लाखों यात्रियों को राहत मिलेगी। जेएमआरसी ने टेंडर प्रक्रिया शुरू करने की तैयारी कर ली है।",
    shortText: "जयपुर मेट्रो फेज-2 को कैबिनेट की मंजूरी। सांगानेर से सीतापुरा तक बनेगा नया कॉरिडोर, 12 हजार करोड़ की लागत। काम इसी साल शुरू होगा।",
    tag: "big_breaking",
    area: "Jaipur",
    people: ["Bhajanlal Sharma", "CMO Rajasthan", "Jaipur Metro"],
    aiMentions: [{ entity: "Jaipur Development Authority", x: "@JDAJaipur", instagram: "@jdajaipur", confidence: 0.72 }],
    ftpPath: "/var/ftp/incoming/breaking/2026-10-13/JPR_METRO_PHASE2/",
    media: [
      { kind: "image", url: img("photo-1544620347-c4fd4a3d5957"), fileName: "JPR_METRO_01.jpg" },
      { kind: "image", url: img("photo-1599661046289-e31897846e41"), fileName: "JPR_METRO_02.jpg" },
    ],
  },
  {
    id: "ftp-2",
    headline: "कोटा में NEET अभ्यर्थियों का प्रदर्शन, परीक्षा गाइडलाइन बदलने की मांग",
    body: "कोटा में हजारों NEET अभ्यर्थी सड़क पर उतर आए। छात्रों की मांग है कि परीक्षा गाइडलाइन में बदलाव किया जाए और परिणाम प्रक्रिया पारदर्शी हो। पुलिस ने कोचिंग क्षेत्र में अतिरिक्त जाब्ता तैनात किया है। जिला प्रशासन ने छात्र प्रतिनिधियों को वार्ता के लिए बुलाया है।",
    shortText: "कोटा में हजारों NEET अभ्यर्थी सड़क पर। परीक्षा गाइडलाइन बदलने और पारदर्शी परिणाम की मांग। प्रशासन ने छात्र प्रतिनिधियों को वार्ता के लिए बुलाया।",
    tag: "breaking",
    area: "Kota",
    people: ["NTA", "Rajasthan Police"],
    aiMentions: [{ entity: "Kota District Collector", x: "@DMKota", instagram: "@dm_kota", confidence: 0.61 }],
    ftpPath: "/var/ftp/incoming/breaking/2026-10-13/KOTA_NEET_PROTEST/",
    media: [
      {
        kind: "video",
        url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        fileName: "KOTA_PROTEST_PKG.mp4",
        posterUrl: img("photo-1523240795612-9a054b0db644"),
      },
      { kind: "image", url: img("photo-1523240795612-9a054b0db644"), fileName: "KOTA_PROTEST_01.jpg" },
    ],
  },
  {
    id: "ftp-3",
    headline: "बीकानेर सोलर पार्क ने पार किया 3,000 मेगावाट का आंकड़ा",
    body: "थार के रेगिस्तान में बने बीकानेर सोलर पार्क की क्षमता 3,000 मेगावाट पहुंच गई है। ऊर्जा विभाग के अनुसार यह देश के सबसे बड़े सोलर पार्कों में शामिल हो गया है। इससे पश्चिमी राजस्थान में करीब आठ हजार लोगों को रोजगार मिला है।",
    shortText: "बीकानेर सोलर पार्क की क्षमता 3,000 मेगावाट पहुंची। देश के सबसे बड़े सोलर पार्कों में शामिल, आठ हजार लोगों को रोजगार।",
    tag: "breaking",
    area: "Bikaner",
    people: ["CMO Rajasthan"],
    ftpPath: "/var/ftp/incoming/breaking/2026-10-13/BKN_SOLAR_3000MW/",
    media: [{ kind: "image", url: img("photo-1508514177221-188b1cf16e9d"), fileName: "BKN_SOLAR_01.jpg" }],
  },
  {
    id: "ftp-4",
    headline: "इंदिरा गांधी नहर में पानी बढ़ाया, किसानों को बड़ी राहत",
    body: "श्रीगंगानगर और हनुमानगढ़ के किसानों के लिए इंदिरा गांधी नहर में पानी की मात्रा बढ़ा दी गई है। जल संसाधन विभाग ने रबी की बुवाई को देखते हुए यह फैसला लिया है। किसान संगठनों ने फैसले का स्वागत किया है।",
    shortText: "इंदिरा गांधी नहर में पानी बढ़ाया गया। श्रीगंगानगर और हनुमानगढ़ के किसानों को रबी बुवाई से पहले बड़ी राहत।",
    tag: "breaking",
    area: "Sri Ganganagar",
    people: ["CMO Rajasthan"],
    ftpPath: "/var/ftp/incoming/breaking/2026-10-13/SGNR_CANAL_WATER/",
    media: [{ kind: "image", url: img("photo-1500382017468-9049fed747ef"), fileName: "SGNR_CANAL_01.jpg" }],
  },
  {
    id: "ftp-5",
    headline: "रणथंभौर और सरिस्का में बढ़ी बाघों की संख्या",
    body: "ताजा गणना रिपोर्ट के अनुसार रणथंभौर और सरिस्का टाइगर रिजर्व में बाघों की संख्या बढ़ी है। वन विभाग ने इसे संरक्षण प्रयासों की बड़ी सफलता बताया है। दोनों रिजर्व में पर्यटन सीजन के लिए नई सफारी व्यवस्था भी लागू होगी।",
    shortText: "रणथंभौर और सरिस्का में बाघों की संख्या बढ़ी। वन विभाग ने इसे संरक्षण की बड़ी सफलता बताया।",
    tag: "big_breaking",
    area: "Sawai Madhopur",
    people: ["Forest Department"],
    ftpPath: "/var/ftp/incoming/breaking/2026-10-13/RTR_TIGER_CENSUS/",
    media: [{ kind: "image", url: img("photo-1561731216-c3a4d99437d5"), fileName: "RTR_TIGER_01.jpg" }],
  },
];

// ─── Items that "arrive" when the desk fetches from FTP again ─────────────────
const FTP_INCOMING: FtpSeed[] = [
  {
    id: "ftp-6",
    headline: "बाड़मेर रिफाइनरी में पाइपलाइन का काम शुरू",
    body: "बाड़मेर रिफाइनरी विस्तार परियोजना में पाइपलाइन बिछाने का काम शुरू हो गया है। परियोजना से मारवाड़ क्षेत्र में 15 हजार से ज्यादा रोजगार मिलने की उम्मीद है।",
    shortText: "बाड़मेर रिफाइनरी में पाइपलाइन का काम शुरू। मारवाड़ में 15 हजार से ज्यादा रोजगार की उम्मीद।",
    tag: "breaking",
    area: "Barmer",
    people: ["CMO Rajasthan"],
    ftpPath: "/var/ftp/incoming/breaking/2026-10-13/BMR_REFINERY_PIPELINE/",
    media: [{ kind: "image", url: img("photo-1518709268805-4e9042af9f23"), fileName: "BMR_REFINERY_01.jpg" }],
  },
  {
    id: "ftp-7",
    headline: "उदयपुर की झीलों की सफाई का काम अंतिम चरण में",
    body: "पिछोला और फतेहसागर झील की सफाई का काम अंतिम चरण में पहुंच गया है। नगर निगम के अनुसार मानसून से पहले काम पूरा कर लिया जाएगा।",
    shortText: "उदयपुर में पिछोला और फतेहसागर की सफाई अंतिम चरण में। मानसून से पहले पूरा होगा काम।",
    tag: "breaking",
    area: "Udaipur",
    people: [],
    ftpPath: "/var/ftp/incoming/breaking/2026-10-13/UDR_LAKE_CLEANUP/",
    media: [{ kind: "image", url: img("photo-1590050752117-238cb0fb12b1"), fileName: "UDR_LAKE_01.jpg" }],
  },
  {
    id: "ftp-8",
    headline: "पुष्कर मेले की तारीखों का ऐलान, दो लाख से ज्यादा सैलानी आएंगे",
    body: "पुष्कर पशु मेले की तारीखों का ऐलान हो गया है। पर्यटन विभाग को इस बार दो लाख से ज्यादा देशी-विदेशी सैलानियों के आने की उम्मीद है।",
    shortText: "पुष्कर मेले की तारीखों का ऐलान। इस बार दो लाख से ज्यादा सैलानियों के आने की उम्मीद।",
    tag: "big_breaking",
    area: "Ajmer",
    people: ["Rajasthan Tourism"],
    aiMentions: [{ entity: "Pushkar Mela", x: "@PushkarMela", instagram: "@pushkarmela", confidence: 0.54 }],
    ftpPath: "/var/ftp/incoming/breaking/2026-10-13/PUSHKAR_FAIR_DATES/",
    media: [{ kind: "image", url: img("photo-1609949279531-cf48d64bed89"), fileName: "PUSHKAR_FAIR_01.jpg" }],
  },
  {
    id: "ftp-9",
    headline: "जोधपुर में भीषण गर्मी, पारा 44 डिग्री के पार",
    body: "जोधपुर में गर्मी ने रिकॉर्ड तोड़ दिया है। मौसम विभाग ने अगले तीन दिन लू का अलर्ट जारी किया है। जिला प्रशासन ने दोपहर में बाहर न निकलने की सलाह दी है।",
    shortText: "जोधपुर में पारा 44 डिग्री के पार। मौसम विभाग ने तीन दिन लू का अलर्ट जारी किया।",
    tag: "breaking",
    area: "Jodhpur",
    people: [],
    ftpPath: "/var/ftp/incoming/breaking/2026-10-14/JDH_HEATWAVE/",
    media: [{ kind: "image", url: img("photo-1599661046289-e31897846e41"), fileName: "JDH_HEATWAVE_01.jpg" }],
  },
  {
    id: "ftp-10",
    headline: "जयपुर में ट्रैफिक के नए नियम लागू, चालान की राशि बढ़ी",
    body: "जयपुर ट्रैफिक पुलिस ने शहर में नए नियम लागू कर दिए हैं। बिना हेलमेट और रेड लाइट जंप पर अब ज्यादा जुर्माना लगेगा। नियम सोमवार से प्रभावी होंगे।",
    shortText: "जयपुर में ट्रैफिक के नए नियम लागू। बिना हेलमेट और रेड लाइट जंप पर अब ज्यादा जुर्माना।",
    tag: "breaking",
    area: "Jaipur",
    people: ["Rajasthan Police"],
    ftpPath: "/var/ftp/incoming/breaking/2026-10-14/JPR_TRAFFIC_RULES/",
    media: [{ kind: "image", url: img("photo-1544620347-c4fd4a3d5957"), fileName: "JPR_TRAFFIC_01.jpg" }],
  },
  {
    id: "ftp-11",
    headline: "कोटा में कोचिंग संस्थानों के लिए नई गाइडलाइन जारी",
    body: "जिला प्रशासन ने कोटा के कोचिंग संस्थानों के लिए नई गाइडलाइन जारी की है। छात्रों की काउंसलिंग और साप्ताहिक अवकाश अनिवार्य किया गया है।",
    shortText: "कोटा के कोचिंग संस्थानों के लिए नई गाइडलाइन। काउंसलिंग और साप्ताहिक अवकाश अनिवार्य।",
    tag: "big_breaking",
    area: "Kota",
    people: [],
    ftpPath: "/var/ftp/incoming/breaking/2026-10-14/KOTA_COACHING_RULES/",
    media: [{ kind: "image", url: img("photo-1523240795612-9a054b0db644"), fileName: "KOTA_COACHING_01.jpg" }],
  },
  {
    id: "ftp-12",
    headline: "बीकानेर में ऊंट उत्सव की तैयारियां शुरू",
    body: "बीकानेर में होने वाले अंतरराष्ट्रीय ऊंट उत्सव की तैयारियां शुरू हो गई हैं। पर्यटन विभाग इस बार नए सांस्कृतिक कार्यक्रम जोड़ रहा है।",
    shortText: "बीकानेर में ऊंट उत्सव की तैयारियां शुरू। इस बार नए सांस्कृतिक कार्यक्रम जुड़ेंगे।",
    tag: "breaking",
    area: "Bikaner",
    people: ["Rajasthan Tourism"],
    ftpPath: "/var/ftp/incoming/breaking/2026-10-14/BKN_CAMEL_FESTIVAL/",
    media: [{ kind: "image", url: img("photo-1609949279531-cf48d64bed89"), fileName: "BKN_CAMEL_01.jpg" }],
  },
];

export function generateFtpNews(): FtpNewsItem[] {
  return FTP_SEED.map((item, i) => ({ ...item, receivedAt: minutesAgo(4 + i * 11) }));
}

/** Next batch of breaking items not yet pulled into the desk (empty when the FTP has nothing new). */
export function fetchNewFtpNews(existingIds: string[]): FtpNewsItem[] {
  const next = FTP_INCOMING.find((item) => !existingIds.includes(item.id));
  return next ? [{ ...next, receivedAt: new Date().toISOString() }] : [];
}

// ─── Posts that already went out earlier this week ────────────────────────────
const POSTED_SEED: { headline: string; image: string; platform: SocialPost["platform"]; hoursAgo: number }[] = [
  { headline: "जोधपुर के मेहरानगढ़ किले में नई हेरिटेज गैलरी खुली", image: "photo-1599661046289-e31897846e41", platform: "X (Twitter)", hoursAgo: 3 },
  { headline: "जोधपुर के मेहरानगढ़ किले में नई हेरिटेज गैलरी खुली", image: "photo-1599661046289-e31897846e41", platform: "Instagram", hoursAgo: 3 },
  { headline: "अलवर ईवी हब में 5,000 करोड़ का निवेश", image: "photo-1518709268805-4e9042af9f23", platform: "X (Twitter)", hoursAgo: 27 },
  { headline: "शेखावाटी की हवेलियों के संरक्षण की नई नीति जारी", image: "photo-1590050752117-238cb0fb12b1", platform: "X (Twitter)", hoursAgo: 52 },
  { headline: "शेखावाटी की हवेलियों के संरक्षण की नई नीति जारी", image: "photo-1590050752117-238cb0fb12b1", platform: "Instagram", hoursAgo: 51 },
  { headline: "माउंट आबू विंटर फेस्टिवल की तैयारियां पूरी", image: "photo-1609949279531-cf48d64bed89", platform: "Instagram", hoursAgo: 75 },
  { headline: "चित्तौड़गढ़ किले के जीर्णोद्धार का काम शुरू", image: "photo-1599661046289-e31897846e41", platform: "X (Twitter)", hoursAgo: 99 },
];

export function generatePostedSeed(): SocialPost[] {
  return POSTED_SEED.map((seed, i) => {
    const at = Date.now() - seed.hoursAgo * 3600000;
    const hashtags = ["#BreakingNews", "#Rajasthan", "#FirstIndiaNews"];
    return {
      id: `post-seed-${i + 1}`,
      newsId: `ftp-archive-${i + 1}`,
      platform: seed.platform,
      headline: seed.headline,
      text: `${seed.headline}

${hashtags.join(" ")}`,
      hashtags,
      mentions: [],
      mediaKind: "image",
      thumbUrl: `https://images.unsplash.com/${seed.image}?auto=format&fit=crop&w=320&q=60`,
      postUrl:
        seed.platform === "Instagram"
          ? `https://www.instagram.com/${CHANNEL.instagramHandle}/p/${at.toString(36).toUpperCase()}/`
          : `https://x.com/${CHANNEL.xHandle}/status/${at}${100000 + i * 7919}`,
      postedAt: new Date(at).toISOString(),
      postedBy: "Digital Content Team",
    };
  });
}

// ─── Tagging directory ────────────────────────────────────────────────────────
export const AREA_HASHTAGS: Record<string, string[]> = {
  Jaipur: ["#Jaipur", "#JaipurNews"],
  Kota: ["#Kota", "#KotaNews"],
  Bikaner: ["#Bikaner"],
  "Sri Ganganagar": ["#SriGanganagar", "#Hanumangarh"],
  "Sawai Madhopur": ["#SawaiMadhopur", "#Ranthambore"],
  Barmer: ["#Barmer"],
  Udaipur: ["#Udaipur"],
  Ajmer: ["#Ajmer", "#Pushkar"],
};

export const PEOPLE_HANDLES: Record<string, { x: string; instagram: string }> = {
  "Bhajanlal Sharma": { x: "@BhajanlalBjp", instagram: "@bhajanlalsharmabjp" },
  "CMO Rajasthan": { x: "@RajCMO", instagram: "@rajcmo" },
  "Rajasthan Police": { x: "@PoliceRajasthan", instagram: "@police_rajasthan" },
  NTA: { x: "@NTA_Exams", instagram: "@nta_exams" },
  "Jaipur Metro": { x: "@OfficialJMRC", instagram: "@jaipurmetro" },
  "Forest Department": { x: "@ForestRajasthan", instagram: "@forestrajasthan" },
  "Rajasthan Tourism": { x: "@my_rajasthan", instagram: "@rajasthan_tourism" },
};

// ─── Editable library seeds ───────────────────────────────────────────────────
export function generateHashtagRules(): HashtagRule[] {
  return Object.entries(AREA_HASHTAGS).map(([area, hashtags], i) => ({ id: `rule-${i + 1}`, area, hashtags }));
}

export function generateHandleDirectory(): HandleEntry[] {
  const verifiedAt = new Date(Date.now() - 6 * 86400000).toISOString();
  return Object.entries(PEOPLE_HANDLES).map(([entity, handles], i) => ({ id: `handle-${i + 1}`, entity, ...handles, verifiedAt }));
}

/** One scheduled and one rejected draft so every console tab has something to show. */
export function generateDraftSeed(): SocialDraft[] {
  const now = Date.now();
  const thumb = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=320&q=60`;
  return [
    {
      id: "draft-seed-1",
      newsId: "ftp-3",
      platform: "X (Twitter)",
      status: "scheduled",
      headline: "बीकानेर सोलर पार्क ने पार किया 3,000 मेगावाट का आंकड़ा",
      text: "बीकानेर सोलर पार्क की क्षमता 3,000 मेगावाट पहुंची। देश के सबसे बड़े सोलर पार्कों में शामिल।\n\n#BreakingNews #Bikaner #Rajasthan #FirstIndiaNews",
      hashtags: ["#BreakingNews", "#Bikaner", "#Rajasthan", "#FirstIndiaNews"],
      mentions: [],
      mediaKind: "image",
      thumbUrl: thumb("photo-1508514177221-188b1cf16e9d"),
      postedBy: "Digital Content Team",
      format: "x",
      scheduledFor: new Date(now + 45 * 60000).toISOString(),
      updatedAt: new Date(now - 10 * 60000).toISOString(),
    },
    {
      id: "draft-seed-2",
      newsId: "ftp-4",
      platform: "Instagram",
      status: "rejected",
      headline: "इंदिरा गांधी नहर में पानी बढ़ाया, किसानों को बड़ी राहत",
      text: "इंदिरा गांधी नहर में पानी बढ़ाया गया।",
      hashtags: [],
      mentions: [],
      mediaKind: "image",
      thumbUrl: thumb("photo-1500382017468-9049fed747ef"),
      postedBy: "Digital Content Team",
      rejectReason: "duplicate",
      rejectNote: "Same update went out as a Reel yesterday evening.",
      updatedAt: new Date(now - 25 * 60000).toISOString(),
    },
  ];
}

export interface FtpFetchRun {
  id: string;
  at: string;
  /** "auto" for the timed check, "manual" when an operator pressed Check now */
  trigger: "auto" | "manual";
  added: number;
  headlines: string[];
}
