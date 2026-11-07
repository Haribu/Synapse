"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Video,
  FileText,
  CheckCircle,
  CheckCheck,
  RefreshCw,
  Star,
  Menu,
  Loader2,
  MessageSquarePlus,
  LayoutList,
  List,
  Eye,
  EyeOff,
  Bookmark,
  Mail,
  Briefcase,
  Plus,
  Trash2,
  Megaphone,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Layers,
  RotateCcw,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  X,
  Filter,
  Sparkles,
  BookOpen,
  Clock,
  Hourglass,
  ArrowRight,
} from "lucide-react";
import { decodeHtmlEntities } from "@/lib/utils/decode";
import { isSponsoredContent } from "@/lib/utils/sponsored";
import { isWeeklyRoundup } from "@/lib/utils/roundup";
import { AccessibilitySettings } from "@/lib/utils/accessibility";
import { clusterRelatedArticles } from "@/lib/utils/clustering";
import {
  BacklogCandidate,
  getItemAgeDays,
  isItemStale,
  selectTriageZeroPivotItem,
  selectDailyVaultSpotlight,
  getStaleBacklogItems,
} from "@/lib/utils/backlog-nudges";

interface Item {
  id: string;
  title: string;
  url: string;
  author?: string;
  snippet?: string;
  publishedAt?: string;
  createdAt?: string;
  feedTitle?: string;
  feedEditorialType?: string;
  mediaType?: "article" | "video" | "podcast";
  thumbnailUrl?: string;
  isRead?: boolean;
  isStarred?: boolean;
  isWork?: boolean;
  workDispatchedAt?: string | null;
  isFullFetched?: boolean;
  sourceQueue?: "read_later" | "research_inbox" | "watch_later";
}

interface ItemListProps {
  items: Item[];
  title?: string;
  unreadCount?: number;
  selectedItemId: string | null;
  searchQuery: string;
  loading?: boolean;
  hasMore?: boolean;
  onSearchChange: (q: string) => void;
  onSelectItem: (item: Item, relatedStories?: Item[]) => void;
  onOpenSidebar?: () => void;
  onMarkAllRead?: () => void;
  onRefresh?: () => void;
  onLoadMore?: () => void;
  onOpenFeedback?: () => void;
  onDeleteFeed?: () => void;
  onSelectView?: (view: any) => void;
  selectedView?: string;
  width?: number;
  onDisplayedItemsChange?: (items: Item[]) => void;
  a11ySettings?: AccessibilitySettings;
  onToggleCollapseSidebar?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleRead?: (id: string, isRead: boolean) => void;
  onToggleStar?: (id: string, isStarred: boolean) => void;
  workDigestName?: string;
  backlogCandidates?: BacklogCandidate[];
  onSelectBacklogCandidate?: (candidate: BacklogCandidate) => void;
  onDropBacklogCandidate?: (candidate: BacklogCandidate) => void;
  onDeclareBankruptcy?: (staleItems: Item[]) => void;
}

function EditorialBadge({ type }: { type?: string }) {
  if (!type || type === "independent") return null;
  if (type === "vendor") {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0"
        title="Vendor blog — commercial / promotional bias"
      >
        Vendor
      </span>
    );
  }
  if (type === "official") {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30 shrink-0"
        title="Official standard or government agency"
      >
        Official
      </span>
    );
  }
  if (type === "community") {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shrink-0"
        title="Community / open organization"
      >
        Community
      </span>
    );
  }
  if (type === "news") {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30 shrink-0"
        title="News publication"
      >
        News
      </span>
    );
  }
  return null;
}

function SponsoredBadge() {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 shrink-0"
      title="Sponsored or promotional partner content"
    >
      Sponsored
    </span>
  );
}

function RoundupBadge() {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30 shrink-0"
      title="Weekly roundup or recap digest"
    >
      Roundup
    </span>
  );
}

