"use client";

import React from "react";
import { Brain, Check, X, Tag, FolderPlus } from "lucide-react";

export interface ReaderNotesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
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

export function ReaderNotesDrawer({
  isOpen,
  onClose,
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
}: ReaderNotesDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end xl:relative xl:inset-auto xl:z-10 xl:w-80 xl:shrink-0 animate-in fade-in duration-200">
      {/* Backdrop (Mobile & Tablet only; Desktop docks side-by-side) */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs transition-opacity xl:hidden"
        onClick={onClose}
      />

      {/* Drawer / Docked Panel */}
      <div className="relative w-full max-w-md xl:max-w-none xl:w-80 bg-[var(--card-bg)] h-full shadow-2xl xl:shadow-none border-l border-[var(--card-border)] flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Research Notes & Tags
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Capture synthesis while reading
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {notesSavedToast && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              aria-label="Close notes drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
              Personal Synthesis & Takeaways
            </label>
            <textarea
              value={userNotes}
              onChange={(e) => onChangeNotes(e.target.value)}
              onBlur={() => onPersistNotes(userNotes, tags)}
              placeholder="Capture key ideas, connection to projects, questions, or quotes..."
              rows={8}
              className="w-full text-xs p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40 leading-relaxed resize-y"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Exports as a callout block in Obsidian.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Obsidian Frontmatter Tags</span>
            </label>
            <div className="flex flex-wrap items-center gap-2 mb-2">
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
            </div>
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
              placeholder="Type tag and press Enter..."
              className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50">
          <span className="text-[11px] text-slate-400">
            {isSavingNotes ? "Saving notes..." : "All changes auto-saved"}
          </span>
          <button
            onClick={onSaveObsidian}
            disabled={syncingObsidian}
            className="px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5"
          >
            <FolderPlus className="w-4 h-4" />
            <span>{syncingObsidian ? "Exporting..." : "Export to Obsidian"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
