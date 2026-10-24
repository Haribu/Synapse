"use client";

import React from "react";
import { Bookmark, Copy, ExternalLink } from "lucide-react";

export interface LinkMenuState {
  visible: boolean;
  x: number;
  y: number;
  url: string;
  text: string;
}

export interface ReaderLinkMenuProps {
  linkMenu: LinkMenuState | null;
  onClose: () => void;
  onSaveLinkToReadingList: (url: string, text: string) => void;
}

export function ReaderLinkMenu({
  linkMenu,
  onClose,
  onSaveLinkToReadingList,
}: ReaderLinkMenuProps) {
  if (!linkMenu) return null;

  const topPos =
    typeof window !== "undefined" ? Math.min(window.innerHeight - 150, linkMenu.y) : linkMenu.y;
  const leftPos =
    typeof window !== "undefined" ? Math.min(window.innerWidth - 270, linkMenu.x) : linkMenu.x;

  return (
    <>
      {/* Invisible backdrop to dismiss menu on tap/click outside */}
      <div
        className="fixed inset-0 z-40 bg-transparent"
        onClick={onClose}
        onTouchStart={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-1.5 w-64 animate-in fade-in zoom-in-95"
        style={{ top: topPos, left: leftPos }}
      >
      <div className="px-2.5 py-1.5 text-[10px] font-mono text-slate-400 dark:text-slate-400 truncate border-b border-slate-100 dark:border-slate-800 mb-1">
        {linkMenu.url}
      </div>

      <button
        onClick={() => onSaveLinkToReadingList(linkMenu.url, linkMenu.text)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/60 rounded-md transition-colors font-medium"
      >
        <Bookmark className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
        <span>Save to Research Inbox</span>
      </button>

      <button
        onClick={() => {
          navigator.clipboard.writeText(linkMenu.url);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
      >
        <Copy className="w-3.5 h-3.5 text-slate-400" />
        <span>Copy Clean Link</span>
      </button>

      <a
        href={linkMenu.url}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
      >
        <span>Open Link in New Tab</span>
        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
      </a>

      <button
        onClick={onClose}
        className="w-full text-center py-1 mt-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border-t border-slate-100 dark:border-slate-800"
      >
        Cancel
      </button>
    </div>
  </>
  );
}
