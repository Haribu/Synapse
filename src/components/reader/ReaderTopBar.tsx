"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  CheckCircle,
  Star,
  RefreshCw,
  Brain,
  Zap,
  ChevronDown,
  BookmarkPlus,
  Briefcase,
  Archive,
  FolderPlus,
  Share2,
  Check,
  ExternalLink,
  Trash2,
  MessageSquarePlus,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Type,
} from "lucide-react";

export interface ReaderTopBarProps {
  item: {
    id: string;
    url: string;
    feedTitle?: string;
    isRead?: boolean;
    isStarred?: boolean;
    isWork?: boolean;
  };
  onBack?: () => void;
  onToggleRead: (id: string, isRead: boolean) => void;
  onToggleStar: (id: string, isStarred: boolean) => void;
  onToggleWork?: () => void;
  onOpenFeedback?: () => void;
  onOpenA11y?: () => void;
  onDelete?: () => void;
  onDeleteFeed?: () => void;
  hydrating: boolean;
  currentIsFullFetched: boolean;
  handleHydrate: () => void;
  notesDrawerOpen: boolean;
  setNotesDrawerOpen: (open: boolean) => void;
  hasNotesOrTags: boolean;
  savingToResearch: boolean;
  researchSuccess: boolean;
  handleSaveToResearch: () => void;
  syncingObsidian: boolean;
  handleSaveObsidian: () => void;
  exportingGDocs: boolean;
  handleExportGoogleDocs: () => void;
  copiedLink: boolean;
  handleShare: () => void;
  onToggleFocusReader?: () => void;
  isFocusReader?: boolean;
  hiddenOnScroll?: boolean;
  workDigestName?: string;
}

