"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AI_CONTENT_PLATFORMS } from "@/components/leftNavigation/aiContentPlatforms";
import { postStudioKey } from "@/lib/access/catalogue";
import { usePermissions } from "@/lib/access/usePermissions";

// Post Studio has no page of its own: open the first desk this person may use
const AIContentPage: React.FC = () => {
  const router = useRouter();
  const { ready, can } = usePermissions();

  useEffect(() => {
    if (!ready) return;
    const first = AI_CONTENT_PLATFORMS.find((p) => can(postStudioKey(p.platformKey)));
    router.replace(first?.path ?? "/ai-content/youtube");
  }, [ready, can, router]);

  return null;
};

export default AIContentPage;
