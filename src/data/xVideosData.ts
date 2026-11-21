// Demo data for the X Videos desk (/ai-content/x-videos, behind NEXT_PUBLIC_XVIDEOS). All of it is made up: the
// clips folder reader, speech-to-text and on-screen text recognition come in the backend phase (docs/xvideos).
// Video files are looked up in public/xvideos-demo/; a missing file shows a dark frame with the file name.

export type XvKind = "live" | "clip";
export type XvStatus = "new" | "posted" | "rejected";

/** One timed line of what is said in the clip (Hindi speech-to-text) */
export interface XvTranscriptLine {
  /** Seconds from the start of the clip */
  at: number;
  text: string;
  /** The part worth posting, highlighted in the panel */
  highlight?: string;
  /** Marked as a line worth using: a blue dot on the trim bar */
  worth?: boolean;
}

/** Text read from a frame: a super, ticker or name strap */
export interface XvScreenText {
  id: string;
  at: number;
  text: string;
  /** Where it was read on the frame, in % of the frame (left, top, width, height) */
  box: { x: number; y: number; w: number; h: number };
  kind: "super" | "ticker" | "strap";
}

export interface XvTagSuggestion {
  value: string;
  /** Ticked when the editor opens */
  on: boolean;
}

export interface XvClip {
  id: string;
  fileName: string;
  /** The video, under public/ */
  src: string;
  district: string;
  /** What the clip is about, in the desk's words ("CM press conference") */
  topic?: string;
  receivedAt: string;
  /** Seconds */
  duration: number;
  /** Bytes */
  size: number;
  kind: XvKind;
  /** The system's guess at a headline; null while the clip is still being read */
  suggestedHeadline: string | null;
  /** A headline the desk already confirmed (shown black, not as Suggested) */
  headline?: string;
  /** 0-100 while the clip is being read (speech and frames); undefined once done */
  readingProgress?: number;
  transcript: XvTranscriptLine[];
  screenText: XvScreenText[];
  /** Names and things heard, as chips */
  heard: string[];
  /** The channel label the title should end with ("Rajasthan News"); the brand tag follows it */
  channelLabel: string | null;
  /** Video-style prefixes that fit this clip ("Jaipur Fire:") besides the standard ones */
  prefixes?: string[];
  hashtags: XvTagSuggestion[];
  mentions: XvTagSuggestion[];
  status: XvStatus;
  /** Someone else has it open */
  heldBy?: string;
  postedAt?: string;
  postedText?: string;
  rejectedReason?: string;
}

const minutesAgo = (m: number, now: number) => new Date(now - m * 60_000).toISOString();

