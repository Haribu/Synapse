"use client";

import React from "react";
import { AlertTriangle, ArrowRight, BookOpen, Bookmark, Clock, Trash2, X } from "lucide-react";
import { BacklogCandidate } from "@/lib/utils/backlog-nudges";
import { decodeHtmlEntities } from "@/lib/utils/decode";

export interface WipCapPromptState {
  queueType: "read_later" | "research_inbox";
  queueLabel: string;
  currentCount: number;
  cap: number;
  oldestItem: (BacklogCandidate & { ageDays: number; readingMinutes: number }) | null;
  pendingTitle: string;
  onSwapOldestAndSave: () => void;
  onReadOldestNow: () => void;
  onSaveAnyway: () => void;
}

interface WipCapModalProps {
  promptState: WipCapPromptState | null;
  onClose: () => void;
}

export function WipCapModal({ promptState, onClose }: WipCapModalProps) {
  if (!promptState) return null;

  const isResearch = promptState.queueType === "research_inbox";
  const oldest = promptState.oldestItem;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            isResearch
              ? "bg-purple-50/80 dark:bg-purple-950/40 border-purple-200/70 dark:border-purple-800/50"
              : "bg-amber-50/80 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-800/50"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl ${
                isResearch
                  ? "bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300"
                  : "bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300"
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {promptState.queueLabel} Cap Reached ({promptState.currentCount}/{promptState.cap})
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                One-In, One-Out Guardrail · Prevent Collector&apos;s Fallacy
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            You&apos;re saving{" "}
            <strong className="text-slate-900 dark:text-white">
              &ldquo;{decodeHtmlEntities(promptState.pendingTitle).slice(0, 80)}&rdquo;
            </strong>
            , but your <strong>{promptState.queueLabel}</strong> is at its{" "}
            <span className="font-mono font-bold">
              {promptState.currentCount}/{promptState.cap}
            </span>{" "}
            WIP limit.
          </div>

          {oldest && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1">
                  {isResearch ? (
                    <Bookmark className="w-3 h-3 text-purple-500" />
                  ) : (
                    <Clock className="w-3 h-3 text-amber-500" />
                  )}
                  Oldest Unfinished Item in Queue
                </span>
                <span className="font-mono text-amber-600 dark:text-amber-400">
                  Saved {oldest.ageDays}d ago · ~{oldest.readingMinutes}m read
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2">
                {decodeHtmlEntities(oldest.title)}
              </div>
              {oldest.feedTitle && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {oldest.feedTitle}
                </div>
              )}
            </div>
          )}

          {/* Action Choices */}
          <div className="space-y-2 pt-1">
            {oldest && (
              <button
                type="button"
                onClick={promptState.onSwapOldestAndSave}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-between transition-all active:scale-98 ${
                  isResearch
                    ? "bg-purple-600 hover:bg-purple-500"
                    : "bg-amber-600 hover:bg-amber-500"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  <span>Drop Oldest ({oldest.ageDays}d) &amp; Save This Instead</span>
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {oldest && (
              <button
                type="button"
                onClick={promptState.onReadOldestNow}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/70 flex items-center justify-between transition-all active:scale-98"
              >
                <span className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  <span>Read Oldest Item Now (~{oldest.readingMinutes} min)</span>
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={promptState.onSaveAnyway}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors"
              >
                Save Anyway (Override Cap)
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-3 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
