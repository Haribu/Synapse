"use client";

import React, { useState, useEffect } from "react";
import {
  Rss,
  Inbox,
  Bookmark,
  Plus,
  Upload,
  Folder,
  Layers,
  BarChart3,
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  X,
  RefreshCw,
  Star,
  CheckCircle2,
  Clock,
  Briefcase,
  Video,
  PlaySquare,
  HelpCircle,
  GitCommit,
  Filter,
  Settings,
  Search,
  MessageSquarePlus,
} from "lucide-react";
import { APP_VERSION, GIT_COMMIT, COPYRIGHT_NOTICE } from "@/lib/version";

interface Feed {
  id: string;
  title: string;
  category: string;
  unreadCount?: number;
}

interface Board {
  id: string;
  name: string;
  color?: string;
}

type SidebarView =
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

interface FeedSidebarProps {
  feeds: Feed[];
  boards: Board[];
  totalUnread?: number;
  selectedCategory: string | null;
  selectedFeedId: string | null;
  selectedView: SidebarView;
  onSelectView: (view: SidebarView, id?: string) => void;
  onSelectCategory?: (category: string) => void;
  onRefreshFeeds: () => void;
  onCloseMobile?: () => void;
  onOpenGuide?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenFeedback?: () => void;
  width?: number;
}

