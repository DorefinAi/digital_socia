"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AI_CONTENT_PLATFORMS } from "@/components/leftNavigation/aiContentPlatforms";
import { postStudioKey } from "@/lib/access/catalogue";
import { usePermissions } from "@/lib/access/usePermissions";
import { usePhase } from "@/lib/socia/usePhase";

// Post Studio has no page of its own: open the first desk this person may use
const AIContentPage: React.FC = () => {
  const router = useRouter();
  const { ready, can } = usePermissions();
  const { known, showsPlatform } = usePhase();

  useEffect(() => {
    if (!ready || !known) return;
    const first = AI_CONTENT_PLATFORMS.find((p) => can(postStudioKey(p.platformKey)) && showsPlatform(p.platformKey));
    router.replace(first?.path ?? "/ai-content/youtube");
    // showsPlatform is rebuilt each render; the phase it reads only changes with /me, which also changes `can`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, known, can, router]);

  return null;
};

export default AIContentPage;
