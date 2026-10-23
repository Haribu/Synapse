"use client";

import React from "react";
import { CheckCircle, Star, Briefcase, Brain, Type, Trash2, ChevronDown } from "lucide-react";

export interface ReaderMobileThumbBarProps {
  itemId: string;
  isRead?: boolean;
  isStarred?: boolean;
  isWork?: boolean;
  hasNotesOrTags?: boolean;
  onToggleRead: (id: string, isRead: boolean) => void;
  onToggleStar: (id: string, isStarred: boolean) => void;
  onToggleWork?: () => void;
  onOpenNotes: () => void;
  onOpenA11y?: () => void;
  onDelete?: () => void;
  onNext?: () => void;
  hiddenOnScroll?: boolean;
}

export function ReaderMobileThumbBar({
  itemId,
  isRead,
  isStarred,
  isWork,
  hasNotesOrTags,
  onToggleRead,
  onToggleStar,
  onToggleWork,
  onOpenNotes,
  onOpenA11y,
  onDelete,
  onNext,
  hiddenOnScroll = false,
}: ReaderMobileThumbBarProps) {
  return (
    <div
      className={`md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--card-bg)]/95 backdrop-blur-md border-t border-[var(--card-border)] px-3 py-2 flex items-center justify-between shadow-[0_-4px_20px_rgba(0,0,0,0.12)] pb-[max(0.6rem,env(safe-area-inset-bottom))] transition-transform duration-200 ${
        hiddenOnScroll ? "translate-y-full" : "translate-y-0"
      }`}
    >
      {/* Left: Read/Unread Toggle */}
      <button
        onClick={() => onToggleRead(itemId, !isRead)}
        className={`min-h-[42px] px-3 flex items-center gap-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-all ${
          isRead
            ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            : "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
        }`}
        aria-label={isRead ? "Mark unread" : "Mark read"}
      >
        <CheckCircle className="w-4 h-4" />
        <span>{isRead ? "Read" : "Unread"}</span>
      </button>

      {/* Center: Quick Star, Work, Notes & Typography */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onToggleStar(itemId, !isStarred)}
          className={`min-w-[42px] min-h-[42px] p-2 flex items-center justify-center rounded-xl active:scale-95 transition-all ${
            isStarred
              ? "text-amber-500 bg-amber-50 dark:bg-amber-950/40"
              : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
          title={isStarred ? "Starred" : "Star article"}
          aria-label="Star"
        >
          <Star className={`w-5 h-5 ${isStarred ? "fill-amber-500" : ""}`} />
        </button>

        {onToggleWork && (
          <button
            onClick={onToggleWork}
            className={`min-w-[42px] min-h-[42px] p-2 flex items-center justify-center rounded-xl active:scale-95 transition-all ${
              isWork
                ? "text-blue-600 bg-blue-50 dark:bg-blue-950/40"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            title={isWork ? "Flagged for Work" : "Tag for Work"}
            aria-label="Work"
          >
            <Briefcase className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={onOpenNotes}
          className={`relative min-w-[42px] min-h-[42px] p-2 flex items-center justify-center rounded-xl active:scale-95 transition-all ${
            hasNotesOrTags
              ? "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40"
              : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
          title="Research Notes & Tags"
          aria-label="Research Notes"
        >
          <Brain className="w-5 h-5" />
          {hasNotesOrTags && (
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400" />
          )}
        </button>

        {onOpenA11y && (
          <button
            onClick={onOpenA11y}
            className="min-w-[42px] min-h-[42px] p-2 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 rounded-xl transition-all"
            title="Reading & Accessibility settings"
            aria-label="Reading settings"
          >
            <Type className="w-5 h-5" />
          </button>
        )}

        {onDelete && (
          <button
            onClick={onDelete}
            className="min-w-[42px] min-h-[42px] p-2 flex items-center justify-center text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-95 rounded-xl transition-all"
            title="Delete item"
            aria-label="Delete"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Right (Prime Right Thumb Target): Next Article */}
      <button
        onClick={onNext}
        disabled={!onNext}
        className="min-h-[42px] px-3.5 flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:pointer-events-none text-white font-semibold rounded-xl text-xs shadow-md shadow-blue-500/25 active:scale-95 transition-all"
        title="Next article"
        aria-label="Next article"
      >
        <span>Next</span>
        <ChevronDown className="w-4 h-4" />
      </button>
    </div>
  );
}