export function FeedSidebar({
  feeds,
  boards,
  totalUnread = 0,
  selectedCategory,
  selectedFeedId,
  selectedView,
  onSelectView,
  onSelectCategory,
  onRefreshFeeds,
  onCloseMobile,
  onOpenGuide,
  onOpenCommandPalette,
  onOpenFeedback,
  width,
}: FeedSidebarProps) {
  const [opmlLoading, setOpmlLoading] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [expandedReadCategories, setExpandedReadCategories] = useState<Record<string, boolean>>({});
  const [hideReadFeeds, setHideReadFeeds] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Initialize theme and hideReadFeeds from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem("synapse_theme");
    if (savedTheme) {
      const isDark = savedTheme === "dark";
      setIsDarkMode(isDark);
      document.documentElement.classList.toggle("dark", isDark);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDarkMode(prefersDark);
      document.documentElement.classList.toggle("dark", prefersDark);
    }

    const savedHideRead = localStorage.getItem("synapse_hide_read_feeds");
    if (savedHideRead !== null) {
      setHideReadFeeds(savedHideRead === "true");
    }
  }, []);

  const toggleHideReadFeeds = () => {
    const next = !hideReadFeeds;
    setHideReadFeeds(next);
    localStorage.setItem("synapse_hide_read_feeds", String(next));
  };

  const toggleReadFeeds = (cat: string) => {
    setExpandedReadCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem("synapse_theme", nextDark ? "dark" : "light");
  };

  // Group feeds by category
  const categories = feeds.reduce(
    (acc, feed) => {
      const cat = feed.category || "General";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(feed);
      return acc;
    },
    {} as Record<string, Feed[]>
  );

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Batch sync all feeds
  const handleSyncAllFeeds = async () => {
    setSyncingAll(true);
    try {
      await fetch("/api/feeds/sync-all?async=true", { method: "POST" });
      // Poll sync status
      const interval = setInterval(async () => {
        try {
          const res = await fetch("/api/feeds/sync-all");
          const data = await res.json();
          if (!data.inProgress) {
            clearInterval(interval);
            setSyncingAll(false);
            onRefreshFeeds();
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

  const handleOpmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOpmlLoading(true);
    const formData = new FormData();
    formData.append("opml", file);

    try {
      const res = await fetch("/api/feeds/import-opml", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        onRefreshFeeds();
      }
    } catch (err) {
      console.error("OPML import failed", err);
    } finally {
      setOpmlLoading(false);
    }
  };

  return (
    <aside
      style={width ? { width: `${width}px` } : undefined}
      className="w-64 border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex flex-col h-full select-none flex-shrink-0 transition-colors"
    >
      {/* Brand Header */}
      <div className="h-14 border-b border-[var(--sidebar-border)] px-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/favicon.svg"
            alt="Synapse Logo"
            className="w-7 h-7 rounded-lg shadow-md shadow-blue-500/20"
          />
          <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">
            Synapse
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Guide / Help Modal Button */}
          {onOpenGuide && (
            <button
              onClick={onOpenGuide}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors"
              title="Synapse Guide & Workflows"
              aria-label="Open Synapse Guide"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}

          {/* Sync All Feeds Button */}
          <button
            onClick={handleSyncAllFeeds}
            disabled={syncingAll}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors"
            title={syncingAll ? "Syncing all feeds in background..." : "Sync & Refresh All Feeds"}
            aria-label="Sync all feeds"
          >
            <RefreshCw className={`w-4 h-4 ${syncingAll ? "animate-spin text-blue-500" : ""}`} />
          </button>

          {/* Light / Dark Mode Toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors"
            title={
              isDarkMode ? "Switch to Warm Paper Light Mode" : "Switch to Deep Obsidian Dark Mode"
            }
            aria-label="Toggle theme"
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-600" />
            )}
          </button>

          {/* Mobile & Tablet Drawer Close Button */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="xl:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-md"
              aria-label="Close navigation drawer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Command Palette Trigger (⌘K) */}
      {onOpenCommandPalette && (
        <div className="px-3 pt-3 pb-1">
          <button
            type="button"
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              onOpenCommandPalette();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs text-slate-500 dark:text-slate-400 hover:border-blue-500/50 hover:text-slate-800 dark:hover:text-slate-200 transition-all shadow-2xs"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-blue-500" />
              <span>Jump to feed or command...</span>
            </span>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-6">
        {/* Core Views */}
        <div className="space-y-1">
          <button
            onClick={() => {
              onSelectView("unread");
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedView === "unread" && !selectedFeedId && !selectedCategory
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-900"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Inbox className="w-4 h-4" />
              <span>Triage</span>
            </div>
            {totalUnread > 0 && (
              <span className="text-[10px] font-mono opacity-80">{totalUnread}</span>
            )}
          </button>

          <button
            onClick={() => {
              onSelectView("all");
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedView === "all" && !selectedFeedId && !selectedCategory
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-900"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4" />
              <span>All Articles</span>
            </div>
          </button>

          <button
            onClick={() => {
              onSelectView("starred");
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedView === "starred"
                ? "bg-amber-500 text-white shadow-sm"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-900"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Read Later (Articles)</span>
            </div>
          </button>

          <button
            onClick={() => {
              onSelectView("watch_later");
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedView === "watch_later"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-900"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <PlaySquare className="w-4 h-4 text-rose-500" />
              <span>Watch Later (Videos)</span>
            </div>
          </button>

          <button
            onClick={() => {
              onSelectView("work");
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedView === "work"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/40"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Briefcase className="w-4 h-4" />
              <span>Work Items</span>
            </div>
          </button>

          <button
            onClick={() => {
              onSelectView("reading_list");
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedView === "reading_list"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/40"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Bookmark className="w-4 h-4" />
              <span>Research Inbox</span>
            </div>
          </button>

          <button
            onClick={() => {
              onSelectView("stats");
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedView === "stats"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-900"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Stats & Analytics</span>
            </div>
          </button>

          <button
            onClick={() => {
              onSelectView("feed_manager");
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedView === "feed_manager"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-900"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Manage Feeds</span>
            </div>
          </button>

          <button
            onClick={() => {
              onSelectView("settings");
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedView === "settings"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-900"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span>Settings</span>
            </div>
          </button>

          {onOpenGuide && (
            <button
              onClick={() => {
                onOpenGuide();
                if (onCloseMobile) onCloseMobile();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-900 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Guide &amp; Shortcuts</span>
              </div>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-slate-200/80 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded border border-slate-300 dark:border-slate-700">
                ?
              </kbd>
            </button>
          )}
        </div>

        {/* Boards Section */}
        {boards.length > 0 && (
          <div>
            <div className="px-3 mb-2 flex items-center justify-between text-[11px] font-semibold tracking-wider text-slate-500 dark:text-slate-500 uppercase">
              <span>Boards</span>
            </div>
            <div className="space-y-0.5">
              {boards.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    onSelectView("board", b.id);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-900 transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: b.color || "#3b82f6" }}
                  />
                  <span className="truncate">{b.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Categories & Feeds */}
        <div>
          <div className="px-3 mb-2 flex items-center justify-between text-[11px] font-semibold tracking-wider text-slate-500 dark:text-slate-500 uppercase">
            <span>Subscriptions</span>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleHideReadFeeds}
                className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors ${
                  hideReadFeeds
                    ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
                    : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                }`}
                title={
                  hideReadFeeds
                    ? "Hiding read feeds (click to show all feeds)"
                    : "Showing all feeds (click to hide read feeds)"
                }
                aria-label="Toggle hide read feeds"
              >
                <Filter className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onSelectView("feed_manager")}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title="Add New Subscription"
                aria-label="Add New Subscription"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {Object.entries(categories).map(([category, catFeeds]) => {
              const isCollapsed = collapsedCategories[category];

              // Partition into unread vs read
              const unreadFeeds = catFeeds
                .filter((f) => (f.unreadCount || 0) > 0)
                .sort(
                  (a, b) =>
                    (b.unreadCount || 0) - (a.unreadCount || 0) || a.title.localeCompare(b.title)
                );

              const readFeeds = catFeeds
                .filter((f) => (f.unreadCount || 0) === 0)
                .sort((a, b) => a.title.localeCompare(b.title));

              const totalCatUnread = catFeeds.reduce((sum, f) => sum + (f.unreadCount || 0), 0);

              // Auto-expand read section if active feed is currently a read feed
              const hasSelectedReadFeed = readFeeds.some((f) => f.id === selectedFeedId);
              const isReadExpanded =
                !hideReadFeeds || expandedReadCategories[category] || hasSelectedReadFeed;

              return (
                <div key={category} className="space-y-0.5">
                  <div
                    className={`w-full flex items-center justify-between rounded-md transition-colors ${
                      selectedCategory === category ? "bg-slate-200 dark:bg-slate-800" : ""
                    }`}
                  >
                    <button
                      onClick={() => toggleCategory(category)}
                      className="min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 dark:text-slate-400"
                      aria-label={isCollapsed ? "Expand category" : "Collapse category"}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        onSelectCategory?.(category);
                        if (onCloseMobile) onCloseMobile();
                      }}
                      className="flex-1 flex items-center justify-between pr-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors min-w-0"
                    >
                      <span className="truncate">{category}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {totalCatUnread > 0 ? (
                          <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded font-mono font-medium">
                            {totalCatUnread}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">
                            {catFeeds.length}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  {!isCollapsed && (
                    <div className="pl-4 space-y-0.5 border-l border-slate-200 dark:border-slate-800/80 ml-3">
                      {/* 1. Unread Feeds */}
                      {unreadFeeds.map((feed) => {
                        const isSelected = selectedFeedId === feed.id;
                        return (
                          <button
                            key={feed.id}
                            onClick={() => {
                              onSelectView("all", feed.id);
                              if (onCloseMobile) onCloseMobile();
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                              isSelected
                                ? "bg-slate-200 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-medium"
                                : "text-slate-700 dark:text-slate-200 font-medium hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-900/60"
                            }`}
                          >
                            <span className="truncate max-w-[140px] text-left">{feed.title}</span>
                            <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded font-mono">
                              {feed.unreadCount}
                            </span>
                          </button>
                        );
                      })}

                      {/* 2. Read / Empty Feeds */}
                      {readFeeds.length > 0 && (
                        <>
                          {hideReadFeeds && (
                            <button
                              onClick={() => toggleReadFeeds(category)}
                              className="w-full flex items-center justify-between px-2 py-1 text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/40 dark:hover:bg-slate-900/40 rounded transition-colors my-0.5"
                            >
                              <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-slate-400 dark:text-slate-500 opacity-70" />
                                <span>
                                  {isReadExpanded
                                    ? `Hide read (${readFeeds.length})`
                                    : unreadFeeds.length === 0
                                      ? `All caught up (${readFeeds.length})`
                                      : `${readFeeds.length} already read`}
                                </span>
                              </span>
                              <ChevronRight
                                className={`w-3 h-3 transition-transform ${
                                  isReadExpanded
                                    ? "rotate-90 text-slate-600 dark:text-slate-300"
                                    : ""
                                }`}
                              />
                            </button>
                          )}

                          {isReadExpanded &&
                            readFeeds.map((feed) => {
                              const isSelected = selectedFeedId === feed.id;
                              return (
                                <button
                                  key={feed.id}
                                  onClick={() => {
                                    onSelectView("all", feed.id);
                                    if (onCloseMobile) onCloseMobile();
                                  }}
                                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                                    isSelected
                                      ? "bg-slate-200 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-medium"
                                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-900/40"
                                  }`}
                                >
                                  <span className="truncate max-w-[140px] text-left">
                                    {feed.title}
                                  </span>
                                </button>
                              );
                            })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer: Feedback, Version, Commit & Copyright */}
      <div className="border-t border-[var(--sidebar-border)] px-4 py-2.5 bg-slate-100/50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 shrink-0 space-y-2">
        {onOpenFeedback && (
          <button
            type="button"
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              onOpenFeedback();
            }}
            className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/40 transition-colors"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 text-blue-500" />
            <span>Log Feedback or Idea</span>
          </button>
        )}
        <div className="flex items-center justify-between font-mono text-[11px]">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Synapse <span className="text-blue-600 dark:text-blue-400">v{APP_VERSION}</span>
          </span>
          <span
            className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-200/80 dark:bg-slate-800/80 px-1.5 py-0.5 rounded font-mono"
            title="Current Git Commit"
          >
            <GitCommit className="w-3 h-3 text-slate-400 dark:text-slate-500" />
            {GIT_COMMIT}
          </span>
        </div>
        <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-between">
          <span>{COPYRIGHT_NOTICE}</span>
          <span className="text-[9px] text-slate-400 dark:text-slate-600">All rights reserved</span>
        </div>
      </div>
    </aside>
  );
}