/** The demo clips, with received times relative to `now` so the list reads "just now", "9 min ago"… */
export function xVideoClips(now = Date.now()): XvClip[] {
  return [
    {
      id: "xv-cm-pc",
      fileName: "LIVE_JPR_CM_PC_1432.mp4",
      src: "/xvideos-demo/clip1.mp4",
      district: "Jaipur",
      topic: "CM press conference",
      receivedAt: minutesAgo(0.5, now),
      duration: 138,
      size: 48 * 1024 * 1024,
      kind: "live",
      suggestedHeadline: "किसानों के लिए 2000 करोड़ के पैकेज का ऐलान",
      transcript: [
        { at: 4, text: "आज हम प्रदेश के अन्नदाताओं के लिए एक बड़ा निर्णय लेकर आए हैं।" },
        { at: 19, text: "पिछले दो साल में सरकार ने किसानों के हित में कई योजनाएं शुरू की हैं।" },
        { at: 42, text: "राज्य सरकार किसानों के लिए 2000 करोड़ रुपये के पैकेज की घोषणा करती है।", highlight: "किसानों के लिए 2000 करोड़ रुपये के पैकेज", worth: true },
        { at: 80, text: "एक दिसंबर से ई-मित्र पर पंजीकरण शुरू होगा, कोई शुल्क नहीं लगेगा।", worth: true },
        { at: 108, text: "बिजली के बिल में भी किसानों को राहत दी जाएगी।", worth: true },
        { at: 125, text: "मैं सभी जिला कलेक्टरों को निर्देश दे चुका हूं।" },
      ],
      screenText: [
        { id: "s1", at: 6, text: "मुख्यमंत्री भजनलाल शर्मा की प्रेस वार्ता", box: { x: 4, y: 76, w: 92, h: 8 }, kind: "super" },
        { id: "s2", at: 44, text: "किसानों के लिए 2000 करोड़ का पैकेज · 1 दिसंबर से पंजीकरण", box: { x: 0, y: 92, w: 100, h: 8 }, kind: "ticker" },
      ],
      heard: ["भजनलाल शर्मा", "किसान", "जयपुर", "2000 करोड़"],
      channelLabel: "Rajasthan News",
      hashtags: [
        { value: "#Jaipur", on: true },
        { value: "#BhajanlalSharma", on: true },
        { value: "#Farmers", on: false },
      ],
      mentions: [
        { value: "@BhajanlalBjp", on: true },
        { value: "@RajGovOfficial", on: true },
      ],
      status: "new",
    },
    {
      id: "xv-kota-rain",
      fileName: "LIVE_KOTA_RAIN_1424.mp4",
      src: "/xvideos-demo/clip2.mp4",
      district: "Kota",
      topic: "Rain",
      receivedAt: minutesAgo(9, now),
      duration: 65,
      size: 21 * 1024 * 1024,
      kind: "live",
      suggestedHeadline: "कोटा में जोरदार बारिश का दौर, कई इलाकों में जलभराव",
      headline: "कोटा में जोरदार बारिश का दौर, कई इलाकों में जलभराव",
      transcript: [
        { at: 3, text: "कोटा शहर में सुबह से ही तेज बारिश का दौर जारी है।", worth: true },
        { at: 21, text: "स्टेशन रोड और नयापुरा में घुटनों तक पानी भर गया है।", highlight: "घुटनों तक पानी", worth: true },
        { at: 44, text: "नगर निगम की टीमें पानी निकालने में जुटी हैं।" },
      ],
      screenText: [{ id: "s1", at: 10, text: "कोटा में झमाझम बारिश, सड़कें बनीं दरिया", box: { x: 4, y: 76, w: 92, h: 8 }, kind: "super" }],
      heard: ["कोटा", "नयापुरा", "नगर निगम"],
      channelLabel: "Rajasthan News",
      prefixes: ["Kota Rain:"],
      hashtags: [
        { value: "#Kota", on: true },
        { value: "#KotaRain", on: true },
        { value: "#Monsoon", on: false },
      ],
      mentions: [{ value: "@KotaPolice", on: false }],
      status: "new",
      heldBy: "Rohit",
    },
    {
      id: "xv-vidhansabha",
      fileName: "LIVE_JPR_VIDHANSABHA_1410.mp4",
      src: "/xvideos-demo/clip3.mp4",
      district: "Jaipur",
      topic: "Vidhan Sabha",
      receivedAt: minutesAgo(23, now),
      duration: 222,
      size: 96 * 1024 * 1024,
      kind: "live",
      suggestedHeadline: "विधानसभा में हंगामा, विपक्ष का वॉकआउट",
      transcript: [
        { at: 8, text: "सदन की कार्यवाही शुरू होते ही विपक्ष ने नारेबाजी शुरू कर दी।" },
        { at: 47, text: "नेता प्रतिपक्ष टीकाराम जूली ने सरकार पर किसानों की अनदेखी का आरोप लगाया।", highlight: "सरकार पर किसानों की अनदेखी का आरोप", worth: true },
        { at: 96, text: "विधानसभा अध्यक्ष ने सदस्यों से शांति बनाए रखने की अपील की।" },
        { at: 151, text: "इसके बाद विपक्ष के सभी विधायक सदन से वॉकआउट कर गए।", highlight: "वॉकआउट", worth: true },
        { at: 200, text: "कार्यवाही आधे घंटे के लिए स्थगित कर दी गई।" },
      ],
      screenText: [{ id: "s1", at: 150, text: "विधानसभा में विपक्ष का वॉकआउट", box: { x: 4, y: 76, w: 92, h: 8 }, kind: "super" }],
      heard: ["टीकाराम जूली", "विधानसभा", "वासुदेव देवनानी"],
      channelLabel: "Rajasthan News",
      hashtags: [
        { value: "#Jaipur", on: true },
        { value: "#RajasthanAssembly", on: true },
        { value: "#TikaramJully", on: false },
      ],
      mentions: [{ value: "@TikaRamJullyINC", on: false }],
      status: "new",
    },
    {
      id: "xv-udaipur-tiger",
      fileName: "LIVE_UDR_TIGER_1436.mp4",
      src: "/xvideos-demo/clip4.mp4",
      district: "Udaipur",
      receivedAt: minutesAgo(0.2, now),
      duration: 52,
      size: 18 * 1024 * 1024,
      kind: "clip",
      suggestedHeadline: null,
      readingProgress: 45,
      transcript: [],
      screenText: [],
      heard: [],
      channelLabel: "Rajasthan News",
      prefixes: ["Viral Video:"],
      hashtags: [{ value: "#Udaipur", on: true }],
      mentions: [],
      status: "new",
    },
    {
      id: "xv-tonk-pilot",
      fileName: "LIVE_TONK_PILOT_1402.mp4",
      src: "/xvideos-demo/clip5.mp4",
      district: "Tonk",
      receivedAt: minutesAgo(31, now),
      duration: 107,
      size: 39 * 1024 * 1024,
      kind: "live",
      suggestedHeadline: "सचिन पायलट बोले, युवाओं से किया वादा पूरा करे सरकार",
      transcript: [
        { at: 5, text: "टोंक की जनता का मैं दिल से आभार व्यक्त करता हूं।" },
        { at: 33, text: "सरकार ने युवाओं से जो वादा किया था, उसे पूरा करना चाहिए।", highlight: "युवाओं से जो वादा किया था", worth: true },
        { at: 71, text: "भर्ती परीक्षाओं में देरी से नौजवान परेशान हैं।", worth: true },
      ],
      screenText: [{ id: "s1", at: 2, text: "टोंक: सचिन पायलट का जनसंवाद", box: { x: 4, y: 76, w: 92, h: 8 }, kind: "strap" }],
      heard: ["सचिन पायलट", "टोंक", "युवा"],
      channelLabel: "Rajasthan News",
      hashtags: [
        { value: "#Tonk", on: true },
        { value: "#SachinPilot", on: true },
      ],
      mentions: [{ value: "@SachinPilot", on: true }],
      status: "new",
    },
    {
      id: "xv-jaipur-fire",
      fileName: "LIVE_JPR_FIRE_1358.mp4",
      src: "/xvideos-demo/clip6.mp4",
      district: "Jaipur",
      topic: "Ajmer Road fire",
      receivedAt: minutesAgo(35, now),
      duration: 38,
      size: 14 * 1024 * 1024,
      kind: "clip",
      suggestedHeadline: "अजमेर रोड पर भीषण आग, दमकल की 12 गाड़ियां मौके पर",
      transcript: [
        { at: 2, text: "अजमेर रोड पर एक फैक्ट्री में अचानक आग लग गई।", worth: true },
        { at: 17, text: "दमकल की बारह गाड़ियां आग बुझाने में लगी हैं।", highlight: "दमकल की बारह गाड़ियां" },
      ],
      screenText: [
        { id: "s1", at: 12, text: "अजमेर रोड पर भीषण आग, दमकल की 12 गाड़ियां मौके पर", box: { x: 3.5, y: 74, w: 93, h: 10 }, kind: "super" },
        { id: "s2", at: 20, text: "जयपुर: फैक्ट्री में लगी आग · कोई हताहत नहीं · पुलिस मौके पर", box: { x: 0, y: 92, w: 100, h: 8 }, kind: "ticker" },
        { id: "s3", at: 30, text: "जयपुर: अजमेर रोड पर यातायात डायवर्ट", box: { x: 4, y: 76, w: 92, h: 8 }, kind: "super" },
      ],
      heard: ["अजमेर रोड", "दमकल", "फैक्ट्री"],
      channelLabel: "Jaipur News",
      prefixes: ["Jaipur Fire:"],
      hashtags: [
        { value: "#Jaipur", on: true },
        { value: "#JaipurFireIncident", on: true },
      ],
      mentions: [
        { value: "@jaipur_police", on: true },
        { value: "@DcDmJaipur", on: false },
      ],
      status: "new",
    },
    {
      id: "xv-delhi-smog",
      fileName: "CLIP_DEL_SMOG_1350.mp4",
      src: "/xvideos-demo/clip7.mp4",
      district: "Delhi",
      topic: "Air quality",
      receivedAt: minutesAgo(43, now),
      duration: 44,
      size: 16 * 1024 * 1024,
      kind: "clip",
      suggestedHeadline: "दिल्ली में हवा 'गंभीर', AQI 450 के पार",
      transcript: [
        { at: 3, text: "राजधानी दिल्ली में आज सुबह घनी धुंध छाई रही।" },
        { at: 15, text: "कई इलाकों में एक्यूआई साढ़े चार सौ के पार पहुंच गया।", highlight: "साढ़े चार सौ के पार", worth: true },
      ],
      screenText: [{ id: "s1", at: 8, text: "दिल्ली: AQI 450 पार, ग्रैप-4 लागू", box: { x: 4, y: 76, w: 92, h: 8 }, kind: "super" }],
      heard: ["दिल्ली", "एक्यूआई", "ग्रैप"],
      channelLabel: "India News",
      prefixes: ["Delhi Pollution:"],
      hashtags: [
        { value: "#Delhi", on: true },
        { value: "#AirPollution", on: true },
      ],
      mentions: [],
      status: "new",
    },
    {
      id: "xv-ajmer-urs",
      fileName: "LIVE_AJM_URS_1320.mp4",
      src: "/xvideos-demo/clip8.mp4",
      district: "Ajmer",
      receivedAt: minutesAgo(73, now),
      duration: 58,
      size: 22 * 1024 * 1024,
      kind: "live",
      suggestedHeadline: "अजमेर दरगाह में उर्स की तैयारियां शुरू",
      transcript: [{ at: 6, text: "ख्वाजा साहब के उर्स की तैयारियां जोरों पर हैं।", worth: true }],
      screenText: [],
      heard: ["अजमेर", "उर्स"],
      channelLabel: "Rajasthan News",
      hashtags: [{ value: "#Ajmer", on: true }],
      mentions: [],
      status: "rejected",
      rejectedReason: "Same clip posted at 12:40",
    },
    {
      id: "xv-bikaner-camel",
      fileName: "CLIP_BKN_CAMEL_1245.mp4",
      src: "/xvideos-demo/clip9.mp4",
      district: "Bikaner",
      receivedAt: minutesAgo(108, now),
      duration: 41,
      size: 12 * 1024 * 1024,
      kind: "clip",
      suggestedHeadline: "बीकानेर ऊंट उत्सव की रंगारंग शुरुआत",
      transcript: [],
      screenText: [],
      heard: [],
      channelLabel: "Rajasthan News",
      hashtags: [{ value: "#Bikaner", on: true }],
      mentions: [],
      status: "posted",
      postedAt: minutesAgo(95, now),
      postedText: "VIDEO: बीकानेर ऊंट उत्सव की रंगारंग शुरुआत | Rajasthan News\n\n#FINVideo #RajasthanWithFirstIndia #Bikaner",
    },
  ];
}

