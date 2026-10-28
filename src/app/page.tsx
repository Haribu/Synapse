"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { FeedSidebar } from "@/components/FeedSidebar";
import { ItemList } from "@/components/ItemList";
import { ReaderView } from "@/components/ReaderView";
import { StatsView } from "@/components/StatsView";
import { FeedManagerView } from "@/components/FeedManagerView";
import { SettingsView } from "@/components/SettingsView";
import { FeedbackModal } from "@/components/FeedbackModal";
import { AccessibilityModal } from "@/components/AccessibilityModal";
import { GuideModal } from "@/components/GuideModal";
import { CommandPaletteModal } from "@/components/CommandPaletteModal";
import { OnboardingModal } from "@/components/OnboardingModal";
import { UndoToast, UndoAction } from "@/components/UndoToast";
import {
  AccessibilitySettings,
  DEFAULT_A11Y_SETTINGS,
  loadAccessibilitySettings,
  applyGlobalAccessibility,
} from "@/lib/utils/accessibility";
import { Menu, Inbox, Layers, Star, Rss, Briefcase, WifiOff } from "lucide-react";
import {
  saveArticlesToOfflineCache,
  getOfflineArticles,
  saveFeedsToOfflineCache,
  getOfflineFeeds,
  queueOfflineMutation,
  flushOfflineMutations,
} from "@/lib/services/offline-cache";
import { clusterRelatedArticles } from "@/lib/utils/clustering";

type View =
  | "all"
  | "unread"
  | "starred"
  | "watch_later"
  | "work"
  | "reading_list"
  | "board"
  | "stats"
  | "feed_manager"
  | "settings";

const PAGE_SIZE = 50;

const isDesktop = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

