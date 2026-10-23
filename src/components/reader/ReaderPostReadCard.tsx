"use client";

import React from "react";
import { Brain, Check, FolderPlus, Tag, X } from "lucide-react";

export interface ReaderPostReadCardProps {
  userNotes: string;
  onChangeNotes: (notes: string) => void;
  onPersistNotes: (notes: string, tags: string[]) => void;
  tags: string[];
  tagInput: string;
  onChangeTagInput: (input: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  isSavingNotes: boolean;
  notesSavedToast: boolean;
  syncingObsidian: boolean;
  onSaveObsidian: () => void;
}

export function ReaderPostReadCard({
  userNotes,
  onChangeNotes,
  onPersistNotes,
  tags,
  tagInput,
  onChangeTagInput,
  onAddTag,
  onRemoveTag,
  isSavingNotes,
  notesSavedToast,
  syncingObsidian,
  onSaveObsidian,
}: ReaderPostReadCardProps) {
  return (
    <div className="mt-14 mb-8 p-6 rounded-2xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 shadow-md">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-purple-200/60 dark:border-purple-800/50 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Finished Reading? Personal Synthesis & Takeaways
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Capture your insights before archiving or exporting to Obsidian.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center">
          {notesSavedToast && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-in fade-in">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          {isSavingNotes && (
            <span className="text-xs text-purple-600 dark:text-purple-400 animate-pulse">
              Saving...
            </span>
          )}
          <button
            onClick={onSaveObsidian}
            disabled={syncingObsidian}
            className="min-h-[40px] px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2"
            title="Export this article, your personal synthesis, and tags directly to Obsidian Vault"
          >
            <FolderPlus className="w-4 h-4" />
            <span>{syncingObsidian ? "Exporting..." : "Export to Obsidian"}</span>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-purple-950 dark:text-purple-200 mb-1.5">
            Key Takeaways & Synthesis (Formats as a prominent callout block in Obsidian)
          </label>
          <textarea
            value={userNotes}
            onChange={(e) => onChangeNotes(e.target.value)}
            onBlur={() => onPersistNotes(userNotes, tags)}
            placeholder="Summarize key ideas, how this connects to your current projects, notable quotes, or questions..."
            rows={4}
            className="w-full text-xs p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40 leading-relaxed resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-purple-950 dark:text-purple-200 mb-1.5 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>Obsidian Frontmatter Tags</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700/50 shadow-sm"
              >
                #{tag}
                <button
                  onClick={() => onRemoveTag(tag)}
                  className="hover:text-purple-950 dark:hover:text-white p-0.5"
                  title={`Remove tag #${tag}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => onChangeTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  onAddTag(tagInput);
                }
              }}
              onBlur={() => {
                if (tagInput.trim()) onAddTag(tagInput);
              }}
              placeholder="Add tag (Enter)..."
              className="text-xs px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 w-32 sm:w-44"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
