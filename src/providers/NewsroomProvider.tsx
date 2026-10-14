"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import {
  Story,
  AIContent,
  PlatformEngagement,
  ActivityItem,
  Notification,
  Reporter,
  UserRole,
  RolePermissions,
  ROLE_PERMISSIONS,
  StoryStatus,
  AIContentStatus,
  ActivityAction,
  NotificationType,
  FtpNewsItem,
  SocialPost,
  SocialDraft,
  PostPayload,
  PendingPost,
  RejectReason,
  HashtagRule,
  HandleEntry,
} from "@/types/newsroom";
import { FtpFetchRun, fetchNewFtpNews } from "@/data/ftpNewsData";
import { UNDO_SECONDS, buildPost, draftToPayload, withDraft, withPublished } from "@/data/socialDesk";
import {
  generateAndStoreData,
  loadData,
  saveData,
  resetData,
  NewsroomData,
} from "@/data/demoData";

interface NewsroomContextType {
  // Data
  stories: Story[];
  aiContent: AIContent[];
  engagement: PlatformEngagement[];
  activity: ActivityItem[];
  notifications: Notification[];
  reporters: Reporter[];

  // Role
  currentRole: UserRole;
  setRole: (role: UserRole) => void;
  permissions: RolePermissions;

  // Story actions
  updateStoryStatus: (storyId: string, status: StoryStatus) => void;
  updateStory: (storyId: string, updates: Partial<Story>) => void;
  addStory: (story: Omit<Story, "id" | "createdAt" | "updatedAt">) => void;

  // AI Content actions
  updateAIContentStatus: (contentId: string, status: AIContentStatus) => void;
  updateAIContentCaption: (contentId: string, caption: string) => void;

  // Breaking Desk (FTP → social)
  ftpNews: FtpNewsItem[];
  socialPosts: SocialPost[];
  ftpSyncedAt: string;
  /** Pulls newly tagged breaking items from the FTP; returns how many arrived */
  fetchFtpNews: () => number;
  ftpFetchLog: FtpFetchRun[];
  /** Epoch ms of the next automatic FTP check */
  nextFetchAt: number;
  /** Sends a post immediately, with no undo window */
  publishSocialPost: (post: PostPayload) => SocialPost;
  socialDrafts: SocialDraft[];
  /** Posts waiting out their undo window, plus ones that went out in the last few seconds */
  pendingPosts: PendingPost[];
  /** Holds the post for the undo window, then sends it */
  queuePost: (post: PostPayload) => void;
  undoPost: (pendingId: string) => void;
  dismissPending: (pendingId: string) => void;
  saveDraft: (post: PostPayload) => void;
  scheduleDraft: (post: PostPayload, when: string) => void;
  rejectDraft: (post: PostPayload, reason: RejectReason, note: string) => void;
  /** Rejected → back to the queue; scheduled → back to the queue as a saved draft */
  restoreDraft: (draftId: string) => void;
  deleteDraft: (draftId: string) => void;
  rescheduleDraft: (draftId: string, when: string) => void;
  publishDraftNow: (draftId: string) => void;
  recallPost: (postId: string, reason: string) => void;
  hashtagRules: HashtagRule[];
  handleDirectory: HandleEntry[];
  saveHashtagRule: (rule: Omit<HashtagRule, "id"> & { id?: string }) => void;
  deleteHashtagRule: (id: string) => void;
  saveHandle: (entry: Omit<HandleEntry, "id" | "verifiedAt"> & { id?: string }) => void;
  deleteHandle: (id: string) => void;

  // Notifications
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  unreadCount: number;

  // Activity
  addActivity: (action: ActivityAction, actor: string, target: string, details?: string) => void;

  // Reset
  resetDemo: () => void;

  // Computed metrics
  metrics: {
    storiesPending: number;
    storiesApproved: number;
    storiesRejected: number;
    aiGeneratedPosts: number;
    pendingAIApproval: number;
    publishedToday: number;
  };
}

const NewsroomContext = createContext<NewsroomContextType | undefined>(undefined);

const ROLE_STORAGE_KEY = "newsroom_role";

/** Seconds between automatic FTP checks in the demo. The spec has the backend poll every 5 seconds. */
export const FTP_POLL_SECONDS = 20;

