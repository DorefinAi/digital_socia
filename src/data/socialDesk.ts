import { ActivityItem, PostPayload, SocialDraft, SocialPost } from "@/types/newsroom";
import { CHANNEL } from "@/constants";
import { NewsroomData } from "@/data/demoData";

/** Seconds a post waits before it is sent, so the operator can undo it. */
export const UNDO_SECONDS = 10;

/** Daily posting volume the desk plans around. Instagram's is Meta's API publishing limit; Facebook's is a planning figure to confirm. */
export const DAILY_CAP = { "X (Twitter)": 800, Instagram: 100, Facebook: 100 } as const;

export function buildPost(payload: PostPayload, stamp = Date.now()): SocialPost {
  const postUrl =
    payload.platform === "Instagram"
      ? `https://www.instagram.com/${CHANNEL.instagramHandle}/p/${stamp.toString(36).toUpperCase()}/`
      : payload.platform === "Facebook"
      ? `https://www.facebook.com/${CHANNEL.facebookPage}/posts/${stamp}`
      : `https://x.com/${CHANNEL.xHandle}/status/${stamp}${Math.floor(Math.random() * 900000 + 100000)}`;
  return { ...payload, id: `post-${stamp}-${Math.floor(Math.random() * 1000)}`, postUrl, postedAt: new Date(stamp).toISOString(), status: "live" };
}

function activity(action: ActivityItem["action"], actor: string, target: string, details?: string): ActivityItem {
  return { id: `a-${Date.now()}-${Math.floor(Math.random() * 1000)}`, action, actor, target, timestamp: new Date().toISOString(), details };
}

/** Adds a sent post and clears any draft the story had on that platform. */
export function withPublished(data: NewsroomData, post: SocialPost): NewsroomData {
  return {
    ...data,
    socialPosts: [post, ...data.socialPosts],
    socialDrafts: data.socialDrafts.filter((d) => !(d.newsId === post.newsId && d.platform === post.platform)),
    activity: [activity("published", post.postedBy, `${post.platform}: ${post.headline}`, post.postUrl), ...data.activity],
  };
}

/** Inserts or replaces the story's draft on that platform. */
export function withDraft(data: NewsroomData, draft: Omit<SocialDraft, "id" | "updatedAt">): NewsroomData {
  const existing = data.socialDrafts.find((d) => d.newsId === draft.newsId && d.platform === draft.platform);
  const next: SocialDraft = { ...draft, id: existing?.id ?? `draft-${Date.now()}`, updatedAt: new Date().toISOString() };
  const others = data.socialDrafts.filter((d) => d !== existing);
  const verb = draft.status === "rejected" ? "rejected" : "edited";
  const detail = draft.status === "scheduled" ? `Scheduled for ${draft.scheduledFor}` : draft.status === "rejected" ? draft.rejectReason : "Draft saved";
  return {
    ...data,
    socialDrafts: [next, ...others],
    activity: [activity(verb, draft.postedBy, `${draft.platform}: ${draft.headline}`, detail), ...data.activity],
  };
}

/** True when the story is out on that platform and has not been recalled. */
export function isLiveOn(posts: SocialPost[], newsId: string, platform: SocialPost["platform"]) {
  return posts.some((p) => p.newsId === newsId && p.platform === platform && p.status !== "recalled");
}

/** The publishable part of a draft, without its queue bookkeeping. */
export function draftToPayload(draft: SocialDraft): PostPayload {
  const { newsId, platform, headline, text, caption, hashtags, mentions, mediaKind, thumbUrl, postedBy, format, mediaFile, layout, clipSegments } = draft;
  return { newsId, platform, headline, text, caption, hashtags, mentions, mediaKind, thumbUrl, postedBy, format, mediaFile, layout, clipSegments };
}