/** Clips posted today before the demo's own (the "Posted today" card adds the desk's posts to this) */
export const XV_POSTED_EARLIER = 13;

/** The demo's hashtag and handle directory, searched by "Add hashtag" / "Add handle" (the live desk's GET /handles) */
export const XV_TAG_DIRECTORY: { value: string; name: string; nameHi: string | null }[] = [
  { value: "#Jaipur", name: "Jaipur", nameHi: "जयपुर" },
  { value: "#JaipurNews", name: "Jaipur news", nameHi: null },
  { value: "#JaipurFireIncident", name: "Jaipur fire", nameHi: null },
  { value: "#Fire", name: "Fire", nameHi: "आग" },
  { value: "#FireBrigade", name: "Fire brigade", nameHi: "दमकल" },
  { value: "#Farmers", name: "Farmers", nameHi: "किसान" },
  { value: "#Kota", name: "Kota", nameHi: "कोटा" },
  { value: "#Tonk", name: "Tonk", nameHi: "टोंक" },
  { value: "#Udaipur", name: "Udaipur", nameHi: "उदयपुर" },
  { value: "#Tiger", name: "Tiger", nameHi: "बाघ" },
  { value: "#Rajasthan", name: "Rajasthan", nameHi: "राजस्थान" },
  { value: "#RajasthanAssembly", name: "Rajasthan Vidhan Sabha", nameHi: "विधानसभा" },
  { value: "#BhajanlalSharma", name: "Bhajanlal Sharma", nameHi: "भजनलाल शर्मा" },
  { value: "#SachinPilot", name: "Sachin Pilot", nameHi: "सचिन पायलट" },
  { value: "#Delhi", name: "Delhi", nameHi: "दिल्ली" },
  { value: "#AirPollution", name: "Air pollution", nameHi: "प्रदूषण" },
  { value: "#Monsoon", name: "Monsoon", nameHi: "मानसून" },
  { value: "@BhajanlalBjp", name: "Bhajanlal Sharma, CM", nameHi: "भजनलाल शर्मा" },
  { value: "@RajGovOfficial", name: "Government of Rajasthan", nameHi: null },
  { value: "@jaipur_police", name: "Jaipur Police", nameHi: "जयपुर पुलिस" },
  { value: "@DcDmJaipur", name: "Collector Jaipur", nameHi: null },
  { value: "@KotaPolice", name: "Kota Police", nameHi: null },
  { value: "@SachinPilot", name: "Sachin Pilot", nameHi: "सचिन पायलट" },
  { value: "@TikaRamJullyINC", name: "Tikaram Jully", nameHi: "टीकाराम जूली" },
  { value: "@PoliceRajasthan", name: "Rajasthan Police", nameHi: null },
];