export function NewsroomProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<NewsroomData | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole>("admin");
  const [mounted, setMounted] = useState(false);

  // Initialize data
  useEffect(() => {
    const stored = loadData();
    if (stored) {
      setData(stored);
    } else {
      setData(generateAndStoreData());
    }
    const savedRole = localStorage.getItem(ROLE_STORAGE_KEY) as UserRole;
    if (savedRole && ROLE_PERMISSIONS[savedRole]) {
      setCurrentRole(savedRole);
    }
    setMounted(true);
  }, []);

  // Persist role
  const setRole = useCallback((role: UserRole) => {
    setCurrentRole(role);
    localStorage.setItem(ROLE_STORAGE_KEY, role);
  }, []);

  // Persist data whenever it changes
  useEffect(() => {
    if (data && mounted) {
      saveData(data);
    }
  }, [data, mounted]);

  const permissions = ROLE_PERMISSIONS[currentRole];

  // ─── Story Actions ────────────────────────────────────────────────────────
  const updateStoryStatus = useCallback((storyId: string, status: StoryStatus) => {
    setData((prev) => {
      if (!prev) return prev;
      const stories = prev.stories.map((s) =>
        s.id === storyId ? { ...s, status, updatedAt: new Date().toISOString() } : s
      );
      return { ...prev, stories };
    });
  }, []);

  const updateStory = useCallback((storyId: string, updates: Partial<Story>) => {
    setData((prev) => {
      if (!prev) return prev;
      const stories = prev.stories.map((s) =>
        s.id === storyId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
      );
      return { ...prev, stories };
    });
  }, []);

  const addStory = useCallback((story: Omit<Story, "id" | "createdAt" | "updatedAt">) => {
    setData((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      const newStory: Story = {
        ...story,
        id: `story-${Date.now()}`,
        createdAt: now,
        updatedAt: now,
      };
      return { ...prev, stories: [newStory, ...prev.stories] };
    });
  }, []);

  // ─── AI Content Actions ──────────────────────────────────────────────────
  const updateAIContentStatus = useCallback((contentId: string, status: AIContentStatus) => {
    setData((prev) => {
      if (!prev) return prev;
      const aiContent = prev.aiContent.map((c) =>
        c.id === contentId ? { ...c, status } : c
      );
      return { ...prev, aiContent };
    });
  }, []);

  const updateAIContentCaption = useCallback((contentId: string, caption: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const aiContent = prev.aiContent.map((c) =>
        c.id === contentId ? { ...c, caption } : c
      );
      return { ...prev, aiContent };
    });
  }, []);

  // ─── Breaking Desk ──────────────────────────────────────────────────────
  // Latest data for callbacks that run outside render (timers)
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Every check, manual or automatic, schedules the next one, so the countdown stays honest
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scheduleNext = useRef<() => void>(() => undefined);
  const [nextFetchAt, setNextFetchAt] = useState(() => Date.now() + FTP_POLL_SECONDS * 1000);

  const runFtpFetch = useCallback((trigger: FtpFetchRun["trigger"]): number => {
    scheduleNext.current();
    const current = dataRef.current;
    if (!current) return 0;
    const incoming = fetchNewFtpNews(current.ftpNews.map((n) => n.id));
    const run: FtpFetchRun = { id: `fetch-${Date.now()}`, at: new Date().toISOString(), trigger, added: incoming.length, headlines: incoming.map((n) => n.headline) };
    setData((prev) => {
      if (!prev) return prev;
      const fresh = incoming.filter((n) => !prev.ftpNews.some((p) => p.id === n.id));
      return { ...prev, ftpNews: [...fresh, ...prev.ftpNews], ftpSyncedAt: run.at, ftpFetchLog: [run, ...(prev.ftpFetchLog ?? [])].slice(0, 20) };
    });
    return incoming.length;
  }, []);

  const fetchFtpNews = useCallback(() => runFtpFetch("manual"), [runFtpFetch]);

  // The FTP is checked on a timer from every page; the backend's ingest worker does this for real
  useEffect(() => {
    if (!mounted) return;
    scheduleNext.current = () => {
      clearTimeout(fetchTimer.current);
      fetchTimer.current = setTimeout(() => runFtpFetch("auto"), FTP_POLL_SECONDS * 1000);
      setNextFetchAt(Date.now() + FTP_POLL_SECONDS * 1000);
    };
    scheduleNext.current();
    return () => clearTimeout(fetchTimer.current);
  }, [mounted, runFtpFetch]);

  const publishSocialPost = useCallback((payload: PostPayload) => {
    const post = buildPost(payload);
    setData((prev) => (prev ? withPublished(prev, post) : prev));
    return post;
  }, []);

  // Undo window: the post is held here and only written to socialPosts when its timer fires
  const [pendingPosts, setPendingPosts] = useState<PendingPost[]>([]);
  const pendingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissPending = useCallback((pendingId: string) => {
    clearTimeout(pendingTimers.current.get(pendingId));
    pendingTimers.current.delete(pendingId);
    setPendingPosts((prev) => prev.filter((p) => p.id !== pendingId));
  }, []);

  const queuePost = useCallback((payload: PostPayload) => {
    const id = `pending-${Date.now()}`;
    setPendingPosts((prev) => [...prev, { id, payload, sendAt: new Date(Date.now() + UNDO_SECONDS * 1000).toISOString() }]);
    pendingTimers.current.set(
      id,
      setTimeout(() => {
        const post = buildPost(payload);
        setData((prev) => (prev ? withPublished(prev, post) : prev));
        setPendingPosts((prev) => prev.map((p) => (p.id === id ? { ...p, post } : p)));
        // Keep the "posted" confirmation on screen briefly, then clear it
        pendingTimers.current.set(id, setTimeout(() => dismissPending(id), 8000));
      }, UNDO_SECONDS * 1000)
    );
  }, [dismissPending]);

  const undoPost = useCallback((pendingId: string) => dismissPending(pendingId), [dismissPending]);

  useEffect(() => {
    const timers = pendingTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const saveDraft = useCallback((post: PostPayload) => {
    setData((prev) => (prev ? withDraft(prev, { ...post, status: "saved" }) : prev));
  }, []);

  const scheduleDraft = useCallback((post: PostPayload, when: string) => {
    setData((prev) => (prev ? withDraft(prev, { ...post, status: "scheduled", scheduledFor: when }) : prev));
  }, []);

  const rejectDraft = useCallback((post: PostPayload, reason: RejectReason, note: string) => {
    setData((prev) => (prev ? withDraft(prev, { ...post, status: "rejected", rejectReason: reason, rejectNote: note }) : prev));
  }, []);

  const updateDrafts = useCallback((fn: (drafts: SocialDraft[]) => SocialDraft[]) => {
    setData((prev) => (prev ? { ...prev, socialDrafts: fn(prev.socialDrafts) } : prev));
  }, []);

  const restoreDraft = useCallback((draftId: string) => {
    updateDrafts((drafts) =>
      drafts.flatMap((d) => {
        if (d.id !== draftId) return [d];
        if (d.status === "scheduled") return [{ ...d, status: "saved" as const, scheduledFor: undefined, updatedAt: new Date().toISOString() }];
        return [];
      })
    );
  }, [updateDrafts]);

  const deleteDraft = useCallback((draftId: string) => {
    updateDrafts((drafts) => drafts.map((d) => (d.id === draftId ? { ...d, status: "deleted" as const, updatedAt: new Date().toISOString() } : d)));
  }, [updateDrafts]);

  const rescheduleDraft = useCallback((draftId: string, when: string) => {
    updateDrafts((drafts) => drafts.map((d) => (d.id === draftId ? { ...d, scheduledFor: when, updatedAt: new Date().toISOString() } : d)));
  }, [updateDrafts]);

  const publishDraftNow = useCallback((draftId: string) => {
    setData((prev) => {
      const draft = prev?.socialDrafts.find((d) => d.id === draftId);
      if (!prev || !draft) return prev;
      return withPublished(prev, buildPost(draftToPayload(draft)));
    });
  }, []);

  // Send scheduled posts when they fall due (the backend's publish worker does this for real)
  useEffect(() => {
    if (!mounted) return;
    const tick = () => {
      const now = Date.now();
      setData((prev) => {
        if (!prev) return prev;
        const due = prev.socialDrafts.filter((d) => d.status === "scheduled" && d.scheduledFor && new Date(d.scheduledFor).getTime() <= now);
        return due.reduce((acc, d) => withPublished(acc, buildPost(draftToPayload(d))), prev);
      });
    };
    tick();
    const timer = setInterval(tick, 15000);
    return () => clearInterval(timer);
  }, [mounted]);

  const recallPost = useCallback((postId: string, reason: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const post = prev.socialPosts.find((p) => p.id === postId);
      if (!post) return prev;
      const recalled: ActivityItem = { id: `a-${Date.now()}`, action: "rejected", actor: post.postedBy, target: `Recalled ${post.platform}: ${post.headline}`, timestamp: new Date().toISOString(), details: reason };
      return {
        ...prev,
        socialPosts: prev.socialPosts.map((p) => (p.id === postId ? { ...p, status: "recalled" as const, recalledAt: new Date().toISOString(), recallReason: reason } : p)),
        activity: [recalled, ...prev.activity],
      };
    });
  }, []);

  const saveHashtagRule = useCallback((rule: Omit<HashtagRule, "id"> & { id?: string }) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...rule, id: rule.id ?? `rule-${Date.now()}` };
      const exists = prev.hashtagRules.some((r) => r.id === next.id);
      return { ...prev, hashtagRules: exists ? prev.hashtagRules.map((r) => (r.id === next.id ? next : r)) : [...prev.hashtagRules, next] };
    });
  }, []);

  const deleteHashtagRule = useCallback((id: string) => {
    setData((prev) => (prev ? { ...prev, hashtagRules: prev.hashtagRules.filter((r) => r.id !== id) } : prev));
  }, []);

  const saveHandle = useCallback((entry: Omit<HandleEntry, "id" | "verifiedAt"> & { id?: string }) => {
    setData((prev) => {
      if (!prev) return prev;
      const next: HandleEntry = { ...entry, id: entry.id ?? `handle-${Date.now()}`, verifiedAt: new Date().toISOString() };
      const exists = prev.handleDirectory.some((h) => h.id === next.id);
      return { ...prev, handleDirectory: exists ? prev.handleDirectory.map((h) => (h.id === next.id ? next : h)) : [...prev.handleDirectory, next] };
    });
  }, []);

  const deleteHandle = useCallback((id: string) => {
    setData((prev) => (prev ? { ...prev, handleDirectory: prev.handleDirectory.filter((h) => h.id !== id) } : prev));
  }, []);

  // ─── Notifications ──────────────────────────────────────────────────────
  const markNotificationRead = useCallback((id: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const notifications = prev.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return { ...prev, notifications };
    });
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setData((prev) => {
      if (!prev) return prev;
      const notifications = prev.notifications.map((n) => ({ ...n, read: true }));
      return { ...prev, notifications };
    });
  }, []);

  const unreadCount = data?.notifications.filter((n) => !n.read).length ?? 0;

  // ─── Activity ──────────────────────────────────────────────────────────
  const addActivity = useCallback((action: ActivityAction, actor: string, target: string, details?: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const newItem: ActivityItem = {
        id: `a-${Date.now()}`,
        action,
        actor,
        target,
        timestamp: new Date().toISOString(),
        details,
      };
      return { ...prev, activity: [newItem, ...prev.activity] };
    });
  }, []);

  // ─── Reset ────────────────────────────────────────────────────────────
  const resetDemo = useCallback(() => {
    setData(resetData());
    setCurrentRole("admin");
    localStorage.setItem(ROLE_STORAGE_KEY, "admin");
  }, []);

  // ─── Metrics ─────────────────────────────────────────────────────────
  const metrics = (() => {
    if (!data) {
      return {
        storiesPending: 0,
        storiesApproved: 0,
        storiesRejected: 0,
        aiGeneratedPosts: 0,
        pendingAIApproval: 0,
        publishedToday: 0,
      };
    }
    const today = new Date().toDateString();
    return {
      storiesPending: data.stories.filter((s) => ["pending_review", "pending_approval", "assigned"].includes(s.status)).length,
      storiesApproved: data.stories.filter((s) => s.status === "approved").length,
      storiesRejected: data.stories.filter((s) => s.status === "rejected").length,
      aiGeneratedPosts: data.aiContent.length,
      pendingAIApproval: data.aiContent.filter((c) => c.status === "pending").length,
      publishedToday: data.stories.filter((s) => s.status === "published" && new Date(s.updatedAt).toDateString() === today).length,
    };
  })();

  if (!mounted || !data) return null;

  return (
    <NewsroomContext.Provider
      value={{
        stories: data.stories,
        aiContent: data.aiContent,
        engagement: data.engagement,
        activity: data.activity,
        notifications: data.notifications,
        reporters: data.reporters,
        currentRole,
        setRole,
        permissions,
        updateStoryStatus,
        updateStory,
        addStory,
        updateAIContentStatus,
        updateAIContentCaption,
        ftpNews: data.ftpNews,
        socialPosts: data.socialPosts,
        ftpSyncedAt: data.ftpSyncedAt,
        fetchFtpNews,
        ftpFetchLog: data.ftpFetchLog ?? [],
        nextFetchAt,
        publishSocialPost,
        socialDrafts: data.socialDrafts,
        pendingPosts,
        queuePost,
        undoPost,
        dismissPending,
        saveDraft,
        scheduleDraft,
        rejectDraft,
        restoreDraft,
        deleteDraft,
        rescheduleDraft,
        publishDraftNow,
        recallPost,
        hashtagRules: data.hashtagRules,
        handleDirectory: data.handleDirectory,
        saveHashtagRule,
        deleteHashtagRule,
        saveHandle,
        deleteHandle,
        markNotificationRead,
        markAllNotificationsRead,
        unreadCount,
        addActivity,
        resetDemo,
        metrics,
      }}
    >
      {children}
    </NewsroomContext.Provider>
  );
}

export function useNewsroom() {
  const context = useContext(NewsroomContext);
  if (!context) {
    throw new Error("useNewsroom must be used within a NewsroomProvider");
  }
  return context;
}