export function ItemList({
  items,
  title,
  unreadCount = 0,
  selectedItemId,
  searchQuery,
  loading = false,
  hasMore = false,
  onSearchChange,
  onSelectItem,
  onOpenSidebar,
  onMarkAllRead,
  onRefresh,
  onLoadMore,
  onOpenFeedback,
  onDeleteFeed,
  onSelectView,
  selectedView,
  width,
  onDisplayedItemsChange,
  a11ySettings,
  onToggleCollapseSidebar,
  isSidebarCollapsed,
  onToggleRead,
  onToggleStar,
  workDigestName,
  backlogCandidates = [],
  onSelectBacklogCandidate,
  onDropBacklogCandidate,
  onDeclareBankruptcy,
}: ItemListProps) {
  const [compactMode, setCompactMode] = useState<boolean>(false);
  const [hideRead, setHideRead] = useState<boolean>(false);
  const [hideSponsored, setHideSponsored] = useState<boolean>(false);
  const [hideRoundups, setHideRoundups] = useState<boolean>(false);
  const [showFilteredDetails, setShowFilteredDetails] = useState<boolean>(false);
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({});
  const [dismissedSpotlightIds, setDismissedSpotlightIds] = useState<string[]>([]);

  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    try {
      const raw = localStorage.getItem(`synapse_spotlight_dismissed_${todayKey}`);
      if (raw) {
        setDismissedSpotlightIds(JSON.parse(raw));
      } else {
        setDismissedSpotlightIds([]);
      }
    } catch {
      setDismissedSpotlightIds([]);
    }
  }, []);

  const handleDismissSpotlight = (id: string) => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const next = Array.from(new Set([...dismissedSpotlightIds, id]));
    setDismissedSpotlightIds(next);
    try {
      localStorage.setItem(`synapse_spotlight_dismissed_${todayKey}`, JSON.stringify(next));
    } catch {}
  };

  // Swipe-to-triage row state
  const [swipingRow, setSwipingRow] = useState<{ id: string; offsetX: number } | null>(null);
  const rowTouchStart = useRef<{ id: string; x: number; y: number } | null>(null);

  const handleRowTouchStart = (id: string, e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      rowTouchStart.current = {
        id,
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleRowTouchMove = (id: string, e: React.TouchEvent) => {
    if (!rowTouchStart.current || rowTouchStart.current.id !== id) return;
    const dx = e.touches[0].clientX - rowTouchStart.current.x;
    const dy = e.touches[0].clientY - rowTouchStart.current.y;
    if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      const clamped = Math.max(-100, Math.min(100, dx));
      setSwipingRow({ id, offsetX: clamped });
    }
  };

  const handleRowTouchEnd = (item: Item) => {
    if (swipingRow && swipingRow.id === item.id) {
      if (swipingRow.offsetX >= 60 && onToggleRead) {
        onToggleRead(item.id, !item.isRead);
      } else if (swipingRow.offsetX <= -60 && onToggleStar) {
        onToggleStar(item.id, !item.isStarred);
      }
    }
    setSwipingRow(null);
    rowTouchStart.current = null;
  };

  const toggleCluster = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedClusters((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Pull-to-refresh state & refs
  const listScrollRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const isAtTopAtTouchStart = useRef<boolean>(false);
  const [isPulling, setIsPulling] = useState(false);

  useEffect(() => {
    const savedDensity = localStorage.getItem("synapse_feed_density");
    if (savedDensity === "compact") {
      setCompactMode(true);
    }
    const savedHideRead = localStorage.getItem("synapse_hide_read");
    if (savedHideRead !== null) {
      setHideRead(savedHideRead === "true");
    }
    const savedHideSponsored = localStorage.getItem("synapse_hide_sponsored");
    if (savedHideSponsored !== null) {
      setHideSponsored(savedHideSponsored === "true");
    }
    const savedHideRoundups = localStorage.getItem("synapse_hide_roundups");
    if (savedHideRoundups !== null) {
      setHideRoundups(savedHideRoundups === "true");
    }
  }, []);

  const toggleCompactMode = () => {
    setCompactMode((prev) => {
      const next = !prev;
      localStorage.setItem("synapse_feed_density", next ? "compact" : "comfortable");
      return next;
    });
  };

  const toggleHideRead = () => {
    setHideRead((prev) => {
      const next = !prev;
      localStorage.setItem("synapse_hide_read", String(next));
      return next;
    });
  };

  const toggleHideSponsored = () => {
    setHideSponsored((prev) => {
      const next = !prev;
      localStorage.setItem("synapse_hide_sponsored", String(next));
      return next;
    });
  };

  const toggleHideRoundups = () => {
    setHideRoundups((prev) => {
      const next = !prev;
      localStorage.setItem("synapse_hide_roundups", String(next));
      return next;
    });
  };

  const [draftingDigest, setDraftingDigest] = useState(false);
  const [digestSuccess, setDigestSuccess] = useState(false);
  const [dispatchedNotice, setDispatchedNotice] = useState<{
    count: number;
    itemIds: string[];
  } | null>(null);
  const [workTab, setWorkTab] = useState<"pending" | "dispatched" | "all">("pending");
  const [queueFilter, setQueueFilter] = useState<"all" | "research" | "starred">("all");
  const [showAddUrlForm, setShowAddUrlForm] = useState<boolean>(false);
  const [newResearchUrl, setNewResearchUrl] = useState("");
  const [addingResearchUrl, setAddingResearchUrl] = useState(false);
  const [mondayReminderDismissed, setMondayReminderDismissed] = useState(false);

  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const dismissed =
      localStorage.getItem(`synapse_monday_digest_dismissed_${todayKey}`) === "true";
    setMondayReminderDismissed(dismissed);
  }, []);

  const handleDismissMondayReminder = () => {
    const todayKey = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`synapse_monday_digest_dismissed_${todayKey}`, "true");
    setMondayReminderDismissed(true);
  };

  const handleDraftWorkDigest = async () => {
    setDraftingDigest(true);
    try {
      const res = await fetch("/api/digest/work?newOnly=true");
      const data = await res.json();
      if (data.mailtoUrl) {
        window.open(data.mailtoUrl, "_blank");
        if (data.teamsText && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(data.teamsText);
          } catch {}
        }
        setDigestSuccess(true);
        setTimeout(() => setDigestSuccess(false), 4000);

        const todayKey = new Date().toISOString().slice(0, 10);
        localStorage.setItem(`synapse_monday_digest_dismissed_${todayKey}`, "true");
        setMondayReminderDismissed(true);

        if (data.items && data.items.length > 0) {
          const itemIds = data.items.map((i: any) => i.id);
          await fetch("/api/digest/work", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemIds }),
          });
          setDispatchedNotice({ count: itemIds.length, itemIds });
          if (onRefresh) onRefresh();
        }
      }
    } catch (err) {
      console.error("Failed to compile work digest", err);
    } finally {
      setDraftingDigest(false);
    }
  };

  const handleUndoDispatch = async () => {
    if (!dispatchedNotice) return;
    try {
      await fetch("/api/digest/work", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: dispatchedNotice.itemIds }),
      });
      setDispatchedNotice(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Failed to undo digest dispatch", err);
    }
  };

  const handleRequeueItem = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    try {
      await fetch("/api/digest/work", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: [itemId] }),
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Failed to requeue item", err);
    }
  };

  const handleAddUrlToResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newResearchUrl.trim()) return;
    setAddingResearchUrl(true);
    try {
      const res = await fetch("/api/reading-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newResearchUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setNewResearchUrl("");
        if (onRefresh) onRefresh();
        if (data.item?.id && onSelectItem) {
          onSelectItem(data.item.id);
        }
      }
    } catch (err) {
      console.error("Failed to add URL to Research Inbox", err);
    } finally {
      setAddingResearchUrl(false);
    }
  };

  // Pull to refresh handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
      isAtTopAtTouchStart.current = (listScrollRef.current?.scrollTop || 0) <= 5;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isAtTopAtTouchStart.current || touchStartY.current === null) return;
    const diffY = e.touches[0].clientY - touchStartY.current;
    const diffX =
      touchStartX.current !== null ? Math.abs(e.touches[0].clientX - touchStartX.current) : 0;
    if (diffY > 40 && diffY > diffX * 1.5) {
      setIsPulling(true);
    } else {
      setIsPulling(false);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null || touchStartX.current === null) return;
    const diffY = e.changedTouches[0].clientY - touchStartY.current;
    const diffX = e.changedTouches[0].clientX - touchStartX.current;

    if (isAtTopAtTouchStart.current && diffY > 60 && diffY > Math.abs(diffX) * 1.5) {
      if (onRefresh) onRefresh();
    }
    setIsPulling(false);
    touchStartY.current = null;
    touchStartX.current = null;
  };

  const isWorkView = selectedView === "work" || title === "Work Items";
  const isReadingQueueGroup =
    selectedView === "reading_queue" ||
    selectedView === "starred" ||
    selectedView === "reading_list";
  const isSavedView = isReadingQueueGroup || selectedView === "watch_later" || isWorkView;

  const effectiveHideSponsored = a11ySettings?.hideSponsored ?? hideSponsored;
  const effectiveHideRoundups = a11ySettings?.hideRoundups ?? hideRoundups;
  const effectiveHideVendors = a11ySettings?.hideVendors ?? false;

  const pendingWorkCount = items.filter((i) => !i.workDispatchedAt).length;
  const dispatchedWorkCount = items.filter((i) => Boolean(i.workDispatchedAt)).length;
  const researchInItemsCount = items.filter((i) => i.sourceQueue === "research_inbox").length;
  const starredInItemsCount = items.filter((i) => i.sourceQueue !== "research_inbox").length;
  const isMonday = new Date().getDay() === 1;
  const showMondayReminder = isMonday && pendingWorkCount > 0 && !mondayReminderDismissed;

  // Track articles marked read during this active reading session so overswiping or backwards
  // swipe gestures still allow navigating back to just-read articles before manual refresh.
  const sessionReadIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    sessionReadIdsRef.current.clear();
    if (selectedView === "reading_list") setQueueFilter("research");
    else if (selectedView === "starred") setQueueFilter("starred");
    else setQueueFilter("all");
  }, [selectedView, title]);

  useEffect(() => {
    if (selectedItemId) {
      sessionReadIdsRef.current.add(selectedItemId);
    }
  }, [selectedItemId]);

  const displayedItems = React.useMemo(() => {
    return items.filter((item) => {
      if (effectiveHideSponsored && isSponsoredContent(item) && item.id !== selectedItemId) {
        return false;
      }
      if (effectiveHideRoundups && isWeeklyRoundup(item) && item.id !== selectedItemId) {
        return false;
      }
      if (
        effectiveHideVendors &&
        item.feedEditorialType === "vendor" &&
        item.id !== selectedItemId
      ) {
        return false;
      }
      if (isWorkView) {
        if (workTab === "pending") return !item.workDispatchedAt || item.id === selectedItemId;
        if (workTab === "dispatched")
          return Boolean(item.workDispatchedAt) || item.id === selectedItemId;
        return true;
      }
      if (selectedView === "reading_queue") {
        if (queueFilter === "research") {
          return item.sourceQueue === "research_inbox" || item.id === selectedItemId;
        }
        if (queueFilter === "starred") {
          return item.sourceQueue !== "research_inbox" || item.id === selectedItemId;
        }
        return true;
      }
      // Saved queues (Reading Queue, Starred, Watch Later, Deep Research) always show items regardless of read state
      if (isSavedView) return true;
      if (!hideRead) return true;
      return !item.isRead || item.id === selectedItemId || sessionReadIdsRef.current.has(item.id);
    });
  }, [
    items,
    effectiveHideSponsored,
    effectiveHideRoundups,
    effectiveHideVendors,
    isWorkView,
    workTab,
    selectedView,
    queueFilter,
    isSavedView,
    hideRead,
    selectedItemId,
  ]);

  const clusteredItems = React.useMemo(() => {
    // Saved queues (Research Inbox, Read Later, Watch Later, Work) represent deliberately curated user items
    // and must never be grouped or hidden under primary article clusters.
    if (a11ySettings?.disableGrouping || isSavedView) {
      return displayedItems.map((item) => ({ primary: item, relatedStories: [] }));
    }
    return clusterRelatedArticles(displayedItems);
  }, [displayedItems, a11ySettings?.disableGrouping, isSavedView]);

  useEffect(() => {
    if (onDisplayedItemsChange) {
      onDisplayedItemsChange(displayedItems);
    }
  }, [displayedItems, onDisplayedItemsChange]);

  const hiddenReadCount = isSavedView
    ? 0
    : items.filter((item) => item.isRead && item.id !== selectedItemId).length;
  const sponsoredCount = items.filter((item) => isSponsoredContent(item)).length;
  const roundupCount = items.filter((item) => isWeeklyRoundup(item)).length;
  const vendorCount = items.filter((item) => item.feedEditorialType === "vendor").length;

  const staleThresholdDays = a11ySettings?.staleDaysThreshold ?? 14;
  const isDecayQueueView =
    selectedView === "reading_queue" ||
    selectedView === "starred" ||
    selectedView === "watch_later" ||
    selectedView === "reading_list";
  const staleItemsInView = React.useMemo(
    () => (isDecayQueueView ? getStaleBacklogItems(displayedItems, staleThresholdDays) : []),
    [isDecayQueueView, displayedItems, staleThresholdDays]
  );

  const triageZeroPivotItem = React.useMemo(
    () => selectTriageZeroPivotItem(backlogCandidates),
    [backlogCandidates]
  );

  const dailyVaultSpotlight = React.useMemo(() => {
    if (selectedView !== "unread") return null;
    if (a11ySettings?.enableTriageSpotlight === false) return null;
    return selectDailyVaultSpotlight(backlogCandidates, {
      minAgeDays: 3,
      dismissedItemIds: dismissedSpotlightIds,
    });
  }, [selectedView, a11ySettings?.enableTriageSpotlight, backlogCandidates, dismissedSpotlightIds]);

  return (
    <div
      style={width ? { width: `${width}px` } : undefined}
      className="w-full md:w-80 lg:w-96 border-r border-[var(--card-border)] bg-[var(--card-bg)] flex flex-col h-full flex-shrink-0 transition-colors"
    >
      {/* Title row: current view, refresh, mark all read */}
      <div className="h-14 border-b border-[var(--card-border)] px-2 flex items-center gap-1">
        {onToggleCollapseSidebar && (
          <button
            onClick={onToggleCollapseSidebar}
            className="hidden xl:flex p-2 items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
            title={isSidebarCollapsed ? "Expand feed sidebar ([)" : "Collapse feed sidebar ([)"}
            aria-label="Toggle feed sidebar"
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}
        {onOpenSidebar && (
          <button
            onClick={onOpenSidebar}
            className="xl:hidden min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
            aria-label="Open navigation menu"
            title="Open Feeds & Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 min-w-[100px] px-2 overflow-hidden">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
            {title || "Articles"}
          </h2>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap truncate">
            {isReadingQueueGroup
              ? `${displayedItems.length} saved${
                  selectedView === "reading_queue" && queueFilter === "all"
                    ? ` (${researchInItemsCount} research · ${starredInItemsCount} starred)`
                    : ""
                }`
              : `${unreadCount} unread · ${displayedItems.length} shown`}
            {hiddenReadCount > 0 && hideRead ? ` (${hiddenReadCount} hidden)` : ""}
            {sponsoredCount > 0 && effectiveHideSponsored
              ? ` (${sponsoredCount} sponsored hidden)`
              : ""}
            {roundupCount > 0 && effectiveHideRoundups ? ` (${roundupCount} roundups hidden)` : ""}
            {vendorCount > 0 && effectiveHideVendors ? ` (${vendorCount} vendors hidden)` : ""}
          </p>
        </div>
        <button
          onClick={toggleHideRead}
          className={`p-2 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all ${
            hideRead
              ? "text-blue-600 dark:text-blue-400 font-bold"
              : "text-slate-500 dark:text-slate-400"
          }`}
          title={
            hideRead
              ? `Read articles hidden${hiddenReadCount > 0 ? ` (${hiddenReadCount} hidden)` : ""}. Click to show.`
              : "Showing all articles. Click to hide read."
          }
          aria-label="Toggle hide read articles"
        >
          {hideRead ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button
          onClick={toggleCompactMode}
          className={`p-2 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all ${
            compactMode
              ? "text-blue-600 dark:text-blue-400 font-bold"
              : "text-slate-500 dark:text-slate-400"
          }`}
          title={
            compactMode
              ? "Switch to comfortable view (with content preview)"
              : "Switch to compact view (sources and titles only)"
          }
          aria-label="Toggle feed density"
        >
          {compactMode ? <List className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
        </button>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-2 flex items-center justify-center text-slate-500 dark:text-slate-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
            title="Refresh list"
            aria-label="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-500" : ""}`} />
          </button>
        )}
        {onDeleteFeed && (
          <button
            onClick={() => {
              if (
                window.confirm(
                  `Permanently delete the feed "${title}" and all its downloaded articles?`
                )
              ) {
                onDeleteFeed();
              }
            }}
            className="p-2 flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-95 transition-all"
            title={`Delete "${title}" feed permanently`}
            aria-label="Delete feed"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        {onMarkAllRead && (
          <button
            onClick={onMarkAllRead}
            className="p-2 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
            title="Mark all as read (Shift+A)"
            aria-label="Mark all as read"
          >
            <CheckCheck className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--card-border)]">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter articles in view..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-xs text-[var(--foreground)] placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Work Items Action Bar */}
      {title === "Work Items" && (
        <div className="border-b border-blue-100 dark:border-blue-900/50 bg-blue-50/80 dark:bg-blue-950/40">
          <div className="px-3 py-2 flex flex-col gap-2">
            {/* Monday Morning Digest Reminder */}
            {showMondayReminder && (
              <div className="p-2 bg-amber-100/90 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 rounded-lg flex items-center justify-between gap-2 text-xs shadow-xs">
                <div className="flex items-center gap-2 min-w-0 text-amber-900 dark:text-amber-200">
                  <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 animate-bounce" />
                  <span className="truncate">
                    <strong>Monday Reminder:</strong> {pendingWorkCount} item
                    {pendingWorkCount !== 1 ? "s" : ""} pending for {workDigestName || "Work"}{" "}
                    digest
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleDraftWorkDigest}
                    disabled={draftingDigest}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-md text-[10px] font-bold shadow-xs active:scale-95 transition-all"
                  >
                    Draft Now
                  </button>
                  <button
                    onClick={handleDismissMondayReminder}
                    className="p-1 text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 hover:bg-amber-200/60 dark:hover:bg-amber-900/60 rounded-md transition-all"
                    title="Dismiss reminder for today"
                    aria-label="Dismiss Monday reminder"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-200 min-w-0">
                <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="truncate">{workDigestName || "Work"} Digest</span>
              </div>
              <button
                onClick={handleDraftWorkDigest}
                disabled={draftingDigest || pendingWorkCount === 0}
                className="min-h-[30px] px-3 py-1 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm active:scale-95 transition-all shrink-0"
                title={`Create email draft for ${workDigestName || "Work"} with undispatched work items`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>
                  {draftingDigest
                    ? "Compiling..."
                    : digestSuccess
                      ? "Drafted & Copied for Teams!"
                      : pendingWorkCount > 0
                        ? `Draft Digest (${pendingWorkCount})`
                        : "No Pending Items"}
                </span>
              </button>
            </div>

            {/* Segmented Filter: Pending / Dispatched / All */}
            <div className="flex items-center gap-1 bg-white/90 dark:bg-slate-900/80 border border-blue-200 dark:border-blue-900/60 p-0.5 rounded-lg text-[10px]">
              <button
                type="button"
                onClick={() => setWorkTab("pending")}
                className={`flex-1 py-1 rounded-md text-center transition-all ${
                  workTab === "pending"
                    ? "bg-blue-600 text-white font-semibold shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                Pending ({pendingWorkCount})
              </button>
              <button
                type="button"
                onClick={() => setWorkTab("dispatched")}
                className={`flex-1 py-1 rounded-md text-center transition-all ${
                  workTab === "dispatched"
                    ? "bg-blue-600 text-white font-semibold shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                Dispatched ({dispatchedWorkCount})
              </button>
              <button
                type="button"
                onClick={() => setWorkTab("all")}
                className={`flex-1 py-1 rounded-md text-center transition-all ${
                  workTab === "all"
                    ? "bg-blue-600 text-white font-semibold shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                All ({items.length})
              </button>
            </div>
          </div>

          {/* Dispatched Notification / Undo Banner */}
          {dispatchedNotice && (
            <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 border-t border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-200 animate-in fade-in">
              <span className="flex items-center gap-1.5 font-medium text-[11px]">
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                {dispatchedNotice.count} item{dispatchedNotice.count === 1 ? "" : "s"} marked
                dispatched.
              </span>
              <button
                type="button"
                onClick={handleUndoDispatch}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline active:scale-95 transition-all ml-2"
              >
                <RotateCcw className="w-3 h-3" />
                Undo
              </button>
            </div>
          )}
        </div>
      )}
      {isReadingQueueGroup && (
        <div className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-2.5 py-1.5 space-y-1.5">
          {/* Compact Segmented Switcher + "+ URL" Toggle */}
          <div className="flex items-center gap-1.5">
            <div className="flex-1 flex items-center gap-0.5 bg-slate-200/70 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-0.5 rounded-lg text-[10px]">
              <button
                type="button"
                onClick={() => {
                  setQueueFilter("all");
                  if (selectedView !== "reading_queue" && onSelectView) {
                    onSelectView("reading_queue");
                  }
                }}
                className={`flex-1 py-1 px-1.5 rounded-md text-center transition-all flex items-center justify-center gap-1 ${
                  selectedView === "reading_queue" && queueFilter === "all"
                    ? "bg-amber-500 text-white font-semibold shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <span>
                  All ({selectedView === "reading_queue" ? items.length : backlogCandidates.length})
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setQueueFilter("research");
                  if (selectedView !== "reading_list" && onSelectView) {
                    onSelectView("reading_list");
                  }
                }}
                className={`flex-1 py-1 px-1.5 rounded-md text-center transition-all flex items-center justify-center gap-1 ${
                  selectedView === "reading_list" ||
                  (selectedView === "reading_queue" && queueFilter === "research")
                    ? "bg-purple-600 text-white font-semibold shadow-2xs"
                    : "text-purple-700 dark:text-purple-300 hover:bg-purple-500/10"
                }`}
              >
                <Bookmark className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">
                  Research (
                  {selectedView === "reading_list"
                    ? items.length
                    : selectedView === "reading_queue"
                      ? researchInItemsCount
                      : backlogCandidates.filter((c) => c.sourceQueue === "research_inbox").length}
                  )
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setQueueFilter("starred");
                  if (selectedView !== "starred" && onSelectView) {
                    onSelectView("starred");
                  }
                }}
                className={`flex-1 py-1 px-1.5 rounded-md text-center transition-all flex items-center justify-center gap-1 ${
                  selectedView === "starred" ||
                  (selectedView === "reading_queue" && queueFilter === "starred")
                    ? "bg-amber-500 text-white font-semibold shadow-2xs"
                    : "text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                }`}
              >
                <Star className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">
                  Starred (
                  {selectedView === "starred"
                    ? items.length
                    : selectedView === "reading_queue"
                      ? starredInItemsCount
                      : backlogCandidates.filter((c) => c.sourceQueue !== "research_inbox").length}
                  )
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowAddUrlForm((prev) => !prev)}
              className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border transition-all flex items-center gap-1 shrink-0 ${
                showAddUrlForm
                  ? "bg-purple-600 text-white border-purple-600"
                  : "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/20"
              }`}
              title="Add a web URL directly to Deep Research"
            >
              <Plus className="w-3 h-3" />
              <span>URL</span>
            </button>
          </div>

          {showAddUrlForm && (
            <form onSubmit={handleAddUrlToResearch} className="flex gap-1.5 items-center pt-0.5">
              <input
                type="url"
                value={newResearchUrl}
                onChange={(e) => setNewResearchUrl(e.target.value)}
                placeholder="https://... (save link to Deep Research)"
                autoFocus
                className="flex-1 px-2.5 py-1 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-lg text-xs placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                disabled={addingResearchUrl || !newResearchUrl.trim()}
                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shrink-0 transition-all"
              >
                {addingResearchUrl ? "..." : "Save"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* 14-Day Half-Life Decay & Bankruptcy Sweep Banner */}
      {isDecayQueueView && staleItemsInView.length > 0 && onDeclareBankruptcy && (
        <div className="px-3 py-2 border-b border-amber-200/80 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/35 flex items-center justify-between gap-2 text-xs animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0 text-amber-900 dark:text-amber-200">
            <Hourglass className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="truncate text-[11px]">
              <strong>{staleItemsInView.length} stale</strong> item
              {staleItemsInView.length === 1 ? "" : "s"} (&ge;{staleThresholdDays}d old)
            </span>
          </div>
          <button
            type="button"
            onClick={() => onDeclareBankruptcy(staleItemsInView)}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold shadow-xs active:scale-95 transition-all shrink-0 flex items-center gap-1"
            title={`Clear all ${staleItemsInView.length} items older than ${staleThresholdDays} days (with 5-second undo)`}
          >
            <Trash2 className="w-3 h-3" />
            <span>Declare Bankruptcy ({staleItemsInView.length})</span>
          </button>
        </div>
      )}

      {/* Items Scroll List */}
      <div
        ref={listScrollRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60"
      >
        {isPulling && (
          <div className="py-2.5 flex items-center justify-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Release to refresh feed</span>
          </div>
        )}

        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 text-xs gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span>Hydrating feed articles...</span>
          </div>
        ) : displayedItems.length === 0 ? (
          title === "Work Items" ? (
            items.length > 0 && workTab === "pending" ? (
              <div className="p-8 text-left max-w-sm mx-auto space-y-4 animate-in fade-in">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCheck className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    All Work Items Dispatched
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    You've compiled digests for all currently flagged items. When you flag new
                    articles, they will appear here.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkTab("dispatched")}
                  className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 rounded-lg text-xs font-semibold transition-all inline-block"
                >
                  View Dispatched Archive ({dispatchedWorkCount})
                </button>
              </div>
            ) : items.length > 0 && workTab === "dispatched" ? (
              <div className="p-8 text-left max-w-sm mx-auto space-y-4 animate-in fade-in">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    No Dispatched Items Yet
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Articles you draft into {workDigestName || "Work"} digests will be archived here
                    for your records.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkTab("pending")}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all inline-block"
                >
                  Back to Pending Items ({pendingWorkCount})
                </button>
              </div>
            ) : (
              <div className="p-8 text-left max-w-sm mx-auto space-y-4 animate-in fade-in">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    No Items Flagged for Work
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    While reading any article or newsletter, click the{" "}
                    <strong className="text-slate-800 dark:text-slate-200">Work</strong> button in
                    the action bar to flag it for your {workDigestName || "Work"} digest.
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {workDigestName || "Work"} Digest Workflow:
                  </div>
                  <ul className="list-disc pl-4 space-y-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    <li>Flag articles throughout the week.</li>
                    <li>
                      Click{" "}
                      <strong className="text-slate-800 dark:text-slate-200">Draft Digest</strong>{" "}
                      in the header to bundle all pending items into a formatted email for{" "}
                      {workDigestName || "Work"}.
                    </li>
                    <li>Drafted items move to the Dispatched archive automatically.</li>
                  </ul>
                </div>
              </div>
            )
          ) : title === "Research Inbox" || title === "Deep Research" ? (
            <div className="p-8 text-left max-w-sm mx-auto space-y-4 animate-in fade-in">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Bookmark className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Deep Research is Empty
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Deep Research is your dedicated workspace for articles, newsletters, and notes
                  you intend to study deeply.
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="font-semibold text-slate-900 dark:text-white">How it works:</div>
                <ul className="list-disc pl-4 space-y-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  <li>
                    In Reader view, tap{" "}
                    <strong className="text-slate-800 dark:text-slate-200">
                      Save to Research Inbox
                    </strong>{" "}
                    to bookmark an article here.
                  </li>
                  <li>Items stay safely stored here even after feed retention rolls off.</li>
                  <li>Export directly to Obsidian or Google Docs when ready.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-slate-400 dark:text-slate-500 text-xs space-y-4">
              <div className="space-y-1.5">
                <p className="font-medium text-slate-600 dark:text-slate-300">
                  {items.length > 0
                    ? "All caught up! Triage is at zero."
                    : "No unread articles in this view."}
                </p>
                {hiddenReadCount > 0 && hideRead && (
                  <button
                    onClick={toggleHideRead}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium block mx-auto"
                  >
                    Show {hiddenReadCount} read {hiddenReadCount === 1 ? "article" : "articles"}
                  </button>
                )}
              </div>

              {/* 1. Triage Zero Deep Read Pivot Card */}
              {triageZeroPivotItem && onSelectBacklogCandidate && (
                <div className="text-left p-4 rounded-2xl bg-gradient-to-br from-amber-50/90 via-white to-purple-50/80 dark:from-slate-900 dark:via-slate-900/95 dark:to-purple-950/30 border border-amber-300/70 dark:border-amber-700/50 shadow-md space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        triageZeroPivotItem.sourceQueue === "research_inbox"
                          ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      {triageZeroPivotItem.sourceQueue === "research_inbox"
                        ? "Research Vault Pivot"
                        : "Read Later Pivot"}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-500" />
                      Saved {triageZeroPivotItem.ageDays}d ago · ~{triageZeroPivotItem.readingMinutes}m
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      You cleared the noise. Got {triageZeroPivotItem.readingMinutes} minutes for this piece you intentionally saved?
                    </p>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                      {decodeHtmlEntities(triageZeroPivotItem.title)}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onSelectBacklogCandidate(triageZeroPivotItem)}
                      className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Read Deeply Now</span>
                    </button>
                    {onDropBacklogCandidate && (
                      <button
                        type="button"
                        onClick={() => onDropBacklogCandidate(triageZeroPivotItem)}
                        className="py-2 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-all active:scale-95"
                        title="No longer relevant — drop from backlog"
                      >
                        Drop
                      </button>
                    )}
                  </div>
                </div>
              )}

              {onSelectView && (
                <button
                  onClick={() => onSelectView("all")}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all block mx-auto"
                >
                  View All Articles
                </button>
              )}
            </div>
          )
        ) : (
          <>
            {/* 2. Interleaved Serendipity: Daily Vault Spotlight pinned at top of Triage */}
            {dailyVaultSpotlight && onSelectBacklogCandidate && (
              <div className="p-3.5 bg-gradient-to-r from-amber-50/80 via-amber-50/40 to-purple-50/60 dark:from-amber-950/30 dark:via-slate-900/80 dark:to-purple-950/30 border-b border-amber-200/80 dark:border-amber-800/50 animate-in fade-in">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                      dailyVaultSpotlight.sourceQueue === "research_inbox"
                        ? "bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-500/30"
                        : "bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    From Your Vault · Saved {dailyVaultSpotlight.ageDays}d ago
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      ~{dailyVaultSpotlight.readingMinutes}m read
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDismissSpotlight(dailyVaultSpotlight.id)}
                      className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      title="Hide spotlight for today"
                      aria-label="Dismiss daily vault spotlight"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectBacklogCandidate(dailyVaultSpotlight)}
                  className="w-full text-left group"
                >
                  <h3 className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 leading-snug line-clamp-2 transition-colors">
                    {decodeHtmlEntities(dailyVaultSpotlight.title)}
                  </h3>
                </button>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {dailyVaultSpotlight.feedTitle ||
                      (dailyVaultSpotlight.sourceQueue === "research_inbox"
                        ? "Research Inbox"
                        : "Read Later")}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectBacklogCandidate(dailyVaultSpotlight)}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                    >
                      <span>Read Now</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                    </button>
                    {onDropBacklogCandidate && (
                      <button
                        type="button"
                        onClick={() => onDropBacklogCandidate(dailyVaultSpotlight)}
                        className="px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-slate-600 dark:text-slate-300 hover:text-rose-600 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold transition-all"
                        title="Drop from saved backlog"
                      >
                        Drop
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {clusteredItems.map((cluster) => {
            const item = cluster.primary;
            const isSelected = selectedItemId === item.id;
            const hasRelated = cluster.relatedStories.length > 0;
            const isExpanded = !!expandedClusters[item.id];
            const rowSwipeOffset = swipingRow?.id === item.id ? swipingRow.offsetX : 0;
            const itemAgeDays = isDecayQueueView ? getItemAgeDays(item) : 0;
            const itemIsStale = isDecayQueueView && isItemStale(item, staleThresholdDays);

            return (
              <div
                key={item.id}
                className="relative overflow-hidden border-b border-slate-100 dark:border-slate-800/60 last:border-b-0"
                onTouchStart={(e) => handleRowTouchStart(item.id, e)}
                onTouchMove={(e) => handleRowTouchMove(item.id, e)}
                onTouchEnd={() => handleRowTouchEnd(item)}
              >
                {/* Swipe Action Reveal Underlay */}
                {rowSwipeOffset !== 0 && (
                  <div
                    className={`absolute inset-0 flex items-center px-4 text-xs font-bold text-white pointer-events-none ${
                      rowSwipeOffset > 0
                        ? "bg-emerald-600 justify-start"
                        : "bg-amber-500 justify-end"
                    }`}
                  >
                    {rowSwipeOffset > 0 ? (
                      <span className="flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4" />
                        <span>{item.isRead ? "Mark Unread" : "Mark Read"}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <span>{item.isStarred ? "Unstar" : "Read Later"}</span>
                        <Star className="w-4 h-4 fill-current" />
                      </span>
                    )}
                  </div>
                )}

                <div
                  style={
                    rowSwipeOffset !== 0
                      ? { transform: `translateX(${rowSwipeOffset}px)` }
                      : undefined
                  }
                  className="bg-[var(--card-bg)] transition-transform duration-75"
                >
                  {compactMode ? (
                    <button
                      onClick={() => onSelectItem(item, cluster.relatedStories)}
                      className={`w-full text-left px-3.5 py-2.5 transition-colors relative flex items-center gap-2.5 ${
                        isSelected
                          ? "bg-blue-50/80 dark:bg-slate-800/90 text-slate-900 dark:text-white"
                          : itemIsStale
                            ? "opacity-55 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-500 dark:text-slate-400"
                            : item.isRead
                              ? "opacity-60 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-500 dark:text-slate-400"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {/* Active Indicator Bar */}
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 dark:bg-blue-500" />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 truncate max-w-[140px]">
                            {item.feedTitle || "Article"}
                          </span>
                          <EditorialBadge type={item.feedEditorialType} />
                          {isSponsoredContent(item) && <SponsoredBadge />}
                          {isWeeklyRoundup(item) && <RoundupBadge />}
                          {itemIsStale && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[9px] bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1 py-0.2 rounded border border-amber-500/30 font-mono shrink-0"
                              title={`Saved ${itemAgeDays} days ago — past ${staleThresholdDays}d half-life`}
                            >
                              <Hourglass className="w-2.5 h-2.5" />
                              Stale · {itemAgeDays}d
                            </span>
                          )}
                          {item.mediaType === "video" && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 px-1 py-0.2 rounded border border-red-200 dark:border-red-800/50">
                              <Video className="w-2.5 h-2.5" />
                              Video
                            </span>
                          )}
                          {isWorkView &&
                            (item.workDispatchedAt ? (
                              <span className="inline-flex items-center gap-0.5 text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                                <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                Dispatched
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-[9px] bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-300 px-1 py-0.2 rounded border border-blue-200 dark:border-blue-800/50">
                                <Briefcase className="w-2.5 h-2.5" />
                                Pending
                              </span>
                            ))}
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto shrink-0 whitespace-nowrap">
                            {item.publishedAt
                              ? new Date(item.publishedAt).toLocaleDateString()
                              : ""}
                          </span>
                          <div className="flex items-center gap-1 shrink-0 ml-1">
                            {item.sourceQueue === "research_inbox" ? (
                              <span title="Saved in Deep Research">
                                <Bookmark className="w-3 h-3 fill-purple-500 text-purple-500" />
                              </span>
                            ) : item.isStarred ? (
                              <span title="Starred Article">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              </span>
                            ) : null}
                            {!item.isRead && !isSavedView && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            )}
                          </div>
                        </div>

                        <h3 className="font-semibold text-xs leading-snug line-clamp-1 text-slate-800 dark:text-slate-200">
                          {decodeHtmlEntities(item.title)}
                        </h3>
                      </div>
                    </button>
                  ) : (
                    <button
                      onClick={() => onSelectItem(item, cluster.relatedStories)}
                      className={`w-full text-left p-4 transition-colors relative flex gap-3 ${
                        isSelected
                          ? "bg-blue-50/70 dark:bg-slate-800/90 text-slate-900 dark:text-white"
                          : itemIsStale
                            ? "opacity-55 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-500 dark:text-slate-400"
                            : item.isRead
                              ? "opacity-60 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-500 dark:text-slate-400"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {/* Active Indicator Bar */}
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 dark:bg-blue-500" />
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 truncate max-w-[150px]">
                            {item.feedTitle || "Article"}
                          </span>
                          <EditorialBadge type={item.feedEditorialType} />
                          {isSponsoredContent(item) && <SponsoredBadge />}
                          {isWeeklyRoundup(item) && <RoundupBadge />}
                          {itemIsStale && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.2 rounded border border-amber-500/30 font-mono shrink-0"
                              title={`Saved ${itemAgeDays} days ago — past ${staleThresholdDays}d half-life`}
                            >
                              <Hourglass className="w-2.5 h-2.5" />
                              Stale · {itemAgeDays}d
                            </span>
                          )}
                          {item.mediaType === "video" && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 px-1.5 py-0.2 rounded border border-red-200 dark:border-red-800/50">
                              <Video className="w-2.5 h-2.5" />
                              Video
                            </span>
                          )}
                          {item.isFullFetched && (
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-1 rounded font-medium">
                              Full
                            </span>
                          )}
                          {isWorkView &&
                            (item.workDispatchedAt ? (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700 font-medium">
                                <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                Dispatched
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-300 px-1.5 py-0.2 rounded border border-blue-200 dark:border-blue-800/50 font-medium">
                                <Briefcase className="w-2.5 h-2.5" />
                                Pending
                              </span>
                            ))}
                        </div>

                        <h3 className="font-semibold text-[13px] leading-snug line-clamp-2 mb-1.5">
                          {decodeHtmlEntities(item.title)}
                        </h3>

                        {item.snippet && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {decodeHtmlEntities(item.snippet)}
                          </p>
                        )}

                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                          <div className="flex items-center gap-2">
                            <span>
                              {item.publishedAt
                                ? new Date(item.publishedAt).toLocaleDateString()
                                : ""}
                            </span>
                            {isWorkView && item.workDispatchedAt && (
                              <button
                                type="button"
                                onClick={(e) => handleRequeueItem(e, item.id)}
                                className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                                title="Move back to pending digest"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                Re-queue
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {item.sourceQueue === "research_inbox" ? (
                              <span title="Saved in Deep Research">
                                <Bookmark className="w-3 h-3 fill-purple-500 text-purple-500" />
                              </span>
                            ) : item.isStarred ? (
                              <span title="Starred Article">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              </span>
                            ) : null}
                            {!item.isRead && !isSavedView && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Optional Thumbnail */}
                      {item.thumbnailUrl && (
                        <div className="w-16 h-16 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-950 flex-shrink-0 border border-slate-200 dark:border-slate-800">
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </button>
                  )}

                  {/* Collapsible Story Group Badge & Sub-articles */}
                  {hasRelated && (
                    <div className="px-3.5 pb-2 -mt-1 bg-inherit">
                      <button
                        type="button"
                        onClick={(e) => toggleCluster(item.id, e)}
                        className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 py-1 px-2 rounded-md bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100/70 dark:hover:bg-blue-900/50 transition-colors"
                      >
                        <Layers className="w-3 h-3" />
                        <span>
                          +{cluster.relatedStories.length} related{" "}
                          {cluster.relatedStories.length === 1 ? "source" : "sources"}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-blue-500/40 dark:border-blue-500/30">
                          {cluster.relatedStories.map((rel) => {
                            const isRelSelected = selectedItemId === rel.id;
                            return (
                              <div
                                key={rel.id}
                                onClick={() => onSelectItem(rel)}
                                className={`p-2 rounded-lg cursor-pointer transition-colors text-left ${
                                  isRelSelected
                                    ? "bg-blue-100/80 dark:bg-blue-950 text-blue-950 dark:text-blue-100"
                                    : "bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                                }`}
                              >
                                <div className="flex items-center gap-1 text-[9px] text-slate-500 dark:text-slate-400 mb-0.5">
                                  <span className="font-semibold text-blue-600 dark:text-blue-400 truncate max-w-[120px]">
                                    {rel.feedTitle}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {rel.publishedAt
                                      ? new Date(rel.publishedAt).toLocaleDateString()
                                      : ""}
                                  </span>
                                </div>
                                <div className="text-[11px] font-medium leading-tight line-clamp-1">
                                  {decodeHtmlEntities(rel.title)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </>
        )}

        {!loading &&
          (hiddenReadCount > 0 || sponsoredCount > 0 || roundupCount > 0 || vendorCount > 0) && (
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowFilteredDetails(!showFilteredDetails)}
                  className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium"
                >
                  <Filter className="w-3 h-3 text-amber-500" />
                  <span>
                    Noise Filtered:{" "}
                    {(hideRead ? hiddenReadCount : 0) +
                      (effectiveHideSponsored ? sponsoredCount : 0) +
                      (effectiveHideRoundups ? roundupCount : 0) +
                      (effectiveHideVendors ? vendorCount : 0)}{" "}
                    items
                  </span>
                  {showFilteredDetails ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </button>

                {hiddenReadCount > 0 && hideRead && (
                  <button
                    type="button"
                    onClick={toggleHideRead}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-[11px]"
                  >
                    Show {hiddenReadCount} read
                  </button>
                )}
              </div>

              {showFilteredDetails && (
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <div className="flex justify-between items-center py-0.5">
                    <span>Sponsored / Webinars:</span>
                    <span className="font-mono font-medium text-amber-600 dark:text-amber-400">
                      {sponsoredCount} {effectiveHideSponsored ? "(hidden)" : "(visible)"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span>Weekly Roundups:</span>
                    <span className="font-mono font-medium text-purple-600 dark:text-purple-400">
                      {roundupCount} {effectiveHideRoundups ? "(hidden)" : "(visible)"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span>Vendor Blogs:</span>
                    <span className="font-mono font-medium text-blue-600 dark:text-blue-400">
                      {vendorCount} {effectiveHideVendors ? "(hidden)" : "(visible)"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span>Read / Triaged:</span>
                    <span className="font-mono font-medium text-slate-600 dark:text-slate-400">
                      {hiddenReadCount} {hideRead ? "(hidden)" : "(visible)"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

        {!loading && hasMore && onLoadMore && (
          <div className="p-3">
            <button
              onClick={onLoadMore}
              className="w-full min-h-[44px] rounded-xl text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 active:scale-95 transition-all"
            >
              Load more articles
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
