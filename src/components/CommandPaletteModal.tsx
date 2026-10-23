"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  Inbox,
  Layers,
  Star,
  PlaySquare,
  Briefcase,
  Bookmark,
  BarChart3,
  SlidersHorizontal,
  Settings,
  Rss,
  Folder,
  RefreshCw,
  Archive,
  CheckCircle,
  Brain,
  Type,
  CornerDownLeft,
  X,
  FlaskConical,
} from "lucide-react";

interface FeedItem {
  id: string;
  title: string;
  category?: string;
  unreadCount?: number;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  feeds: FeedItem[];
  onSelectView: (view: any, feedId?: string | null, category?: string | null) => void;
  activeItem?: any | null;
  onToggleRead?: (id: string, isRead: boolean) => void;
  onToggleStar?: (id: string, isStarred: boolean) => void;
  onToggleWork?: (id: string, isWork: boolean) => void;
  onOpenA11y?: () => void;
  onOpenFeedback?: () => void;
  onOpenOnboardingPreview?: () => void;
  workDigestName?: string;
}

interface CommandOption {
  id: string;
  group: "Views & Queues" | "Article Actions" | "Categories" | "Feeds";
  label: string;
  sublabel?: string;
  badge?: number;
  icon: React.ReactNode;
  action: () => void;
}

