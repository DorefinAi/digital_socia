"use client";

// DEV ROUTE for building and testing the Video Studio on its own, before it is wired into the post editor.
//   /video-studio                     demo story with video (mock data) or the first live story with video
//   /video-studio?story=<id>          that story
//   /video-studio?platform=Shorts     Facebook | YouTube | Shorts | Reels (sets the frame for a new project)
//   /video-studio?story=none          empty project
import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SessionGate from "@/components/Layout/SessionGate";
import VideoStudio from "@/components/Newsroom/BreakingDesk/video/VideoStudio";
import type { StudioPlatform } from "@/components/Newsroom/BreakingDesk/video/projectFromStory";
import { LiveDeskProvider, useLiveDesk } from "@/components/Newsroom/BreakingDesk/live/LiveDesk";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { USE_MOCKS } from "@/lib/socia/config";
import type { FtpNewsItem } from "@/types/newsroom";

const PLATFORMS: StudioPlatform[] = ["Facebook", "YouTube", "Shorts", "Reels"];

function pick(items: FtpNewsItem[], id: string | null): FtpNewsItem | null {
  if (id === "none") return null;
  if (id) return items.find((s) => s.id === id) ?? null;
  return items.find((s) => s.media.some((m) => m.kind === "video")) ?? items[0] ?? null;
}

function Studio({ items, loading }: { items: FtpNewsItem[]; loading: boolean }) {
  const params = useSearchParams();
  const raw = params.get("platform") as StudioPlatform | null;
  const platform = raw && PLATFORMS.includes(raw) ? raw : "Facebook";
  const story = pick(items, params.get("story"));
  if (loading && !story) return <p style={{ padding: 24 }}>Loading stories…</p>;
  return <VideoStudio key={`${platform}:${story?.id ?? "none"}`} platform={platform} draftId={story?.id ?? "scratch"} story={story} />;
}

function MockStudio() {
  const { ftpNews } = useNewsroom();
  return <Studio items={ftpNews} loading={false} />;
}

function LiveStudio() {
  const desk = useLiveDesk();
  return <Studio items={desk?.queue ?? []} loading={!desk || desk.inbox.loading} />;
}

export default function VideoStudioPage() {
  return (
    <SessionGate>
      <Suspense>
        {USE_MOCKS ? (
          <MockStudio />
        ) : (
          <LiveDeskProvider>
            <LiveStudio />
          </LiveDeskProvider>
        )}
      </Suspense>
    </SessionGate>
  );
}
