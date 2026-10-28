"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Rss,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  Search,
  Filter,
  Zap,
  Edit2,
  X,
  FileText,
  Clock,
  Activity,
  Terminal,
  FileQuestion,
  Copy,
  BookmarkCheck,
  ArrowRight,
  Download,
  TrendingDown,
  VolumeX,
  Volume2,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

interface FeedItem {
  id: string;
  title: string;
  feedUrl: string;
  siteUrl?: string;
  category: string;
  feedType: string;
  editorialType?: string;
  autoFullFetch: boolean;
  isMuted?: boolean;
  isAuditWhitelisted?: boolean;
  errorCount: number;
  lastError: string | null;
  lastFetchedAt: string | null;
  lastPostAt?: number | null;
  totalArticles?: number;
  unreadCount?: number;
  engagedCount?: number;
}

function formatLastPostAgo(timestamp?: number | string | null) {
  if (!timestamp)
    return {
      text: "No posts",
      color: "text-slate-400 dark:text-slate-500",
      badge: "bg-slate-100 dark:bg-slate-800",
    };
  const tsMs =
    typeof timestamp === "string"
      ? new Date(timestamp).getTime()
      : timestamp < 10000000000
        ? timestamp * 1000
        : timestamp;
  if (isNaN(tsMs))
    return { text: "Unknown", color: "text-slate-400", badge: "bg-slate-100 dark:bg-slate-800" };

  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - tsMs) / 1000));

  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return {
      text: `${mins}m ago`,
      color: "text-emerald-700 dark:text-emerald-400",
      badge:
        "bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/40",
    };
  }
  const hours = Math.floor(diffSec / 3600);
  if (hours < 24) {
    return {
      text: `${hours}h ago`,
      color: "text-emerald-700 dark:text-emerald-400",
      badge:
        "bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/40",
    };
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return {
      text: `${days}d ago`,
      color: "text-blue-700 dark:text-blue-400",
      badge: "bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/40",
    };
  }
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return {
      text: `${weeks}w ago`,
      color: "text-slate-700 dark:text-slate-300",
      badge: "bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700",
    };
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return {
      text: `${months}mo ago`,
      color: "text-amber-700 dark:text-amber-400",
      badge: "bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/40",
    };
  }
  const years = (days / 365).toFixed(1);
  return {
    text: `${years}y ago`,
    color: "text-rose-700 dark:text-rose-400",
    badge: "bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/40",
  };
}

interface LogEntry {
  id: number;
  level: "INFO" | "WARN" | "ERROR" | "SYNC";
  tag: string;
  message: string;
  details?: any;
  createdAt: string;
}

interface FeedManagerViewProps {
  onFeedListChanged?: () => void;
  onSelectFeed?: (feedId: string) => void;
  initialTab?: "all" | "audit" | "empty" | "unreachable" | "autofetch" | "duplicates" | "logs";
}