export function CommandPaletteModal({
  isOpen,
  onClose,
  feeds,
  onSelectView,
  activeItem,
  onToggleRead,
  onToggleStar,
  onToggleWork,
  onOpenA11y,
  onOpenFeedback,
  onOpenOnboardingPreview,
  workDigestName,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of feeds) {
      const cat = f.category || "General";
      map.set(cat, (map.get(cat) || 0) + (f.unreadCount || 0));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [feeds]);

  const options = useMemo<CommandOption[]>(() => {
    const list: CommandOption[] = [
      {
        id: "view-unread",
        group: "Views & Queues",
        label: "Triage (Unread)",
        sublabel: "Primary unread stream",
        icon: <Inbox className="w-4 h-4 text-blue-500" />,
        action: () => onSelectView("unread"),
      },
      {
        id: "view-all",
        group: "Views & Queues",
        label: "All Articles",
        sublabel: "Chronological firehose",
        icon: <Layers className="w-4 h-4 text-slate-500" />,
        action: () => onSelectView("all"),
      },
      {
        id: "view-starred",
        group: "Views & Queues",
        label: "Read Later (Articles)",
        sublabel: "Starred long-form articles",
        icon: <Star className="w-4 h-4 text-amber-500" />,
        action: () => onSelectView("starred"),
      },
      {
        id: "view-watch",
        group: "Views & Queues",
        label: "Watch Later (Videos)",
        sublabel: "Starred YouTube & video feeds",
        icon: <PlaySquare className="w-4 h-4 text-rose-500" />,
        action: () => onSelectView("watch_later"),
      },
      {
        id: "view-work",
        group: "Views & Queues",
        label: `Work Items (${workDigestName || "Work"} Digest)`,
        sublabel: "Flagged articles for weekly digest",
        icon: <Briefcase className="w-4 h-4 text-blue-600" />,
        action: () => onSelectView("work"),
      },
      {
        id: "view-research",
        group: "Views & Queues",
        label: "Research Inbox",
        sublabel: "Deep-study curated links",
        icon: <Bookmark className="w-4 h-4 text-purple-500" />,
        action: () => onSelectView("reading_list"),
      },
      {
        id: "view-stats",
        group: "Views & Queues",
        label: "Stats & Attention Telemetry",
        sublabel: "Reading velocity & engagement metrics",
        icon: <BarChart3 className="w-4 h-4 text-emerald-500" />,
        action: () => onSelectView("stats"),
      },
      {
        id: "view-feeds",
        group: "Views & Queues",
        label: "Manage Feeds",
        sublabel: "Add, organize, or prune subscriptions",
        icon: <SlidersHorizontal className="w-4 h-4 text-blue-500" />,
        action: () => onSelectView("feed_manager"),
      },
      {
        id: "view-settings",
        group: "Views & Queues",
        label: "Settings & Maintenance",
        sublabel: "Typography, filters, and SQLite backups",
        icon: <Settings className="w-4 h-4 text-slate-400" />,
        action: () => onSelectView("settings"),
      },
    ];

    if (onOpenA11y) {
      list.push({
        id: "action-a11y",
        group: "Article Actions",
        label: "Reading & Accessibility Typography",
        sublabel: "OpenDyslexic, Book Serif, font size & column width",
        icon: <Type className="w-4 h-4 text-purple-500" />,
        action: () => onOpenA11y(),
      });
    }

    if (onOpenOnboardingPreview) {
      list.push({
        id: "action-onboarding-preview",
        group: "Views & Queues",
        label: "Preview First-Run Welcome (Dry Run)",
        sublabel: "Simulate new user onboarding without altering feeds or settings",
        icon: <FlaskConical className="w-4 h-4 text-amber-500" />,
        action: () => onOpenOnboardingPreview(),
      });
    }

    if (activeItem) {
      if (onToggleRead) {
        list.push({
          id: "action-read",
          group: "Article Actions",
          label: activeItem.isRead
            ? "Mark Current Article Unread (m)"
            : "Mark Current Article Read (m)",
          sublabel: activeItem.title,
          icon: <CheckCircle className="w-4 h-4 text-emerald-500" />,
          action: () => onToggleRead(activeItem.id, !activeItem.isRead),
        });
      }
      if (onToggleStar) {
        list.push({
          id: "action-star",
          group: "Article Actions",
          label: activeItem.isStarred
            ? "Remove Star (s)"
            : "Star Current Article for Read Later (s)",
          sublabel: activeItem.title,
          icon: <Star className="w-4 h-4 text-amber-500" />,
          action: () => onToggleStar(activeItem.id, !activeItem.isStarred),
        });
      }
      if (onToggleWork) {
        list.push({
          id: "action-work",
          group: "Article Actions",
          label: activeItem.isWork ? "Remove Work Flag" : "Flag Current Article for Work Digest",
          sublabel: activeItem.title,
          icon: <Briefcase className="w-4 h-4 text-blue-500" />,
          action: () => onToggleWork(activeItem.id, !activeItem.isWork),
        });
      }
    }

    if (onOpenFeedback) {
      list.push({
        id: "action-feedback",
        group: "Article Actions",
        label: "Log Feedback, Bug, or Idea",
        sublabel: "Appends to Obsidian Feedback-Log.md",
        icon: <Brain className="w-4 h-4 text-blue-500" />,
        action: () => onOpenFeedback(),
      });
    }

    for (const [cat, unread] of categories) {
      list.push({
        id: `cat-${cat}`,
        group: "Categories",
        label: cat,
        sublabel: "Category stream",
        badge: unread > 0 ? unread : undefined,
        icon: <Folder className="w-4 h-4 text-amber-500/80" />,
        action: () => onSelectView("all", null, cat),
      });
    }

    for (const f of feeds) {
      list.push({
        id: `feed-${f.id}`,
        group: "Feeds",
        label: f.title,
        sublabel: f.category || "General",
        badge: f.unreadCount && f.unreadCount > 0 ? f.unreadCount : undefined,
        icon: <Rss className="w-4 h-4 text-slate-400" />,
        action: () => onSelectView("all", f.id, null),
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 30);
    return list.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.sublabel && item.sublabel.toLowerCase().includes(q)) ||
        item.group.toLowerCase().includes(q)
    );
  }, [
    query,
    feeds,
    categories,
    activeItem,
    onSelectView,
    onToggleRead,
    onToggleStar,
    onToggleWork,
    onOpenA11y,
    onOpenFeedback,
  ]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (options.length > 0 ? (prev + 1) % options.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          options.length > 0 ? (prev - 1 + options.length) % options.length : 0
        );
      } else if (e.key === "Enter" && options[selectedIndex]) {
        e.preventDefault();
        options[selectedIndex].action();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, options, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
      >
        {/* Search Input Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-[var(--card-border)] gap-3">
          <Search className="w-4 h-4 text-blue-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to any feed, category, queue, or action..."
            className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 rounded border border-slate-200 dark:border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Options List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {options.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No matching feeds, categories, or commands found.
            </div>
          ) : (
            options.map((opt, idx) => {
              const isSelected = idx === selectedIndex;
              const showGroupHeader = idx === 0 || options[idx - 1].group !== opt.group;
              return (
                <React.Fragment key={opt.id}>
                  {showGroupHeader && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {opt.group}
                    </div>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => {
                      opt.action();
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs transition-colors ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-[var(--foreground)] hover:bg-slate-100 dark:hover:bg-slate-800/70"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={isSelected ? "text-white [&>*]:!text-white" : ""}>
                        {opt.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{opt.label}</div>
                        {opt.sublabel && (
                          <div
                            className={`text-[10px] truncate ${
                              isSelected ? "text-blue-100" : "text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {opt.sublabel}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {opt.badge !== undefined && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            isSelected
                              ? "bg-blue-700 text-white"
                              : "bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300"
                          }`}
                        >
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && <CornerDownLeft className="w-3.5 h-3.5 opacity-80" />}
                    </div>
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-4 py-2 border-t border-[var(--card-border)] bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              <strong className="font-mono text-slate-600 dark:text-slate-300">↑↓</strong> Navigate
            </span>
            <span>
              <strong className="font-mono text-slate-600 dark:text-slate-300">↵</strong> Select
            </span>
          </div>
          <span className="font-mono text-[10px]">⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
