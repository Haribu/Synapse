"use client";

import React, { useEffect, useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";

export interface UndoAction {
  id: string;
  message: string;
  onUndo: () => void;
  onCommit: () => void;
  durationMs?: number;
}

interface UndoToastProps {
  action: UndoAction | null;
  onClear: () => void;
}

export function UndoToast({ action, onClear }: UndoToastProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(5);

  useEffect(() => {
    if (!action) return;

    const duration = action.durationMs || 5000;
    const totalSeconds = Math.ceil(duration / 1000);
    setSecondsRemaining(totalSeconds);

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          action.onCommit();
          onClear();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [action, onClear]);

  if (!action) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-900/95 dark:bg-slate-950/95 border border-slate-700/80 text-white rounded-2xl shadow-2xl backdrop-blur-md">
        <div className="p-1 rounded-lg bg-rose-500/20 text-rose-400">
          <Trash2 className="w-4 h-4" />
        </div>
        <div className="text-xs font-medium max-w-[200px] sm:max-w-xs truncate">
          {action.message}
        </div>
        <button
          onClick={() => {
            action.onUndo();
            onClear();
          }}
          className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-md transition-all ml-1"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Undo ({secondsRemaining}s)</span>
        </button>
        <button
          onClick={() => {
            action.onCommit();
            onClear();
          }}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          title="Dismiss and delete immediately"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