export function FeedManagerView({
  onFeedListChanged,
  onSelectFeed,
  initialTab = "all",
}: FeedManagerViewProps) {
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedEditorial, setSelectedEditorial] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"name" | "unread" | "articles" | "engagement" | "last_post">(
    "name"
  );
  const [activeTab, setActiveTab] = useState<
    "all" | "audit" | "empty" | "unreachable" | "autofetch" | "duplicates" | "logs"
  >(initialTab);
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [mergingGroupKey, setMergingGroupKey] = useState<string | null>(null);

  // Feed Audit state
  const [auditData, setAuditData] = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActionInProgressFeedId, setAuditActionInProgressFeedId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Health check & sync states
  const [checkingFeedId, setCheckingFeedId] = useState<string | null>(null);
  const [batchChecking, setBatchChecking] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [batchHydrating, setBatchHydrating] = useState(false);
  const [hydrateResult, setHydrateResult] = useState<{
    totalFound: number;
    hydrated: number;
    failed: number;
  } | null>(null);

  const handleBatchHydrate = async () => {
    setBatchHydrating(true);
    setHydrateResult(null);
    try {
      const res = await fetch("/api/feeds/batch-hydrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100 }),
      });
      const data = await res.json();
      if (data.success) {
        setHydrateResult({
          totalFound: data.totalFound,
          hydrated: data.hydrated,
          failed: data.failed,
        });
        if (onFeedListChanged) onFeedListChanged();
        loadFeeds();
      }
    } catch (e) {
      console.error("Batch hydration failed", e);
    } finally {
      setBatchHydrating(false);
    }
  };

  // Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Add Feed Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addCategory, setAddCategory] = useState("General");
  const [addEditorialType, setAddEditorialType] = useState("independent");
  const [vendorAutoDetected, setVendorAutoDetected] = useState(false);
  const [addAutoFullFetch, setAddAutoFullFetch] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addCollision, setAddCollision] = useState<{
    id: string;
    title: string;
    category?: string;
    feedUrl?: string;
  } | null>(null);
  const [highlightedFeedId, setHighlightedFeedId] = useState<string | null>(null);

  const checkVendorKeyword = (text: string): boolean => {
    const t = text.toLowerCase();
    const vendorTokens = [
      "unit 42",
      "palo alto",
      "paloalto",
      "cisco",
      "talos",
      "checkpoint",
      "check point",
      "crowdstrike",
      "sentinelone",
      "cloudflare",
      "malwarebytes",
      "securelist",
      "kaspersky",
      "trend micro",
      "truesec",
      "volexity",
      "virustotal",
      "specterops",
      "mdsec",
      "palantir",
      "github",
      "a16z",
      "snyk",
      "wiz.io",
      "qualys",
      "rapid7",
      "cardinalops",
      "cybereason",
      "flashpoint",
      "mandiant",
      "recorded future",
      "recordedfuture",
    ];
    return vendorTokens.some((tok) => t.includes(tok));
  };

  const handleAddUrlChange = (val: string) => {
    setAddUrl(val);
    setAddError(null);
    setAddCollision(null);
    if (checkVendorKeyword(val) || checkVendorKeyword(addTitle)) {
      setAddEditorialType("vendor");
      setVendorAutoDetected(true);
    }
  };

  const handleAddTitleChange = (val: string) => {
    setAddTitle(val);
    if (checkVendorKeyword(val) || checkVendorKeyword(addUrl)) {
      setAddEditorialType("vendor");
      setVendorAutoDetected(true);
    }
  };

  // Edit Feed Modal state
  const [editingFeed, setEditingFeed] = useState<FeedItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editEditorialType, setEditEditorialType] = useState("independent");
  const [editUrl, setEditUrl] = useState("");
  const [editAutoFullFetch, setEditAutoFullFetch] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEditFeed = (feed: FeedItem) => {
    setEditingFeed(feed);
    setEditTitle(feed.title);
    setEditCategory(feed.category || "General");
    setEditEditorialType(feed.editorialType || "independent");
    setEditUrl(feed.feedUrl);
    setEditAutoFullFetch(feed.autoFullFetch || false);
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFeed) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/feeds/${editingFeed.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          category: editCategory,
          editorialType: editEditorialType,
          feedUrl: editUrl,
          autoFullFetch: editAutoFullFetch,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeeds((prev) =>
          prev.map((f) =>
            f.id === editingFeed.id
              ? {
                  ...f,
                  title: editTitle,
                  category: editCategory,
                  editorialType: editEditorialType,
                  feedUrl: editUrl,
                  autoFullFetch: editAutoFullFetch,
                }
              : f
          )
        );
        setEditingFeed(null);
        if (onFeedListChanged) onFeedListChanged();
      } else {
        setEditError(data.error || "Failed to update feed");
      }
    } catch (err: any) {
      setEditError(err.message || "Failed to update feed");
    } finally {
      setEditLoading(false);
    }
  };

  const loadFeeds = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/feeds");
      const data = await res.json();
      if (data.feeds) {
        setFeeds(data.feeds);
      }
    } catch (err) {
      console.error("Failed to load feeds", err);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch("/api/logs?limit=150");
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error("Failed to load logs", err);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadDuplicates = async () => {
    setLoadingDuplicates(true);
    try {
      const res = await fetch("/api/feeds/duplicates");
      const data = await res.json();
      if (data.duplicates) {
        setDuplicateGroups(data.duplicates);
      }
    } catch (err) {
      console.error("Failed to load duplicate feeds", err);
    } finally {
      setLoadingDuplicates(false);
    }
  };

  const handleMergeDuplicate = async (group: any) => {
    if (!group || !group.primaryFeed) return;
    const dupeIds = group.duplicateFeeds.map((d: any) => d.id);
    setMergingGroupKey(group.normalizedKey);
    try {
      const res = await fetch("/api/feeds/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryFeedId: group.primaryFeed.id,
          duplicateFeedIds: dupeIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await loadDuplicates();
        await loadFeeds();
        if (onFeedListChanged) onFeedListChanged();
      }
    } catch (err) {
      console.error("Failed to merge duplicate feeds", err);
    } finally {
      setMergingGroupKey(null);
    }
  };

  const loadAuditData = async () => {
    setAuditLoading(true);
    try {
      const res = await fetch("/api/feeds/audit");
      const data = await res.json();
      if (data && data.recommendations) {
        setAuditData(data);
      }
    } catch (err) {
      console.error("Failed to load feed audit recommendations", err);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleToggleMute = async (feedId: string, currentMuted: boolean) => {
    setAuditActionInProgressFeedId(feedId);
    try {
      const res = await fetch(`/api/feeds/${feedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isMuted: !currentMuted }),
      });
      if (res.ok) {
        await loadAuditData();
        await loadFeeds();
        if (onFeedListChanged) onFeedListChanged();
      }
    } catch (err) {
      console.error("Failed to toggle mute state", err);
    } finally {
      setAuditActionInProgressFeedId(null);
    }
  };

  const handleToggleWhitelist = async (feedId: string, currentWhitelisted: boolean) => {
    setAuditActionInProgressFeedId(feedId);
    try {
      const res = await fetch(`/api/feeds/${feedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAuditWhitelisted: !currentWhitelisted }),
      });
      if (res.ok) {
        await loadAuditData();
        await loadFeeds();
        if (onFeedListChanged) onFeedListChanged();
      }
    } catch (err) {
      console.error("Failed to toggle audit whitelist", err);
    } finally {
      setAuditActionInProgressFeedId(null);
    }
  };

  const handleUnsubscribeAudit = async (feedId: string, title: string) => {
    if (!confirm(`Are you sure you want to unsubscribe from "${title}" and remove its articles?`)) {
      return;
    }
    setAuditActionInProgressFeedId(feedId);
    try {
      const res = await fetch(`/api/feeds/${feedId}`, { method: "DELETE" });
      if (res.ok) {
        await loadAuditData();
        await loadFeeds();
        if (onFeedListChanged) onFeedListChanged();
      }
    } catch (err) {
      console.error("Failed to unsubscribe feed", err);
    } finally {
      setAuditActionInProgressFeedId(null);
    }
  };

  useEffect(() => {
    loadFeeds();
    loadDuplicates();
    loadAuditData();
  }, []);

  useEffect(() => {
    if (activeTab === "logs") {
      loadLogs();
      const interval = setInterval(loadLogs, 4000);
      return () => clearInterval(interval);
    } else if (activeTab === "duplicates") {
      loadDuplicates();
    } else if (activeTab === "audit") {
      loadAuditData();
    }
  }, [activeTab]);

  // Compute unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    feeds.forEach((f) => {
      if (f.category) set.add(f.category);
    });
    return Array.from(set).sort();
  }, [feeds]);

  // Filtered & sorted feeds list
  const filteredFeeds = useMemo(() => {
    const list = feeds.filter((f) => {
      // Tab filter
      if (activeTab === "empty" && (f.totalArticles || 0) > 0) return false;
      if (activeTab === "unreachable" && (f.errorCount || 0) === 0) return false;
      if (activeTab === "autofetch" && !f.autoFullFetch) return false;

      // Category filter
      if (selectedCategory !== "ALL" && f.category !== selectedCategory) return false;

      // Editorial filter
      if (selectedEditorial !== "ALL" && (f.editorialType || "independent") !== selectedEditorial)
        return false;

      // Search query filter
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = f.title.toLowerCase().includes(q);
        const matchesUrl = f.feedUrl.toLowerCase().includes(q);
        const matchesCategory = f.category?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesUrl && !matchesCategory) return false;
      }

      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === "unread") return (b.unreadCount || 0) - (a.unreadCount || 0);
      if (sortBy === "articles") return (b.totalArticles || 0) - (a.totalArticles || 0);
      if (sortBy === "engagement") return (b.engagedCount || 0) - (a.engagedCount || 0);
      if (sortBy === "last_post") {
        const aPost = a.lastPostAt ? new Date(a.lastPostAt).getTime() : 0;
        const bPost = b.lastPostAt ? new Date(b.lastPostAt).getTime() : 0;
        return bPost - aPost;
      }
      return a.title.localeCompare(b.title);
    });
  }, [feeds, activeTab, selectedCategory, selectedEditorial, sortBy, searchQuery]);

  // Stats
  const emptyCount = useMemo(
    () => feeds.filter((f) => (f.totalArticles || 0) === 0).length,
    [feeds]
  );
  const unreachableCount = useMemo(
    () => feeds.filter((f) => (f.errorCount || 0) > 0).length,
    [feeds]
  );
  const autoFetchCount = useMemo(() => feeds.filter((f) => f.autoFullFetch).length, [feeds]);

  // Single Feed Check
  const handleCheckFeed = async (feedId: string) => {
    setCheckingFeedId(feedId);
    try {
      const res = await fetch(`/api/feeds/${feedId}/check`, { method: "POST" });
      const data = await res.json();
      if (data.healthy) {
        setFeeds((prev) =>
          prev.map((f) =>
            f.id === feedId
              ? { ...f, errorCount: 0, lastError: null, lastFetchedAt: new Date().toISOString() }
              : f
          )
        );
      } else {
        setFeeds((prev) =>
          prev.map((f) =>
            f.id === feedId
              ? {
                  ...f,
                  errorCount: data.errorCount || (f.errorCount || 0) + 1,
                  lastError: data.lastError || "Reachability failed",
                }
              : f
          )
        );
      }
      if (onFeedListChanged) onFeedListChanged();
    } catch (err) {
      console.error("Check failed", err);
    } finally {
      setCheckingFeedId(null);
    }
  };

  // Sync All Feeds
  const handleSyncAllFeeds = async () => {
    setSyncingAll(true);
    try {
      await fetch("/api/feeds/sync-all?async=true", { method: "POST" });
      const interval = setInterval(async () => {
        try {
          const res = await fetch("/api/feeds/sync-all");
          const data = await res.json();
          if (!data.inProgress) {
            clearInterval(interval);
            setSyncingAll(false);
            await loadFeeds();
            if (activeTab === "logs") await loadLogs();
            if (onFeedListChanged) onFeedListChanged();
          }
        } catch {
          clearInterval(interval);
          setSyncingAll(false);
        }
      }, 3000);
    } catch (err) {
      console.error("Sync all failed", err);
      setSyncingAll(false);
    }
  };

  // Toggle Auto-Hydrate
  const handleToggleAutoHydrate = async (feed: FeedItem) => {
    const updated = !feed.autoFullFetch;
    try {
      await fetch(`/api/feeds/${feed.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFullFetch: updated }),
      });
      setFeeds((prev) =>
        prev.map((f) => (f.id === feed.id ? { ...f, autoFullFetch: updated } : f))
      );
    } catch (err) {
      console.error("Failed to toggle autoFullFetch", err);
    }
  };

  // Delete Feed
  const handleDeleteFeed = async (feedId: string, title: string) => {
    if (
      !confirm(`Are you sure you want to delete "${title}"? This will delete all its articles.`)
    ) {
      return;
    }

    try {
      await fetch(`/api/feeds/${feedId}`, { method: "DELETE" });
      setFeeds((prev) => prev.filter((f) => f.id !== feedId));
      if (onFeedListChanged) onFeedListChanged();
    } catch (err) {
      console.error("Failed to delete feed", err);
    }
  };

  // Add Feed Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUrl.trim()) return;

    setAddLoading(true);
    setAddError(null);
    setAddCollision(null);

    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedUrl: addUrl.trim(),
          title: addTitle.trim() || undefined,
          category: addCategory.trim() || "General",
          editorialType: addEditorialType,
          autoFullFetch: addAutoFullFetch,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 || data.collision || data.feedId) {
          const existingInfo = data.existingFeed || {
            id: data.feedId,
            title: data.error?.match(/"([^"]+)"/)?.[1] || "Existing Feed",
            category: "General",
            feedUrl: addUrl.trim(),
          };
          setAddCollision(existingInfo);
          return;
        }
        throw new Error(data.error || "Failed to add feed");
      }

      setShowAddModal(false);
      setAddUrl("");
      setAddTitle("");
      setAddCategory("General");
      setAddEditorialType("independent");
      setAddAutoFullFetch(false);
      setAddCollision(null);
      await loadFeeds();
      if (onFeedListChanged) onFeedListChanged();
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 md:p-8 text-slate-800 dark:text-slate-200 transition-colors">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-6 border-b border-slate-200 dark:border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Rss className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <span>Feed Manager & Health Monitor</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Review {feeds.length} subscriptions, audit reachability, monitor real-time sync logs, or
            ingest fresh articles.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Export OPML Button */}
          <a
            href="/api/feeds/export/opml"
            download="synapse-subscriptions.opml"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-sm transition-all"
            title="Download full subscriptions in standard OPML format"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export OPML</span>
          </a>

          {/* Sync All Feeds Button */}
          <button
            onClick={handleSyncAllFeeds}
            disabled={syncingAll}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20 transition-all"
            title="Fetch latest articles for all 218 feeds"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingAll ? "animate-spin" : ""}`} />
            <span>{syncingAll ? "Syncing All Feeds..." : "Sync All Feeds"}</span>
          </button>

          {/* Add Feed Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Feed</span>
          </button>
        </div>
      </div>

      {/* Tabs & Search Filter Strip */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
          {/* Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "all"
                  ? "bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              All Feeds ({feeds.length})
            </button>

            <button
              onClick={() => setActiveTab("audit")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "audit"
                  ? "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40 font-semibold"
                  : (auditData?.summary?.recommendedCount || 0) > 0
                    ? "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>
                Feed Audit{" "}
                {(auditData?.summary?.recommendedCount || 0) > 0 &&
                  `(${auditData.summary.recommendedCount})`}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("empty")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "empty"
                  ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 font-semibold"
                  : emptyCount > 0
                    ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <FileQuestion className="w-3.5 h-3.5" />
              <span>Empty Feeds ({emptyCount})</span>
            </button>

            <button
              onClick={() => setActiveTab("unreachable")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "unreachable"
                  ? "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 font-semibold"
                  : unreachableCount > 0
                    ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Needs Attention ({unreachableCount})</span>
            </button>

            <button
              onClick={() => setActiveTab("autofetch")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "autofetch"
                  ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/40 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Auto-Hydrate Snippets ({autoFetchCount})</span>
            </button>

            <button
              onClick={() => setActiveTab("duplicates")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "duplicates"
                  ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Copy className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>
                Duplicate Feeds {duplicateGroups.length > 0 && `(${duplicateGroups.length})`}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("logs")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "logs"
                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Activity & Sync Logs</span>
            </button>
          </div>
        </div>

        {/* Search & Category Filter (for feed tabs) */}
        {activeTab !== "logs" && (
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search subscriptions by title or URL..."
                className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Categories ({categories.length})</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <select
                value={selectedEditorial}
                onChange={(e) => setSelectedEditorial(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="ALL">All Origins / Bias</option>
                <option value="independent">Independent Only</option>
                <option value="vendor">Vendor / Commercial Only</option>
                <option value="community">Community Only</option>
                <option value="official">Official / Government Only</option>
                <option value="news">News Only</option>
              </select>

              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="name">Sort: Name (A-Z)</option>
                <option value="engagement">Sort: Most Engaged Reads</option>
                <option value="unread">Sort: Most Unread</option>
                <option value="articles">Sort: Total Articles</option>
                <option value="last_post">Sort: Recently Active</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Main Content: Feeds Table vs Activity Logs */}
      {activeTab === "audit" ? (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="p-5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <h2 className="text-sm font-bold text-rose-950 dark:text-rose-200">
                  Feed Signal vs. Noise Audit
                </h2>
                {auditData?.summary && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-200/80 dark:bg-rose-900/80 text-rose-800 dark:text-rose-200">
                    {auditData.summary.recommendedCount} Candidate
                    {auditData.summary.recommendedCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <p className="text-xs text-rose-800/80 dark:text-rose-300/80 max-w-2xl leading-relaxed">
                Synapse audits your subscriptions against genuine dwell time (≥30s reading),
                flick/skip rates, and syndication duplication. Feeds below generate high triage
                overhead with minimal reading payoff.
              </p>
            </div>
            <button
              onClick={loadAuditData}
              disabled={auditLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100/50 dark:hover:bg-rose-950/50 shadow-sm shrink-0 self-start md:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? "animate-spin" : ""}`} />
              <span>Re-run Audit</span>
            </button>
          </div>

          {/* Audit Cards or Empty State */}
          {auditLoading ? (
            <div className="p-12 text-center text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
              <span>Analyzing reading dwell time and article duplication...</span>
            </div>
          ) : !auditData || auditData.recommendations.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-500 space-y-2">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto opacity-80" />
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Your Reading Diet is High-Signal
              </div>
              <p className="text-slate-400 max-w-md mx-auto">
                None of your subscribed feeds currently trigger loud volume exhaustion or
                zero-engagement thresholds.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {auditData.recommendations.map((rec: any) => {
                const isWorking = auditActionInProgressFeedId === rec.feedId;
                const badgeColor =
                  rec.reasonKey === "loud_exhaustion"
                    ? "bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                    : rec.reasonKey === "pure_duplicate"
                      ? "bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                      : rec.reasonKey === "skim_only"
                        ? "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";

                return (
                  <div
                    key={rec.feedId}
                    className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {rec.feedTitle}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}
                          >
                            {rec.reasonLabel}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {rec.category}
                          </span>
                          {rec.isMuted && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              Muted
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 truncate max-w-lg">
                          {rec.feedUrl}
                        </div>
                      </div>

                      {/* Fatigue score indicator */}
                      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] uppercase font-bold text-slate-400">
                            Fatigue Index
                          </div>
                          <div className="text-sm font-bold text-rose-600 dark:text-rose-400">
                            {rec.fatigueScore} / 100
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Diagnostics & Evidence Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400">90-Day Volume</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          {rec.recentArticles} articles
                        </div>
                        <div className="text-[9px] text-slate-400">
                          {rec.totalArticles} all-time
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">Engaged Reads (≥30s)</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          {rec.engagedCount}
                        </div>
                        <div className="text-[9px] text-slate-400">
                          {rec.totalArticles > 0
                            ? Math.round((rec.engagedCount / rec.totalArticles) * 100)
                            : 0}
                          % engagement
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">Avg Reading Dwell</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          {rec.avgDwellSeconds}s
                        </div>
                        <div className="text-[9px] text-slate-400">
                          {rec.flickedCount} quick dismissals
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">Saved / Starred</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          {rec.starredCount}
                        </div>
                        <div className="text-[9px] text-slate-400">
                          {rec.duplicateStoryCount > 0
                            ? `${rec.duplicateStoryCount} duplicate stories`
                            : "0 saved"}
                        </div>
                      </div>
                    </div>

                    {/* Human Explanation */}
                    <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-amber-50/50 dark:bg-amber-950/20 p-2.5 rounded-lg border border-amber-200/50 dark:border-amber-900/30">
                      <span className="font-semibold text-amber-900 dark:text-amber-300">
                        Diagnosis:{" "}
                      </span>
                      {rec.reasonDescription}
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      <div className="text-[11px] text-slate-400">
                        {rec.isMuted
                          ? "Fetching is currently paused for this feed."
                          : "Choose an action to reduce triage noise:"}
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {/* Whitelist / Keep Button */}
                        <button
                          onClick={() => handleToggleWhitelist(rec.feedId, false)}
                          disabled={isWorking}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5"
                          title="Exempt this feed from future audit recommendations"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Keep Feed</span>
                        </button>

                        {/* Mute / Unmute Button */}
                        <button
                          onClick={() => handleToggleMute(rec.feedId, rec.isMuted)}
                          disabled={isWorking}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                            rec.isMuted
                              ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
                              : "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border-amber-200 dark:border-amber-800/60"
                          }`}
                          title={
                            rec.isMuted
                              ? "Resume background synchronization"
                              : "Pause background sync without deleting history"
                          }
                        >
                          {rec.isMuted ? (
                            <>
                              <Volume2 className="w-3.5 h-3.5" />
                              <span>Unmute</span>
                            </>
                          ) : (
                            <>
                              <VolumeX className="w-3.5 h-3.5" />
                              <span>Mute Sync</span>
                            </>
                          )}
                        </button>

                        {/* Unsubscribe Button */}
                        <button
                          onClick={() => handleUnsubscribeAudit(rec.feedId, rec.feedTitle)}
                          disabled={isWorking}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-1.5 shadow-sm"
                          title="Unsubscribe and remove all articles"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Unsubscribe</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Managed Feed Exceptions Drawer */}
          {(auditData?.mutedFeeds?.length > 0 || auditData?.whitelistedFeeds?.length > 0) && (
            <div className="mt-8 border-t border-slate-200 dark:border-slate-800 pt-6 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Managed Feed Exceptions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Muted Feeds */}
                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <VolumeX className="w-3.5 h-3.5 text-amber-500" />
                      Muted Subscriptions ({auditData?.mutedFeeds?.length || 0})
                    </span>
                  </div>
                  {auditData?.mutedFeeds?.length === 0 ? (
                    <div className="text-[11px] text-slate-400">No feeds are currently muted.</div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {auditData.mutedFeeds.map((mf: any) => (
                        <div key={mf.id} className="py-2 flex items-center justify-between gap-2">
                          <div className="truncate">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {mf.title}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-2">({mf.category})</span>
                          </div>
                          <button
                            onClick={() => handleToggleMute(mf.id, true)}
                            className="px-2 py-0.5 rounded text-[11px] font-semibold text-amber-600 hover:text-amber-700 border border-amber-200 dark:border-amber-800 shrink-0"
                          >
                            Unmute
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Whitelisted Feeds */}
                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      Audit Whitelist ({auditData?.whitelistedFeeds?.length || 0})
                    </span>
                  </div>
                  {auditData?.whitelistedFeeds?.length === 0 ? (
                    <div className="text-[11px] text-slate-400">
                      No feeds are currently whitelisted.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {auditData.whitelistedFeeds.map((wf: any) => (
                        <div key={wf.id} className="py-2 flex items-center justify-between gap-2">
                          <div className="truncate">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {wf.title}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-2">({wf.category})</span>
                          </div>
                          <button
                            onClick={() => handleToggleWhitelist(wf.id, true)}
                            className="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === "logs" ? (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-semibold text-xs text-slate-900 dark:text-white">
                Real-Time Sync & Engine Logs
              </span>
            </div>
            <button
              onClick={loadLogs}
              disabled={logsLoading}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-500"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? "animate-spin" : ""}`} />
              <span>Refresh Logs</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs max-h-[600px] overflow-y-auto">
            {logs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 dark:text-slate-500">
                No log entries recorded yet. Click &quot;Sync All Feeds&quot; to generate activity.
              </div>
            ) : (
              logs.map((log) => {
                const badgeColor =
                  log.level === "ERROR"
                    ? "bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900"
                    : log.level === "WARN"
                      ? "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900"
                      : log.level === "SYNC"
                        ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                        : "bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900";

                return (
                  <div
                    key={log.id}
                    className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 mb-1 text-[11px]">
                      <span
                        className={`px-1.5 py-0.2 rounded border text-[10px] font-bold ${badgeColor}`}
                      >
                        {log.level}
                      </span>
                      <span className="text-purple-600 dark:text-purple-400 font-semibold">
                        [{log.tag}]
                      </span>
                      <span className="text-slate-400 dark:text-slate-500 text-[10px] ml-auto">
                        {log.createdAt}
                      </span>
                    </div>
                    <div className="text-slate-800 dark:text-slate-200 text-xs">{log.message}</div>
                    {log.details && (
                      <pre className="mt-1.5 p-2 bg-slate-100 dark:bg-slate-950 rounded text-[10px] text-slate-600 dark:text-slate-400 overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : activeTab === "duplicates" ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/30 flex items-start gap-3 shadow-sm">
            <Copy className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="font-bold text-amber-900 dark:text-amber-300">
                Duplicate Subscriptions & Feeds ({duplicateGroups.length} detected)
              </div>
              <p className="text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                These subscriptions point to identical feed endpoints or share the exact same
                publication domain and title. Click <strong>Merge Feeds</strong> to reassign all
                articles to the primary subscription and delete the duplicate entry.
              </p>
            </div>
          </div>

          {loadingDuplicates ? (
            <div className="p-12 text-center text-xs text-slate-400 dark:text-slate-500">
              Scanning subscriptions for duplicates...
            </div>
          ) : duplicateGroups.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-500 space-y-2">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                No Duplicate Subscriptions Found
              </div>
              <p className="text-slate-400">
                All registered feeds have unique URLs and canonical sources.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {duplicateGroups.map((group) => (
                <div
                  key={group.normalizedKey}
                  className="p-4 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/50 rounded-xl shadow-sm space-y-3"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          {group.primaryFeed.title}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                          Primary ({group.primaryFeed.totalArticles || 0} articles)
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate max-w-lg">
                        {group.primaryFeed.feedUrl}
                      </div>
                    </div>
                    <button
                      onClick={() => handleMergeDuplicate(group)}
                      disabled={mergingGroupKey === group.normalizedKey}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 shrink-0"
                    >
                      {mergingGroupKey === group.normalizedKey ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Merging...</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>
                            Merge {group.duplicateFeeds.length} Duplicate
                            {group.duplicateFeeds.length > 1 ? "s" : ""}
                          </span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-1.5 pl-2 border-l-2 border-amber-200 dark:border-amber-800/60 text-xs">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Duplicate Instances to be Consolidated:
                    </div>
                    {group.duplicateFeeds.map((dupe: any) => (
                      <div
                        key={dupe.id}
                        className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-400 py-1"
                      >
                        <div className="truncate max-w-md">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {dupe.title}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 ml-2">
                            ({dupe.feedUrl})
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {dupe.totalArticles || 0} articles
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {activeTab === "empty" && (
            <div className="mb-4 p-4 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/30 flex items-start gap-3 shadow-sm">
              <FileQuestion className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <div className="font-bold text-amber-900 dark:text-amber-300">
                  Empty Feed Audit Queue ({emptyCount} feeds with 0 articles)
                </div>
                <p className="text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                  These subscriptions currently have 0 articles recorded. This usually means the XML
                  endpoint has moved, requires authentication, or is pointing to a generic website
                  landing page. Use <strong>Check</strong> to attempt re-fetching, or{" "}
                  <strong>Edit</strong> to inspect and update the feed URL.
                </p>
              </div>
            </div>
          )}

          {activeTab === "autofetch" && (
            <div className="mb-4 p-4 rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/70 dark:bg-purple-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-purple-900 dark:text-purple-300">
                    Auto-Hydrate Subscriptions ({autoFetchCount} feeds enabled)
                  </div>
                  <p className="text-purple-800/80 dark:text-purple-300/80 leading-relaxed">
                    Articles from these feeds are automatically processed with full readability
                    extraction. Click below to backfill and pre-hydrate any older unfetched
                    articles.
                  </p>
                  {hydrateResult && (
                    <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                      ✅ Batch complete: {hydrateResult.hydrated} articles pre-hydrated (
                      {hydrateResult.failed} failed/skipped of {hydrateResult.totalFound} pending).
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={handleBatchHydrate}
                disabled={batchHydrating}
                className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-sm disabled:opacity-50 transition-all cursor-pointer"
              >
                <Zap className={`w-3.5 h-3.5 ${batchHydrating ? "animate-spin" : ""}`} />
                <span>{batchHydrating ? "Hydrating Queue..." : "Hydrate All Pending"}</span>
              </button>
            </div>
          )}

          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50 dark:bg-slate-950/50">
                    <th className="py-3 px-4">Subscription</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Articles & Reads</th>
                    <th className="py-3 px-3">Last Post</th>
                    <th className="py-3 px-3">Auto-Hydrate</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs text-slate-700 dark:text-slate-300">
                  {filteredFeeds.map((feed) => {
                    const isChecking = checkingFeedId === feed.id;
                    const hasError = (feed.errorCount || 0) > 0;

                    return (
                      <tr
                        key={feed.id}
                        className={`transition-all duration-300 ${
                          highlightedFeedId === feed.id
                            ? "bg-amber-100/80 dark:bg-amber-950/60 ring-2 ring-amber-500 rounded-lg"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        {/* Subscription Title & URL */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900 dark:text-white truncate">
                              {feed.title}
                            </span>
                            {feed.editorialType === "vendor" && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0"
                                title="Vendor blog — commercial bias"
                              >
                                Vendor
                              </span>
                            )}
                            {feed.editorialType === "official" && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30 shrink-0"
                                title="Official agency / standard body"
                              >
                                Official
                              </span>
                            )}
                            {feed.editorialType === "community" && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shrink-0"
                                title="Community / non-profit"
                              >
                                Community
                              </span>
                            )}
                            {feed.editorialType === "news" && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30 shrink-0"
                                title="News publication"
                              >
                                News
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5 flex items-center gap-1.5">
                            <span className="truncate">{feed.feedUrl}</span>
                            {feed.siteUrl && (
                              <a
                                href={feed.siteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-400 hover:text-blue-500"
                                title="Visit website"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          {feed.lastError && (
                            <div className="mt-1 text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded border border-red-200 dark:border-red-900/40 truncate">
                              {feed.lastError}
                            </div>
                          )}
                        </td>

                        {/* Category */}
                        <td className="py-3 px-3">
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-medium">
                            {feed.category || "General"}
                          </span>
                        </td>

                        {/* Articles & Engagement Count */}
                        <td className="py-3 px-3">
                          <div className="font-mono text-slate-900 dark:text-slate-200 font-medium">
                            {feed.totalArticles || 0}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5 whitespace-nowrap">
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              {feed.engagedCount || 0} read
                            </span>
                            <span>•</span>
                            <span>{feed.unreadCount || 0} unread</span>
                          </div>
                        </td>

                        {/* Last Post (Time Ago) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {(() => {
                            const postInfo = formatLastPostAgo(feed.lastPostAt);
                            return (
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium ${postInfo.badge} ${postInfo.color}`}
                                title={
                                  feed.lastPostAt
                                    ? `Last posted: ${new Date(
                                        feed.lastPostAt < 10000000000
                                          ? feed.lastPostAt * 1000
                                          : feed.lastPostAt
                                      ).toLocaleString()}`
                                    : "No articles posted yet"
                                }
                              >
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>{postInfo.text}</span>
                              </span>
                            );
                          })()}
                        </td>

                        {/* Auto-Hydrate Snippet Toggle */}
                        <td className="py-3 px-3">
                          <button
                            onClick={() => handleToggleAutoHydrate(feed)}
                            className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors ${
                              feed.autoFullFetch
                                ? "bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 font-semibold"
                                : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            }`}
                          >
                            <Zap
                              className={`w-3 h-3 ${feed.autoFullFetch ? "fill-current" : ""}`}
                            />
                            <span>{feed.autoFullFetch ? "Auto-Hydrate" : "Snippet only"}</span>
                          </button>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3">
                          {hasError ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {feed.errorCount} Errors
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Healthy
                            </span>
                          )}
                          {feed.lastFetchedAt && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {new Date(feed.lastFetchedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditFeed(feed)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                              title="Edit Feed"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleCheckFeed(feed.id)}
                              disabled={isChecking}
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                              title="Fetch feed immediately"
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 ${isChecking ? "animate-spin text-blue-500" : ""}`}
                              />
                            </button>
                            <button
                              onClick={() => handleDeleteFeed(feed.id, feed.title)}
                              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                              title="Delete Feed"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add Feed Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Add New RSS / Atom Feed
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Feed URL (RSS, Atom, or YouTube URL / @Handle) *
                </label>
                <input
                  type="text"
                  required
                  value={addUrl}
                  onChange={(e) => handleAddUrlChange(e.target.value)}
                  placeholder="https://example.com/feed.xml or @mkbhd"
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
                {(addUrl.includes("youtube.com") ||
                  addUrl.includes("youtu.be") ||
                  addUrl.trim().startsWith("@") ||
                  /^UC[a-zA-Z0-9_-]{22}$/.test(addUrl.trim())) && (
                  <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400">
                    <span>🎬</span>
                    <span>
                      <strong>YouTube detected:</strong> Synapse will automatically subscribe to
                      long-form videos only (Shorts & Lives excluded).
                    </span>
                  </div>
                )}
                {vendorAutoDetected && addEditorialType === "vendor" && (
                  <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-400">
                    <span>🏷️</span>
                    <span>
                      <strong>Commercial vendor detected:</strong> Pre-selected as{" "}
                      <strong>Vendor</strong> (promotional / commercial bias). You can change this
                      below if independent.
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Custom Title (Optional)
                </label>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => handleAddTitleChange(e.target.value)}
                  placeholder="Leave empty to auto-detect"
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Category
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {categories.map((cat) => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setAddCategory(cat)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                        addCategory === cat
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm font-semibold"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAddCategory("")}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                      !categories.includes(addCategory) && addCategory.length > 0
                        ? "bg-purple-600 text-white border-purple-600 shadow-sm font-semibold"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    + New Category
                  </button>
                </div>
                <input
                  type="text"
                  value={addCategory}
                  onChange={(e) => setAddCategory(e.target.value)}
                  placeholder="Select from above or type new category..."
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Editorial Type / Publication Bias
                  </label>
                  {addEditorialType === "vendor" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-semibold">
                      Commercial Vendor Tag
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { id: "independent", label: "Independent", desc: "Personal blog / research" },
                    { id: "vendor", label: "Vendor", desc: "Commercial / promo bias" },
                    { id: "community", label: "Community", desc: "Non-profit / working group" },
                    { id: "official", label: "Official", desc: "Gov / standards body" },
                    { id: "news", label: "News", desc: "Journalism / media" },
                  ].map((t) => {
                    const isSelected = addEditorialType === t.id;
                    const isVendor = t.id === "vendor";
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => {
                          setAddEditorialType(t.id);
                          if (t.id !== "vendor") setVendorAutoDetected(false);
                        }}
                        className={`p-2 rounded-lg border text-left transition-all ${
                          isSelected
                            ? isVendor
                              ? "bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-900 dark:text-amber-200 shadow-sm"
                              : "bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-900 dark:text-blue-200 shadow-sm"
                            : isVendor
                              ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-400 hover:border-amber-400"
                              : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                        }`}
                      >
                        <div
                          className={`font-semibold text-xs ${isSelected && isVendor ? "text-amber-800 dark:text-amber-300" : ""}`}
                        >
                          {t.label}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{t.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {addCollision && (
                <div className="p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 space-y-3 animate-in fade-in">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
                      <BookmarkCheck className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs uppercase tracking-wider text-amber-800 dark:text-amber-300">
                          Subscription Collision
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200">
                          Already Subscribed
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white mt-1 truncate">
                        {addCollision.title}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                        This feed is already active in your subscriptions under category{" "}
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          "{addCollision.category || "General"}"
                        </span>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-amber-200 dark:border-amber-800/40">
                    <button
                      type="button"
                      onClick={() => setAddCollision(null)}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Dismiss
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const id = addCollision.id;
                          const title = addCollision.title;
                          setShowAddModal(false);
                          setAddCollision(null);
                          setSearchQuery(title);
                          setSelectedCategory("ALL");
                          setActiveTab("all");
                          setHighlightedFeedId(id);
                          setTimeout(() => setHighlightedFeedId(null), 4500);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-200 hover:bg-amber-300 dark:bg-amber-900/80 dark:hover:bg-amber-800 text-amber-950 dark:text-amber-100 transition-colors"
                      >
                        Find in Manager
                      </button>
                      {onSelectFeed && (
                        <button
                          type="button"
                          onClick={() => {
                            const id = addCollision.id;
                            setShowAddModal(false);
                            setAddCollision(null);
                            onSelectFeed(id);
                          }}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-colors flex items-center gap-1.5"
                        >
                          <span>Open Articles</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {addError && !addCollision && (
                <div className="p-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg border border-red-200 dark:border-red-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{addError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm disabled:opacity-50"
                >
                  {addLoading ? "Adding..." : "Add Subscription"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Feed Modal */}
      {editingFeed && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Subscription
              </h2>
              <button
                onClick={() => setEditingFeed(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Feed URL
                </label>
                <input
                  type="text"
                  required
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Category
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {categories.map((cat) => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setEditCategory(cat)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                        editCategory === cat
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm font-semibold"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditCategory("")}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                      !categories.includes(editCategory) && editCategory.length > 0
                        ? "bg-purple-600 text-white border-purple-600 shadow-sm font-semibold"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    + New Category
                  </button>
                </div>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="Select from above or type new category..."
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Editorial Type / Publication Bias
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { id: "independent", label: "Independent", desc: "Personal blog / research" },
                    { id: "vendor", label: "Vendor", desc: "Commercial / promo bias" },
                    { id: "community", label: "Community", desc: "Non-profit / working group" },
                    { id: "official", label: "Official", desc: "Gov / standards body" },
                    { id: "news", label: "News", desc: "Journalism / media" },
                  ].map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setEditEditorialType(t.id)}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        editEditorialType === t.id
                          ? "bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-900 dark:text-blue-200 shadow-sm"
                          : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold text-xs">{t.label}</div>
                      <div className="text-[10px] text-slate-400 truncate">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editAutoFullFetch"
                  checked={editAutoFullFetch}
                  onChange={(e) => setEditAutoFullFetch(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <label
                  htmlFor="editAutoFullFetch"
                  className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Always auto-hydrate full article content (bypasses snippets)
                </label>
              </div>

              {editError && (
                <div className="p-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded border border-red-200 dark:border-red-900">
                  {editError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingFeed(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm disabled:opacity-50"
                >
                  {editLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
