"use client";

import React from "react";
import {
  HelpCircle,
  X,
  BookOpen,
  Clock,
  PlaySquare,
  Bookmark,
  Briefcase,
  Archive,
  Command,
  Zap,
  Layers,
  Bot,
  Terminal,
} from "lucide-react";
import { APP_VERSION, GIT_COMMIT } from "@/lib/version";

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GuideModal({ isOpen, onClose }: GuideModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Synapse System Guide &amp; Shortcuts
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Philosophy, workflow stages, keyboard navigation, and API integration
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700 dark:text-slate-300">
          {/* Section: The Four Stages */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-500" />
              <span>The 4 Content Lifecycles</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 dark:text-white">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span>1. Read Later</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Your ephemeral queue for written articles found while browsing feeds. Star an
                  article to hold it here until you finish reading.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 dark:text-white">
                  <PlaySquare className="w-4 h-4 text-rose-500" />
                  <span>2. Watch Later (Videos)</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Automatically isolates video posts (YouTube subscriptions and video-embedded
                  articles) so your reading stream stays focused on text.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 dark:text-white">
                  <Bookmark className="w-4 h-4 text-purple-500" />
                  <span>3. Research Inbox</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Articles you explicitly marked for literature synthesis. When saved to Obsidian,
                  they move into your permanent knowledge base.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 dark:text-white">
                  <Briefcase className="w-4 h-4 text-emerald-500" />
                  <span>4. Team / Work Items</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  High-signal articles flagged for coworkers or team stakeholders. Use Draft Digest
                  to compile them into an executive email or Slack bulletin.
                </p>
              </div>
            </div>
          </div>

          {/* Section: Headless API & AI Agent Integration */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-500" />
              <span>Headless API &amp; Model Context Protocol (MCP)</span>
            </h3>

            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-50/40 dark:bg-blue-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Dual-Surface Ingestion Daemon</span>
                </span>
                <span className="font-mono text-[10px] bg-blue-500/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold uppercase">
                  REST &amp; MCP Native
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Synapse is fully decoupled: AI agents (Claude, Antigravity, Cursor) can query your
                library via SQLite FTS5, extract clean Markdown, and triage items without opening
                the browser.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-blue-500 font-bold">GET</span> /api/items?q=...
                  <p className="text-[10px] text-slate-400 font-sans mt-0.5">Instant FTS5 search</p>
                </div>
                <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-emerald-500 font-bold">GET</span> /api/items/:id/markdown
                  <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                    Token-clean reader text
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Run{" "}
                <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px]">
                  bun run mcp
                </code>{" "}
                for native Model Context Protocol integration. See{" "}
                <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px]">
                  API.md
                </code>{" "}
                for full docs.
              </p>
            </div>
          </div>

          {/* Section: Keyboard Shortcuts & Touch Gestures */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
              <Command className="w-4 h-4 text-slate-500" />
              <span>Keyboard Shortcuts &amp; Touch Gestures</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 font-mono">
                <span className="text-slate-500">Command Palette</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 text-[11px]">
                  ⌘K / Ctrl+K
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 font-mono">
                <span className="text-slate-500">Next</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 text-[11px]">
                  j / ↓
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 font-mono">
                <span className="text-slate-500">Previous</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 text-[11px]">
                  k / ↑
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 font-mono">
                <span className="text-slate-500">Read / Unread</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 text-[11px]">
                  m
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 font-mono">
                <span className="text-slate-500">Star / Save</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 text-[11px]">
                  s
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 font-mono">
                <span className="text-slate-500">Flag for Work</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 text-[11px]">
                  w
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 font-mono">
                <span className="text-slate-500">Mark All Read</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 text-[11px]">
                  Shift + A
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 font-mono">
                <span className="text-slate-500">Focus Panes</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 text-[11px]">
                  [ / ]
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 font-mono">
                <span className="text-slate-500">Touch Triage</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 text-[11px]">
                  Swipe Row
                </kbd>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono">
            Synapse v{APP_VERSION} (#{GIT_COMMIT})
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
