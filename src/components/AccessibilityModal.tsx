"use client";

import React from "react";
import {
  X,
  Type,
  Check,
  Eye,
  ImageOff,
  Megaphone,
  CalendarDays,
  Building2,
  Layers,
} from "lucide-react";
import { AccessibilitySettings, saveAccessibilitySettings } from "@/lib/utils/accessibility";

interface AccessibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AccessibilitySettings;
  onSettingsChange: (settings: AccessibilitySettings) => void;
}

export function AccessibilityModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: AccessibilityModalProps) {
  if (!isOpen) return null;

  const update = (partial: Partial<AccessibilitySettings>) => {
    const next = { ...settings, ...partial };
    onSettingsChange(next);
    saveAccessibilitySettings(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="a11y-title"
      >
        {/* Mobile Drag Handle */}
        <div className="pt-2.5 pb-1 flex justify-center sm:hidden">
          <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 sm:py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400">
              <Type className="w-5 h-5" />
            </div>
            <div>
              <h2 id="a11y-title" className="text-base font-bold text-slate-900 dark:text-white">
                Reading & Accessibility
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Customize typography, dyslexia accommodations, and spacing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Font Family Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
              Typeface
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => update({ fontFamily: "sans" })}
                className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                  settings.fontFamily === "sans"
                    ? "border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-semibold"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                }`}
              >
                <div>
                  <div className="text-sm font-sans font-medium">System Sans</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Clean & modern
                  </div>
                </div>
                {settings.fontFamily === "sans" && <Check className="w-4 h-4 text-blue-600" />}
              </button>

              <button
                type="button"
                onClick={() => update({ fontFamily: "dyslexic" })}
                className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                  settings.fontFamily === "dyslexic"
                    ? "border-purple-600 dark:border-purple-500 bg-purple-50/60 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 font-semibold ring-2 ring-purple-500/20"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                }`}
              >
                <div>
                  <div className="text-sm font-dyslexic font-medium">OpenDyslexic</div>
                  <div className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                    Weighted bottom
                  </div>
                </div>
                {settings.fontFamily === "dyslexic" && (
                  <Check className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                )}
              </button>

              <button
                type="button"
                onClick={() => update({ fontFamily: "serif" })}
                className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                  settings.fontFamily === "serif"
                    ? "border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-semibold"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                }`}
              >
                <div>
                  <div className="text-sm font-serif-reader font-medium">Book Serif</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Long-form editorial
                  </div>
                </div>
                {settings.fontFamily === "serif" && <Check className="w-4 h-4 text-blue-600" />}
              </button>

              <button
                type="button"
                onClick={() => update({ fontFamily: "mono" })}
                className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                  settings.fontFamily === "mono"
                    ? "border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-semibold"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                }`}
              >
                <div>
                  <div className="text-sm font-mono-reader font-medium">Monospace</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Fixed width</div>
                </div>
                {settings.fontFamily === "mono" && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            </div>
          </div>

          {/* Text Size */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
              Text Size
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { id: "sm", label: "Small", size: "16px" },
                  { id: "base", label: "Medium", size: "18px" },
                  { id: "lg", label: "Large", size: "21px" },
                  { id: "xl", label: "XL", size: "24px" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => update({ fontSize: opt.id })}
                  className={`min-h-[44px] py-2 px-1 text-center rounded-xl border transition-all ${
                    settings.fontSize === opt.id
                      ? "border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold"
                      : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <div className="text-xs">{opt.label}</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">{opt.size}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Line & Letter Spacing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Line Spacing
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "normal", label: "1.6" },
                    { id: "relaxed", label: "1.85" },
                    { id: "spacious", label: "2.2" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => update({ lineSpacing: s.id })}
                    className={`min-h-[40px] py-1.5 text-xs rounded-lg border capitalize transition-all ${
                      settings.lineSpacing === s.id
                        ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold"
                        : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Letter Spacing
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "normal", label: "Normal" },
                    { id: "wide", label: "Wide" },
                    { id: "wider", label: "Wider" },
                  ] as const
                ).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => update({ letterSpacing: l.id })}
                    className={`min-h-[40px] py-1.5 text-xs rounded-lg border transition-all ${
                      settings.letterSpacing === l.id
                        ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold"
                        : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Reading Column Width */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Reading Column Width
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "narrow", label: "Narrow (580px)" },
                  { id: "normal", label: "Balanced (760px)" },
                  { id: "wide", label: "Full (Wide)" },
                ] as const
              ).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => update({ columnWidth: w.id })}
                  className={`min-h-[42px] py-2 px-1 text-center rounded-xl border text-xs transition-all ${
                    settings.columnWidth === w.id
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold"
                      : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Global Dyslexic Switch */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
              <div className="pr-4">
                <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Global OpenDyslexic Interface
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Apply OpenDyslexic font across the entire Synapse app (feeds, buttons, sidebars)
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.globalDyslexic}
                onChange={(e) => update({ globalDyslexic: e.target.checked })}
                className="w-5 h-5 accent-purple-600 rounded cursor-pointer"
              />
            </label>
          </div>

          {/* Reading & Content Preferences */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Content & Layout Preferences
            </label>

            {/* Hide Hero Images Toggle */}
            <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-colors">
              <div className="space-y-0.5 pr-3">
                <div className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                  <ImageOff className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Hide Blog Header Images
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Suppress top hero banners at the start of articles to focus strictly on text
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.hideHeaderImages}
                onChange={(e) => update({ hideHeaderImages: e.target.checked })}
                className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
              />
            </label>

            {/* Hide Sponsored Content Toggle */}
            <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-colors">
              <div className="space-y-0.5 pr-3">
                <div className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  Hide Sponsored & Promo Articles
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Filter out commercial partner posts and sponsored stories from article lists
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.hideSponsored}
                onChange={(e) => update({ hideSponsored: e.target.checked })}
                className="w-5 h-5 accent-rose-600 rounded cursor-pointer"
              />
            </label>

            {/* Hide Weekly Roundups Toggle */}
            <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-colors">
              <div className="space-y-0.5 pr-3">
                <div className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Hide Weekly Roundups & Summaries
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Filter out repetitive weekly digest recaps of stories already in your backlog
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.hideRoundups}
                onChange={(e) => update({ hideRoundups: e.target.checked })}
                className="w-5 h-5 accent-purple-600 rounded cursor-pointer"
              />
            </label>
            <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-colors">
              <div className="space-y-0.5 pr-3">
                <div className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  Hide Vendor &amp; Supplier Feeds
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Filter out promotional vendor publications and commercial supplier blogs
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.hideVendors}
                onChange={(e) => update({ hideVendors: e.target.checked })}
                className="w-5 h-5 accent-amber-600 rounded cursor-pointer"
              />
            </label>

            {/* Group Related Breaking Stories Toggle */}
            <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-colors">
              <div className="space-y-0.5 pr-3">
                <div className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Group Related Breaking Stories
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Cluster multi-source breaking news covering the same event under a primary
                  headline
                </div>
              </div>
              <input
                type="checkbox"
                checked={!settings.disableGrouping}
                onChange={(e) => update({ disableGrouping: !e.target.checked })}
                className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
              />
            </label>
          </div>

          {/* Live Preview Box */}
          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Preview
            </div>
            <p
              className={`text-slate-900 dark:text-slate-100 ${
                settings.fontFamily === "dyslexic"
                  ? "font-dyslexic"
                  : settings.fontFamily === "serif"
                    ? "font-serif-reader"
                    : settings.fontFamily === "mono"
                      ? "font-mono-reader"
                      : "font-sans-reader"
              }`}
              style={{
                fontSize:
                  settings.fontSize === "sm"
                    ? "1rem"
                    : settings.fontSize === "base"
                      ? "1.125rem"
                      : settings.fontSize === "lg"
                        ? "1.3125rem"
                        : "1.5rem",
                lineHeight:
                  settings.lineSpacing === "normal"
                    ? "1.6"
                    : settings.lineSpacing === "relaxed"
                      ? "1.85"
                      : "2.2",
                letterSpacing:
                  settings.letterSpacing === "wide"
                    ? "0.05em"
                    : settings.letterSpacing === "wider"
                      ? "0.1em"
                      : "normal",
              }}
            >
              OpenDyslexic features heavy weighted bottoms on letterforms to help prevent flipping
              and letter inversion.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex justify-end">
          <button
            onClick={onClose}
            className="min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