export default function HomePage() {
  const [feeds, setFeeds] = useState<any[]>([]);
  const [boards, setBoards] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const [selectedView, setSelectedView] = useState<View>("unread");
  const [feedManagerTab, setFeedManagerTab] = useState<
    "all" | "audit" | "empty" | "unreachable" | "autofetch" | "duplicates" | "logs"
  >("all");
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [a11yModalOpen, setA11yModalOpen] = useState(false);
  const [onboardingModalOpen, setOnboardingModalOpen] = useState(false);
  const [onboardingIsDryRun, setOnboardingIsDryRun] = useState(false);
  const [a11ySettings, setA11ySettings] = useState<AccessibilitySettings>(DEFAULT_A11Y_SETTINGS);

  const [sidebarWidth, setSidebarWidth] = useState<number>(256);
  const [itemListWidth, setItemListWidth] = useState<number>(360);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [itemListCollapsed, setItemListCollapsed] = useState<boolean>(false);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [displayedItems, setDisplayedItems] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);

  const refreshUserProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (data.profile) setUserProfile(data.profile);
    } catch (e) {
      console.warn("Failed to load user profile", e);
    }
  }, []);

  const handleOpenOnboardingPreview = useCallback(() => {
    setOnboardingIsDryRun(true);
    setOnboardingModalOpen(true);
  }, []);

  useEffect(() => {
    const loaded = loadAccessibilitySettings();
    setA11ySettings(loaded);
    applyGlobalAccessibility(loaded);

    const savedSb = localStorage.getItem("synapse_sidebar_width");
    if (savedSb) setSidebarWidth(Math.max(200, Math.min(450, parseInt(savedSb, 10))));
    const savedIl = localStorage.getItem("synapse_itemlist_width");
    if (savedIl) setItemListWidth(Math.max(260, Math.min(600, parseInt(savedIl, 10))));
    const savedSbCollapsed = localStorage.getItem("synapse_sidebar_collapsed");
    if (savedSbCollapsed === "true") setSidebarCollapsed(true);
    refreshUserProfile();

    // Check for onboarding / welcome preview URL flag (?onboarding=preview, ?welcome=preview, etc.)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const isWelcomePreview =
        params.get("onboarding") === "preview" ||
        params.get("welcome") === "preview" ||
        params.get("preview") === "onboarding" ||
        params.get("preview") === "welcome" ||
        params.get("dryRun") === "true" ||
        params.has("welcome_preview");

      if (isWelcomePreview) {
        setOnboardingIsDryRun(true);
        setOnboardingModalOpen(true);
      }
    }
  }, [refreshUserProfile]);

  const startResizeSidebar = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const newW = Math.max(200, Math.min(450, startW + (moveEvent.clientX - startX)));
      setSidebarWidth(newW);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      setSidebarWidth((finalW) => {
        localStorage.setItem("synapse_sidebar_width", String(finalW));
        return finalW;
      });
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const startResizeItemList = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = itemListWidth;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const newW = Math.max(260, Math.min(600, startW + (moveEvent.clientX - startX)));
      setItemListWidth(newW);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      setItemListWidth((finalW) => {
        localStorage.setItem("synapse_itemlist_width", String(finalW));
        return finalW;
      });
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const refreshFeedsAndBoards = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const cached = await getOfflineFeeds();
      if (cached && cached.length > 0) setFeeds(cached);
      return;
    }

    try {
      const [feedsRes, boardsRes] = await Promise.all([fetch("/api/feeds"), fetch("/api/boards")]);
      const feedsData = await feedsRes.json();
      const boardsData = await boardsRes.json();
      if (feedsData.feeds) {
        setFeeds(feedsData.feeds);
        saveFeedsToOfflineCache(feedsData.feeds);
        if (feedsData.feeds.length === 0) {
          setOnboardingModalOpen(true);
        }
      }
      if (boardsData.boards) setBoards(boardsData.boards);
    } catch (err) {
      console.warn("Failed to load feeds/boards online, falling back to cache", err);
      const cached = await getOfflineFeeds();
      if (cached && cached.length > 0) setFeeds(cached);
    }
  }, []);

  // Load items for the current view. Never auto-selects: selection is the user's call
  // (auto-selecting on mobile trapped the reader open with no way back to the list).
  const refreshItems = useCallback(async () => {
    try {
      setItemsLoading(true);

      const filterOptions = {
        unreadOnly: selectedView === "unread",
        starredOnly: selectedView === "starred" || selectedView === "watch_later",
        videoOnly: selectedView === "watch_later",
        textOnly: selectedView === "starred",
        workOnly: selectedView === "work",
        feedId: selectedFeedId || undefined,
        category: selectedCategory || undefined,
        searchQuery: searchQuery || undefined,
      };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const cached = await getOfflineArticles(filterOptions);
        setItems(cached);
        return;
      }

      if (selectedView === "reading_list") {
        const res = await fetch("/api/reading-list");
        const data = await res.json();
        const loadedReadingList = (data.items || []).map((it: any) => ({
          ...it,
          feedTitle: it.sourceContext ? `Newsletter: ${it.sourceContext}` : "Curated Link",
        }));
        setItems(loadedReadingList);
        saveArticlesToOfflineCache(loadedReadingList);
        return;
      }

      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (selectedView === "unread") params.set("unreadOnly", "true");
      if (selectedView === "starred") {
        params.set("starredOnly", "true");
        params.set("textOnly", "true");
      }
      if (selectedView === "watch_later") {
        params.set("starredOnly", "true");
        params.set("videoOnly", "true");
      }
      if (selectedView === "work") params.set("workOnly", "true");
      if (selectedFeedId) params.set("feedId", selectedFeedId);
      if (selectedCategory) params.set("category", selectedCategory);
      if (searchQuery.trim().length > 0) params.set("q", searchQuery.trim());

      const res = await fetch(`/api/items?${params.toString()}`);
      const data = await res.json();

      if ((!data.items || data.items.length === 0) && selectedFeedId && !searchQuery.trim()) {
        // Empty feed: hydrate it from the network once.
        try {
          await fetch(`/api/feeds/${selectedFeedId}/check`, { method: "POST" });
          const refetched = await fetch(`/api/items?${params.toString()}`);
          const refetchedData = await refetched.json();
          const itemsResult = refetchedData.items || [];
          setItems(itemsResult);
          saveArticlesToOfflineCache(itemsResult);
          refreshFeedsAndBoards();
        } catch (fetchErr) {
          console.warn("Background feed hydrate check failed", fetchErr);
          setItems([]);
        }
      } else {
        const itemsResult = data.items || [];
        setItems(itemsResult);
        saveArticlesToOfflineCache(itemsResult);
      }
    } catch (err) {
      console.warn("Failed to load items online, falling back to cache", err);
      const cached = await getOfflineArticles({
        unreadOnly: selectedView === "unread",
        starredOnly: selectedView === "starred" || selectedView === "watch_later",
        videoOnly: selectedView === "watch_later",
        textOnly: selectedView === "starred",
        workOnly: selectedView === "work",
        feedId: selectedFeedId || undefined,
        category: selectedCategory || undefined,
        searchQuery: searchQuery || undefined,
      });
      setItems(cached);
    } finally {
      setItemsLoading(false);
    }
  }, [selectedView, selectedFeedId, selectedCategory, searchQuery, limit, refreshFeedsAndBoards]);

  useEffect(() => {
    refreshFeedsAndBoards();
  }, [refreshFeedsAndBoards]);

  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  // Desktop only: show the first article in the right-hand pane.
  useEffect(() => {
    if (
      isDesktop() &&
      !selectedItemId &&
      items.length > 0 &&
      selectedView !== "stats" &&
      selectedView !== "feed_manager"
    ) {
      setSelectedItemId(items[0].id);
    }
  }, [items, selectedItemId, selectedView]);

  const activeItem = items.find((it) => it.id === selectedItemId) || null;
  const activeIndex = items.findIndex((it) => it.id === selectedItemId);

  const totalUnread = useMemo(
    () => feeds.reduce((sum, f) => sum + (f.unreadCount || 0), 0),
    [feeds]
  );

  const viewTitle = useMemo(() => {
    if (selectedFeedId) return feeds.find((f) => f.id === selectedFeedId)?.title || "Feed";
    if (selectedCategory) return selectedCategory;
    if (selectedView === "starred") return "Read Later (Articles)";
    if (selectedView === "watch_later") return "Watch Later (Videos)";
    if (selectedView === "work") return "Work Items";
    if (selectedView === "unread") return "Triage";
    if (selectedView === "reading_list") return "Research Inbox";
    return "All Articles";
  }, [selectedView, selectedFeedId, selectedCategory, feeds]);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      const flushed = await flushOfflineMutations();
      if (flushed > 0) {
        console.log(`[Offline Sync] Replayed ${flushed} offline mutations to server`);
      }
      refreshFeedsAndBoards();
      refreshItems();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    if (typeof window !== "undefined") {
      setIsOffline(!navigator.onLine);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, [refreshFeedsAndBoards, refreshItems]);

  const isCuratedView =
    selectedView === "starred" ||
    selectedView === "watch_later" ||
    selectedView === "reading_list" ||
    selectedView === "work";

  const clusters = useMemo(() => {
    if (a11ySettings?.disableGrouping || isCuratedView) {
      return items.map((item) => ({ primary: item, relatedStories: [] }));
    }
    return clusterRelatedArticles(items);
  }, [items, a11ySettings?.disableGrouping, isCuratedView]);

  const patchItem = async (idOrIds: string | string[], body: Record<string, any>) => {
    const rawIds = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    const ids = rawIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    if (ids.length === 0) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      for (const id of ids) {
        if (body.isRead !== undefined) queueOfflineMutation("toggle_read", id, body.isRead);
        if (body.isStarred !== undefined) queueOfflineMutation("toggle_star", id, body.isStarred);
        if (body.isWork !== undefined) queueOfflineMutation("toggle_work", id, body.isWork);
      }
      return;
    }

    try {
      await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, ...body }),
      });
    } catch {
      for (const id of ids) {
        if (body.isRead !== undefined) queueOfflineMutation("toggle_read", id, body.isRead);
        if (body.isStarred !== undefined) queueOfflineMutation("toggle_star", id, body.isStarred);
        if (body.isWork !== undefined) queueOfflineMutation("toggle_work", id, body.isWork);
      }
    }
  };

  const handleToggleRead = async (id: string, isRead: boolean, cascade: boolean = true) => {
    try {
      let idsToUpdate = [id];

      // When marking as read, cascade to grouped stories in the same cluster.
      // When marking as unread (undo), strictly affect only the targeted article.
      if (isRead && cascade) {
        const cluster = clusters.find((c) => c.primary.id === id);
        if (cluster && cluster.relatedStories.length > 0) {
          const unreadRelatedIds = cluster.relatedStories.filter((r) => !r.isRead).map((r) => r.id);
          idsToUpdate = [id, ...unreadRelatedIds];
        }
      }

      await patchItem(idsToUpdate, { isRead });
      const updateSet = new Set(idsToUpdate);
      setItems((prev) => prev.map((it) => (updateSet.has(it.id) ? { ...it, isRead } : it)));
      refreshFeedsAndBoards();
    } catch (err) {
      console.error("Failed to toggle read", err);
    }
  };

  const handleToggleStar = async (id: string, isStarred: boolean) => {
    try {
      const targetItem = items.find((i) => i.id === id);
      const isFromReadingList =
        selectedView === "reading_list" || (targetItem && !targetItem.feedId);

      if (isFromReadingList) {
        await fetch("/api/reading-list", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, isStarred }),
        });
      } else {
        await patchItem(id, { isStarred });
      }
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, isStarred } : it)));
    } catch (err) {
      console.error("Failed to toggle star", err);
    }
  };

  const handleToggleWork = async (id: string, isWork: boolean) => {
    try {
      const targetItem = items.find((i) => i.id === id);
      const isFromReadingList =
        selectedView === "reading_list" || (targetItem && !targetItem.feedId);

      if (isFromReadingList) {
        await fetch("/api/reading-list", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, isWork }),
        });
      } else {
        await patchItem(id, { isWork });
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, isWork, workDispatchedAt: isWork ? it.workDispatchedAt : null }
            : it
        )
      );
    } catch (err) {
      console.error("Failed to toggle work flag", err);
    }
  };

  // Opening an article marks it read, cascading to related stories if it is a cluster primary.
  const handleSelectItem = (item: any, relatedStories?: any[]) => {
    setSelectedItemId(item.id);
    if (selectedView !== "reading_list") {
      const related =
        relatedStories || clusters.find((c) => c.primary.id === item.id)?.relatedStories || [];
      const unreadRelatedIds = related.filter((r: any) => !r.isRead).map((r: any) => r.id);

      if (!item.isRead || unreadRelatedIds.length > 0) {
        const idsToMark = Array.from(new Set([item.id, ...unreadRelatedIds]));
        patchItem(idsToMark, { isRead: true })
          .then(() => {
            const markSet = new Set(idsToMark);
            setItems((prev) =>
              prev.map((it) => (markSet.has(it.id) ? { ...it, isRead: true } : it))
            );
            refreshFeedsAndBoards();
          })
          .catch((err) => {
            console.error("Failed to cascade mark read", err);
          });
      }
    }
  };

  const handleDeleteItem = (id: string) => {
    if (selectedView === "reading_list") {
      const removedItem = items.find((it) => it.id === id);
      if (!removedItem) return;

      // Optimistically hide from UI
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (selectedItemId === id) setSelectedItemId(null);

      // Offer 5-second undo toast
      setUndoAction({
        id,
        message: `Deleted "${removedItem.title.slice(0, 28)}..."`,
        onUndo: () => {
          setItems((prev) => [removedItem, ...prev]);
        },
        onCommit: async () => {
          try {
            await fetch(`/api/reading-list?id=${id}`, { method: "DELETE" });
          } catch (err) {
            console.error("Failed to commit deletion", err);
          }
        },
      });
    }
  };

  const handleDeleteFeed = (feedId: string) => {
    const feedToDelete = feeds.find((f) => f.id === feedId);
    const feedTitle = feedToDelete?.title || "feed";
    const originalFeeds = [...feeds];
    setFeeds((prev) => prev.filter((f) => f.id !== feedId));
    if (selectedFeedId === feedId) {
      setSelectedFeedId(null);
      setSelectedItemId(null);
    }

    setUndoAction({
      id: feedId,
      message: `Deleted feed "${feedTitle.slice(0, 24)}"`,
      onUndo: () => {
        setFeeds(originalFeeds);
      },
      onCommit: async () => {
        try {
          await fetch(`/api/feeds/${feedId}`, { method: "DELETE" });
          refreshFeedsAndBoards();
          refreshItems();
        } catch (err) {
          console.error("Failed to delete feed", err);
        }
      },
    });
  };

  const currentNavItems = displayedItems.length > 0 ? displayedItems : items;
  const activeNavIndex = currentNavItems.findIndex((it) => it.id === selectedItemId);

  const goToNavIndex = (index: number) => {
    if (index >= 0 && index < currentNavItems.length) handleSelectItem(currentNavItems[index]);
  };
  const handleNext = () => {
    if (activeNavIndex >= 0 && activeNavIndex < currentNavItems.length - 1) {
      goToNavIndex(activeNavIndex + 1);
    } else if (activeIndex >= 0 && activeIndex < items.length - 1) {
      handleSelectItem(items[activeIndex + 1]);
    }
  };
  const handlePrev = () => {
    if (activeNavIndex > 0) {
      goToNavIndex(activeNavIndex - 1);
    } else if (activeIndex > 0) {
      handleSelectItem(items[activeIndex - 1]);
    }
  };

  const handleMarkAllRead = async () => {
    const scope = selectedFeedId
      ? `"${viewTitle}"`
      : selectedCategory
        ? `the "${selectedCategory}" category`
        : "everything";
    if (!window.confirm(`Mark all articles in ${scope} as read?`)) return;
    try {
      await fetch("/api/items/mark-all-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedId: selectedFeedId, category: selectedCategory }),
      });
      setSelectedItemId(null);
      await Promise.all([refreshItems(), refreshFeedsAndBoards()]);
    } catch (err) {
      console.error("Mark all read failed", err);
    }
  };

  const selectView = (view: View, id?: string | null, category?: string | null) => {
    setSelectedView(view);
    setSelectedFeedId(id || null);
    setSelectedCategory(category || null);
    setSelectedItemId(null);
    setSearchQuery("");
    setLimit(PAGE_SIZE);
    setMobileSidebarOpen(false);
  };

  // Keyboard navigation (desktop) - strictly obeys active list filters (displayedItems)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        if (activeNavIndex === -1 && currentNavItems.length > 0) {
          handleSelectItem(currentNavItems[0]);
        } else if (activeNavIndex < currentNavItems.length - 1) {
          goToNavIndex(activeNavIndex + 1);
        }
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        if (activeNavIndex > 0) {
          goToNavIndex(activeNavIndex - 1);
        }
      } else if (e.key === "m" && activeItem) {
        e.preventDefault();
        handleToggleRead(activeItem.id, !activeItem.isRead);
      } else if (e.key === "s" && activeItem) {
        e.preventDefault();
        handleToggleStar(activeItem.id, !activeItem.isStarred);
      } else if (e.key === "Escape") {
        setSelectedItemId(null);
      } else if (e.key === "A" && e.shiftKey) {
        e.preventDefault();
        handleMarkAllRead();
      } else if (e.key === "[") {
        e.preventDefault();
        setSidebarCollapsed((prev) => {
          const next = !prev;
          localStorage.setItem("synapse_sidebar_collapsed", String(next));
          return next;
        });
      } else if (e.key === "]") {
        e.preventDefault();
        if (selectedItemId) {
          setItemListCollapsed((prev) => !prev);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNavItems, selectedItemId, activeItem, activeNavIndex]);

  const readingOnMobile =
    !!selectedItemId &&
    selectedView !== "stats" &&
    selectedView !== "feed_manager" &&
    selectedView !== "settings";

  const tabs: {
    key: string;
    label: string;
    icon: React.ReactNode;
    active: boolean;
    onClick: () => void;
    badge?: number;
  }[] = [
    {
      key: "unread",
      label: "Triage",
      icon: <Inbox className="w-5 h-5" />,
      active: selectedView === "unread" && !selectedFeedId && !selectedCategory,
      onClick: () => selectView("unread"),
      badge: totalUnread,
    },
    {
      key: "all",
      label: "All",
      icon: <Layers className="w-5 h-5" />,
      active: selectedView === "all" && !selectedFeedId && !selectedCategory,
      onClick: () => selectView("all"),
    },
    {
      key: "starred",
      label: "Saved",
      icon: <Star className="w-5 h-5" />,
      active: selectedView === "starred" || selectedView === "watch_later",
      onClick: () => selectView("starred"),
    },
    {
      key: "work",
      label: "Work",
      icon: <Briefcase className="w-5 h-5" />,
      active: selectedView === "work",
      onClick: () => selectView("work"),
    },
    {
      key: "feeds",
      label: "Feeds",
      icon: <Rss className="w-5 h-5" />,
      active: mobileSidebarOpen,
      onClick: () => setMobileSidebarOpen(true),
    },
  ];

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors">
      {isOffline && (
        <div className="bg-amber-500/15 dark:bg-amber-500/20 border-b border-amber-500/30 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between z-30 shrink-0 animate-in fade-in">
          <div className="flex items-center gap-2 font-medium">
            <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              Offline Mode — Browsing local cached articles. Read and star actions will sync when
              back online.
            </span>
          </div>
        </div>
      )}
      <main className="flex flex-1 min-h-0 w-full overflow-hidden relative">
        {mobileSidebarOpen && (
          <div
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm xl:hidden animate-in fade-in"
          />
        )}

        <div
          className={`fixed inset-y-0 left-0 z-50 transform xl:relative xl:translate-x-0 transition-transform duration-200 ease-in-out flex-shrink-0 ${
            sidebarCollapsed ? "xl:hidden" : ""
          } ${
            mobileSidebarOpen
              ? "translate-x-0 pointer-events-auto visible"
              : "-translate-x-full pointer-events-none invisible xl:visible xl:pointer-events-auto xl:translate-x-0"
          }`}
        >
          <FeedSidebar
            width={sidebarWidth}
            feeds={feeds}
            boards={boards}
            totalUnread={totalUnread}
            selectedCategory={selectedCategory}
            selectedFeedId={selectedFeedId}
            selectedView={selectedView}
            onSelectView={(view, id) => selectView(view as View, id)}
            onSelectCategory={(cat) => selectView("all", null, cat)}
            onRefreshFeeds={() => {
              refreshFeedsAndBoards();
              refreshItems();
            }}
            onCloseMobile={() => setMobileSidebarOpen(false)}
            onOpenGuide={() => setGuideModalOpen(true)}
            onOpenFeedback={() => setFeedbackModalOpen(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          />
        </div>

        {/* Draggable Splitter: Sidebar / ItemList (Wide Touch & Mouse Hit Area) */}
        {!sidebarCollapsed && (
          <div
            onPointerDown={startResizeSidebar}
            className="hidden xl:flex w-3 -mx-1 items-center justify-center cursor-col-resize shrink-0 z-20 select-none touch-none group"
            title="Drag to resize sidebar"
          >
            <div className="w-0.5 h-full group-hover:w-1 group-hover:bg-blue-500/60 group-active:bg-blue-600 transition-all rounded-full" />
          </div>
        )}

        {selectedView === "stats" ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="xl:hidden h-14 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center bg-white dark:bg-slate-950">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 dark:text-slate-400 rounded-md"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="font-bold text-sm ml-2">Stats &amp; Analytics</span>
            </div>
            <StatsView
              onNavigateView={(view, tab) => {
                setSelectedView(view);
                if (view === "feed_manager" && tab) {
                  setFeedManagerTab(tab as any);
                }
                setSelectedItemId(null);
              }}
            />
          </div>
        ) : selectedView === "feed_manager" ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="xl:hidden h-14 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center bg-white dark:bg-slate-950">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 dark:text-slate-400 rounded-md"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="font-bold text-sm ml-2">Manage Feeds</span>
            </div>
            <FeedManagerView
              initialTab={feedManagerTab}
              onFeedListChanged={() => {
                refreshFeedsAndBoards();
                refreshItems();
              }}
              onSelectFeed={(feedId) => {
                setSelectedView("all");
                setSelectedFeedId(feedId);
                setSelectedCategory(null);
                setSearchQuery("");
              }}
            />
          </div>
        ) : selectedView === "settings" ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="xl:hidden h-14 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center bg-white dark:bg-slate-950">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 dark:text-slate-400 rounded-md"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="font-bold text-sm ml-2">Settings</span>
            </div>
            <SettingsView
              settings={a11ySettings}
              onSettingsChange={setA11ySettings}
              onOpenGuide={() => setGuideModalOpen(true)}
              onOpenOnboardingPreview={handleOpenOnboardingPreview}
            />
          </div>
        ) : (
          <div className="flex-1 flex h-full overflow-hidden relative">
            <div
              className={`w-full md:w-auto h-full ${selectedItemId ? (itemListCollapsed ? "hidden" : "hidden md:block") : "block"}`}
            >
              <ItemList
                width={itemListWidth}
                items={items}
                title={viewTitle}
                selectedView={selectedView}
                unreadCount={items.filter((i) => !i.isRead).length}
                selectedItemId={selectedItemId}
                searchQuery={searchQuery}
                loading={itemsLoading}
                hasMore={selectedView !== "reading_list" && items.length >= limit}
                onSearchChange={setSearchQuery}
                onSelectItem={handleSelectItem}
                onToggleRead={handleToggleRead}
                onToggleStar={handleToggleStar}
                onSelectView={(v) => {
                  setSelectedView(v);
                  setSelectedFeedId(null);
                  setSelectedCategory(null);
                }}
                onOpenSidebar={() => setMobileSidebarOpen(true)}
                onMarkAllRead={handleMarkAllRead}
                onRefresh={() => {
                  refreshItems();
                  refreshFeedsAndBoards();
                }}
                onLoadMore={() => setLimit((l) => l + PAGE_SIZE)}
                onOpenFeedback={() => setFeedbackModalOpen(true)}
                onDeleteFeed={selectedFeedId ? () => handleDeleteFeed(selectedFeedId) : undefined}
                onDisplayedItemsChange={setDisplayedItems}
                a11ySettings={a11ySettings}
                onToggleCollapseSidebar={() => {
                  setSidebarCollapsed((prev) => {
                    const next = !prev;
                    localStorage.setItem("synapse_sidebar_collapsed", String(next));
                    return next;
                  });
                }}
                isSidebarCollapsed={sidebarCollapsed}
                workDigestName={userProfile?.workDigestName || "Work"}
              />
            </div>

            {/* Draggable Splitter: ItemList / ReaderView (Wide Touch & Mouse Hit Area) */}
            {!itemListCollapsed && (
              <div
                onPointerDown={startResizeItemList}
                className="hidden md:flex w-3 -mx-1 items-center justify-center cursor-col-resize shrink-0 z-20 select-none touch-none group"
                title="Drag to resize article list"
              >
                <div className="w-0.5 h-full group-hover:w-1 group-hover:bg-blue-500/60 group-active:bg-blue-600 transition-all rounded-full" />
              </div>
            )}

            <div
              className={`flex-1 h-full min-w-0 ${selectedItemId ? "block" : "hidden md:block"}`}
            >
              <ReaderView
                item={activeItem}
                onToggleRead={handleToggleRead}
                onToggleStar={handleToggleStar}
                onToggleWork={handleToggleWork}
                onBack={() => setSelectedItemId(null)}
                onPrev={activeNavIndex > 0 || activeIndex > 0 ? handlePrev : undefined}
                onNext={
                  (activeNavIndex >= 0 && activeNavIndex < currentNavItems.length - 1) ||
                  (activeIndex >= 0 && activeIndex < items.length - 1)
                    ? handleNext
                    : undefined
                }
                onOpenFeedback={() => setFeedbackModalOpen(true)}
                a11ySettings={a11ySettings}
                onOpenA11y={() => setA11yModalOpen(true)}
                onDelete={
                  selectedView === "reading_list" && activeItem
                    ? () => handleDeleteItem(activeItem.id)
                    : undefined
                }
                onSelectFeed={(feedId) => selectView("all", feedId)}
                onSelectCategory={(cat) => selectView("all", null, cat)}
                onItemUpdated={(updated) => {
                  setItems((prev) =>
                    prev.map((it) => (it.id === updated.id ? { ...it, ...updated } : it))
                  );
                }}
                onToggleFocusReader={() => setItemListCollapsed((prev) => !prev)}
                isFocusReader={itemListCollapsed}
                workDigestName={userProfile?.workDigestName || "Work"}
              />
            </div>
          </div>
        )}
      </main>

      {/* Mobile bottom navigation: hidden while reading an article */}
      {!readingOnMobile && (
        <nav
          className="md:hidden shrink-0 grid grid-cols-5 border-t border-slate-200 dark:border-slate-800/80 bg-[var(--surface)]/95 backdrop-blur-md"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={t.onClick}
              className={`relative min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold active:scale-95 transition-all ${
                t.active ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
              }`}
              aria-label={t.label}
            >
              {t.icon}
              <span>{t.label}</span>
              {t.badge ? (
                <span className="absolute top-1.5 left-1/2 ml-2 text-[9px] leading-none px-1.5 py-0.5 rounded-full bg-blue-600 text-white font-mono">
                  {t.badge > 999 ? "999+" : t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      )}

      {/* Command Palette (Cmd+K / Ctrl+K) */}
      <CommandPaletteModal
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        feeds={feeds}
        activeItem={activeItem}
        onSelectView={(view, id, cat) => selectView(view as View, id, cat)}
        onToggleRead={
          activeItem ? () => handleToggleRead(activeItem.id, !activeItem.isRead) : undefined
        }
        onToggleStar={
          activeItem ? () => handleToggleStar(activeItem.id, !activeItem.isStarred) : undefined
        }
        onToggleWork={
          activeItem ? () => handleToggleWork(activeItem.id, !activeItem.isWork) : undefined
        }
        onOpenA11y={() => setA11yModalOpen(true)}
        onOpenFeedback={() => setFeedbackModalOpen(true)}
        onOpenOnboardingPreview={handleOpenOnboardingPreview}
        workDigestName={userProfile?.workDigestName || "Work"}
      />

      {/* Persistent Feedback / Friction / Idea Modal */}
      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        articleTitle={activeItem?.title}
        articleId={activeItem?.id}
        currentView={
          a11yModalOpen
            ? "Settings / Accessibility"
            : guideModalOpen
              ? "System Guide"
              : selectedView === "stats"
                ? "Stats & Analytics"
                : selectedView === "feed_manager"
                  ? "Manage Feeds"
                  : selectedFeedId
                    ? `Feed: ${feeds.find((f) => f.id === selectedFeedId)?.title || selectedFeedId}`
                    : selectedCategory
                      ? `Category: ${selectedCategory}`
                      : selectedView === "reading_list"
                        ? "Research Inbox"
                        : selectedView === "starred"
                          ? "Read Later (Articles)"
                          : selectedView === "watch_later"
                            ? "Watch Later (Videos)"
                            : selectedView === "work"
                              ? "Work Items"
                              : selectedView === "unread"
                                ? "Unread"
                                : "All Articles"
        }
      />

      {/* Reading & Accessibility Settings Modal */}
      <AccessibilityModal
        isOpen={a11yModalOpen}
        onClose={() => setA11yModalOpen(false)}
        settings={a11ySettings}
        onSettingsChange={setA11ySettings}
      />

      {/* Synapse Workflow & System Guide Modal */}
      <GuideModal isOpen={guideModalOpen} onClose={() => setGuideModalOpen(false)} />

      {/* First-Run Onboarding Modal */}
      <OnboardingModal
        isOpen={onboardingModalOpen}
        isDryRun={onboardingIsDryRun}
        onClose={() => {
          setOnboardingModalOpen(false);
          setOnboardingIsDryRun(false);
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            let cleaned = false;
            for (const key of ["onboarding", "welcome", "preview", "dryRun", "welcome_preview"]) {
              if (url.searchParams.has(key)) {
                url.searchParams.delete(key);
                cleaned = true;
              }
            }
            if (cleaned) {
              const cleanSearch = url.searchParams.toString();
              const newUrl = url.pathname + (cleanSearch ? `?${cleanSearch}` : "") + url.hash;
              window.history.replaceState({}, "", newUrl);
            }
          }
        }}
        onCompleted={refreshFeedsAndBoards}
      />

      {/* 5-Second Undo Toast */}
      <UndoToast action={undoAction} onClear={() => setUndoAction(null)} />
    </div>
  );
}