export function ReaderTopBar({
  item,
  onBack,
  onToggleRead,
  onToggleStar,
  onToggleWork,
  onOpenFeedback,
  onOpenA11y,
  onDelete,
  onDeleteFeed,
  hydrating,
  currentIsFullFetched,
  handleHydrate,
  notesDrawerOpen,
  setNotesDrawerOpen,
  hasNotesOrTags,
  savingToResearch,
  researchSuccess,
  handleSaveToResearch,
  syncingObsidian,
  handleSaveObsidian,
  exportingGDocs,
  handleExportGoogleDocs,
  copiedLink,
  handleShare,
  onToggleFocusReader,
  isFocusReader,
  hiddenOnScroll = false,
  workDigestName,
}: ReaderTopBarProps) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActionMenuOpen(false);
  }, [item.id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setActionMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionMenuOpen(false);
    };
    if (actionMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionMenuOpen]);

  return (
    <div
      className={`h-14 border-b border-[var(--card-border)] px-3 md:px-6 flex items-center justify-between gap-2 bg-[var(--card-bg)]/95 backdrop-blur-md sticky top-0 z-20 shrink-0 transition-transform duration-200 ${
        hiddenOnScroll && !actionMenuOpen ? "-translate-y-full md:translate-y-0" : "translate-y-0"
      }`}
    >
      {/* Left triage: Back (Mobile), Mark Read & Star (Tablet/Desktop only—Mobile uses bottom thumb bar) */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden min-h-[40px] px-2.5 flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 rounded-xl text-xs font-semibold transition-all"
            title="Back to list"
            aria-label="Back to articles"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Articles</span>
          </button>
        )}

        <button
          onClick={() => onToggleRead(item.id, !item.isRead)}
          className={`hidden md:flex min-h-[38px] px-3 items-center gap-2 rounded-xl text-xs font-semibold active:scale-95 transition-all ${
            item.isRead
              ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              : "bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-600/30 border border-blue-200 dark:border-blue-500/30 shadow-xs"
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          <span>{item.isRead ? "Mark Unread" : "Mark Read"}</span>
        </button>

        <button
          onClick={() => onToggleStar(item.id, !item.isStarred)}
          className={`hidden md:flex min-w-[38px] min-h-[38px] p-2 items-center justify-center rounded-xl active:scale-95 transition-all ${
            item.isStarred
              ? "text-amber-500 fill-amber-500 bg-amber-50 dark:bg-amber-400/10 hover:bg-amber-100 dark:hover:bg-amber-400/20"
              : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
          title="Star item (s)"
        >
          <Star className={`w-4 h-4 ${item.isStarred ? "fill-current" : ""}`} />
        </button>
      </div>

      {/* Right controls: Hydrate, Notes, Typography, Action, Feedback */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Hydrate / Re-hydrate Full Page Button */}
        <button
          onClick={handleHydrate}
          disabled={hydrating}
          className={`min-h-[38px] px-2.5 sm:px-3 py-1.5 flex items-center gap-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-all ${
            currentIsFullFetched
              ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-200 dark:hover:bg-emerald-900/60"
              : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 shadow-xs"
          }`}
          title={
            currentIsFullFetched
              ? "Click to re-hydrate/re-fetch latest clean full page"
              : "Fetch full article text (bypasses snippet)"
          }
        >
          <RefreshCw className={`w-3.5 h-3.5 ${hydrating ? "animate-spin text-blue-500" : ""}`} />
          <span>
            {hydrating ? "Fetching..." : currentIsFullFetched ? "Full Text" : "Fetch Full"}
          </span>
        </button>

        {/* Research Notes & Tags Slide-out / Split-view Toggle (Tablet/Desktop; on Mobile lives in thumb bar) */}
        <button
          onClick={() => setNotesDrawerOpen(!notesDrawerOpen)}
          className={`hidden md:flex min-h-[38px] px-3 py-1.5 items-center gap-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-all shadow-xs ${
            notesDrawerOpen || hasNotesOrTags
              ? "bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800"
              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-600 dark:hover:text-purple-400 border border-slate-200 dark:border-slate-700"
          }`}
          title="Toggle Research Notes & Obsidian Tags"
          aria-label="Toggle research notes drawer"
        >
          <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <span>Notes</span>
          {hasNotesOrTags && (
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400" />
          )}
        </button>

        {/* Typography / Accessibility Modal Trigger (Tablet/Desktop; on Mobile lives in thumb bar) */}
        {onOpenA11y && (
          <button
            onClick={onOpenA11y}
            className="hidden md:flex min-w-[38px] min-h-[38px] p-2 items-center justify-center text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 rounded-xl transition-all"
            title="Reading Typography & Accessibility"
            aria-label="Reading typography settings"
          >
            <Type className="w-4 h-4" />
          </button>
        )}

        {/* Consolidated Action Menu */}
        <div className="relative" ref={actionMenuRef}>
          <button
            onClick={() => setActionMenuOpen(!actionMenuOpen)}
            className={`min-h-[38px] px-3 py-1.5 flex items-center gap-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-all shadow-xs ${
              actionMenuOpen
                ? "bg-blue-600 text-white shadow-blue-500/25 ring-2 ring-blue-500/30"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
            }`}
            title="Article actions & destinations"
            aria-expanded={actionMenuOpen}
            aria-haspopup="true"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Action</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${actionMenuOpen ? "rotate-180" : ""}`}
            />
          </button>

          {actionMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100 dark:divide-slate-800/60">
              {/* Knowledge & Triage */}
              <div className="p-1 space-y-0.5">
                <button
                  onClick={() => {
                    setActionMenuOpen(false);
                    handleSaveToResearch();
                  }}
                  disabled={savingToResearch || researchSuccess}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
                >
                  <BookmarkPlus className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {researchSuccess
                        ? "In Research Inbox"
                        : savingToResearch
                          ? "Saving to Research..."
                          : "Send to Research"}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Queue for deep study & notes
                    </div>
                  </div>
                </button>

                {onToggleWork && (
                  <button
                    onClick={() => {
                      setActionMenuOpen(false);
                      onToggleWork();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {item.isWork ? "Remove Work Flag" : "Flag for Work"}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {item.isWork
                          ? `Flagged for ${workDigestName || "Work"} Digest`
                          : `Include in ${workDigestName || "Work"} Digest`}
                      </div>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => {
                    setActionMenuOpen(false);
                    handleSaveObsidian();
                  }}
                  disabled={syncingObsidian}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
                >
                  <Archive className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {syncingObsidian ? "Storing to Vault..." : "Permanently Store"}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Save to Obsidian with local assets
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setActionMenuOpen(false);
                    handleExportGoogleDocs();
                  }}
                  disabled={exportingGDocs}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
                >
                  <FolderPlus className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {exportingGDocs ? "Exporting to Docs..." : "Export to Google Docs"}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Create formatted Google Doc
                    </div>
                  </div>
                </button>
              </div>

              {/* Content & Web */}
              <div className="p-1 space-y-0.5">
                <button
                  onClick={() => {
                    setActionMenuOpen(false);
                    handleHydrate();
                  }}
                  disabled={hydrating}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
                >
                  <RefreshCw
                    className={`w-4 h-4 text-amber-500 shrink-0 ${hydrating ? "animate-spin" : ""}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {hydrating
                        ? "Fetching..."
                        : currentIsFullFetched
                          ? "Re-hydrate Full Page"
                          : "Fetch Full Page"}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Clean article reader extraction
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setActionMenuOpen(false);
                    handleShare();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {copiedLink ? (
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Share2 className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {copiedLink ? "Link Copied!" : "Share / Copy Link"}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Copy clean URL or native share
                    </div>
                  </div>
                </button>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setActionMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-slate-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Open in Browser
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      View original webpage
                    </div>
                  </div>
                </a>

                {onOpenFeedback && (
                  <button
                    onClick={() => {
                      setActionMenuOpen(false);
                      onOpenFeedback();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <MessageSquarePlus className="w-4 h-4 text-purple-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Report Issue or Feedback
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Log friction for this article
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Destructive actions isolated safely at bottom of menu */}
              {(onDelete || onDeleteFeed) && (
                <div className="p-1 space-y-0.5">
                  {onDelete && (
                    <button
                      onClick={() => {
                        setActionMenuOpen(false);
                        onDelete();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-rose-600 dark:text-rose-400">
                          Delete from List
                        </div>
                        <div className="text-[11px] text-rose-500/80 truncate">
                          Remove from research / reading list
                        </div>
                      </div>
                    </button>
                  )}
                  {onDeleteFeed && (
                    <button
                      onClick={() => {
                        setActionMenuOpen(false);
                        onDeleteFeed();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-rose-600 dark:text-rose-400">
                          Unsubscribe &amp; Delete Feed
                        </div>
                        <div className="text-[11px] text-rose-500/80 truncate">
                          Remove {item.feedTitle || "this feed"} permanently
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Full Reader Focus Mode Toggle (Tablet & Desktop) */}
        {onToggleFocusReader && (
          <button
            onClick={onToggleFocusReader}
            className="hidden md:flex min-w-[38px] min-h-[38px] p-2 items-center justify-center text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 rounded-xl transition-all"
            title={isFocusReader ? "Exit full focus mode (])" : "Full focus reader mode (])"}
            aria-label="Toggle reader focus mode"
          >
            {isFocusReader ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
