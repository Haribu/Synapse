"use client";

import React, { useState, useEffect } from "react";
import {
  Type,
  Check,
  Eye,
  Settings,
  HardDrive,
  Keyboard,
  Moon,
  Sun,
  ShieldCheck,
  RefreshCw,
  FolderCheck,
  FileCheck,
  Sparkles,
  Megaphone,
  Building2,
  Layers,
  User,
  Download,
  HelpCircle,
  FlaskConical,
} from "lucide-react";
import { AccessibilitySettings, saveAccessibilitySettings } from "@/lib/utils/accessibility";

interface SettingsViewProps {
  settings: AccessibilitySettings;
  onSettingsChange: (settings: AccessibilitySettings) => void;
  onOpenGuide?: () => void;
  onOpenOnboardingPreview?: () => void;
}

export function SettingsView({
  settings,
  onSettingsChange,
  onOpenGuide,
  onOpenOnboardingPreview,
}: SettingsViewProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupResult, setBackupResult] = useState<string | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkResult, setCheckResult] = useState<{ healthy: boolean; message: string } | null>(
    null
  );

  const [profile, setProfile] = useState<{
    displayName: string;
    bio: string;
    readingSpeedWpm: number;
    obsidianVaultSubfolder: string;
    defaultCategory: string;
    workDigestName?: string;
    workDigestEmail?: string;
  } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<{
    obsidian: { configured: boolean; path: string | null };
    googleDocs: { configured: boolean };
    auth: { mode: string; hasWhitelist: boolean };
  } | null>(null);

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains("dark"));

    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.profile) {
          setProfile({
            displayName: data.profile.displayName || "Reader",
            bio: data.profile.bio || "",
            readingSpeedWpm: data.profile.readingSpeedWpm || 230,
            obsidianVaultSubfolder: data.profile.obsidianVaultSubfolder || "01 - Inbox/Synapse",
            defaultCategory: data.profile.defaultCategory || "All",
            workDigestName: data.profile.workDigestName || "Work",
            workDigestEmail: data.profile.workDigestEmail || "",
          });
        }
      })
      .catch(() => {});

    fetch("/api/system/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSystemStatus(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (data.success) {
        setProfileMessage("✓ Profile updated successfully");
      } else {
        setProfileMessage(`✗ Failed: ${data.error}`);
      }
    } catch (err: any) {
      setProfileMessage(`✗ Error: ${err.message}`);
    } finally {
      setProfileSaving(false);
    }
  };

  const updateA11y = (partial: Partial<AccessibilitySettings>) => {
    const next = { ...settings, ...partial };
    onSettingsChange(next);
    saveAccessibilitySettings(next);
  };

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem("synapse_theme", nextDark ? "dark" : "light");
  };

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    setBackupResult(null);
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setBackupResult(`✓ Backup created: ${data.filename} (${data.sizeFormatted})`);
      } else {
        setBackupResult(`✗ Backup failed: ${data.error}`);
      }
    } catch (err: any) {
      setBackupResult(`✗ Backup error: ${err.message}`);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleCheckIntegrity = async () => {
    setCheckLoading(true);
    setCheckResult(null);
    try {
      const res = await fetch("/api/admin/backup");
      const data = await res.json();
      if (data.integrity?.healthy) {
        setCheckResult({
          healthy: true,
          message: "SQLite WAL database integrity verified: 0 errors",
        });
      } else {
        setCheckResult({
          healthy: false,
          message: data.integrity?.messages?.join(", ") || "Integrity issues detected",
        });
      }
    } catch (err: any) {
      setCheckResult({ healthy: false, message: err.message });
    } finally {
      setCheckLoading(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-4 md:p-8 lg:p-12 transition-colors">
      <div className="max-w-4xl mx-auto space-y-8 pb-24">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 shadow-sm">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Settings & Preferences
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure reading appearance, navigation, integrations, and database maintenance
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenOnboardingPreview && (
              <button
                type="button"
                onClick={onOpenOnboardingPreview}
                className="px-3.5 py-2 rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-all flex items-center gap-2 shadow-xs active:scale-95 shrink-0"
                title="Preview the first-run onboarding flow safely in simulation mode (no settings or feeds changed)"
              >
                <FlaskConical className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Preview Welcome Tour</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/20 font-bold">
                  Dry Run
                </span>
              </button>
            )}

            {onOpenGuide && (
              <button
                type="button"
                onClick={onOpenGuide}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/40 transition-all flex items-center gap-2 shadow-xs active:scale-95 shrink-0"
              >
                <HelpCircle className="w-4 h-4 text-blue-500" />
                <span>System Guide &amp; Shortcuts</span>
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-500 rounded">
                  ?
                </kbd>
              </button>
            )}
          </div>
        </div>

        {/* Section 1: Appearance & Typography */}
        <section className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <div className="flex items-center gap-2.5">
              <Type className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Reading Appearance & Typography
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tailored typography for sustained focus and accessibility
                </p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-all shadow-sm active:scale-95"
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" />
              )}
              <span>{isDarkMode ? "Light Mode" : "Dark Mode"}</span>
            </button>
          </div>

          {/* Typeface Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Typeface
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {[
                {
                  id: "sans",
                  title: "System Sans",
                  desc: "Clean & modern",
                  className: "font-sans",
                },
                {
                  id: "dyslexic",
                  title: "OpenDyslexic",
                  desc: "Weighted bottom",
                  className: "font-dyslexic",
                },
                {
                  id: "serif",
                  title: "Book Serif",
                  desc: "Editorial long-form",
                  className: "font-serif",
                },
                {
                  id: "mono",
                  title: "Monospace",
                  desc: "Code & technical",
                  className: "font-mono",
                },
              ].map((font) => (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => updateA11y({ fontFamily: font.id as any })}
                  className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    settings.fontFamily === font.id
                      ? "border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-semibold ring-2 ring-blue-500/20"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm ${font.className}`}>{font.title}</span>
                    {settings.fontFamily === font.id && <Check className="w-4 h-4 text-blue-600" />}
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {font.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Global Dyslexia Accommodation */}
          <div className="p-4 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/60 flex items-start gap-3">
            <input
              type="checkbox"
              id="global-dyslexia"
              checked={settings.globalDyslexic}
              onChange={(e) => updateA11y({ globalDyslexic: e.target.checked })}
              className="mt-1 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 cursor-pointer"
            />
            <div>
              <label
                htmlFor="global-dyslexia"
                className="text-xs font-bold text-purple-950 dark:text-purple-200 cursor-pointer"
              >
                Apply OpenDyslexic Across Entire App Interface
              </label>
              <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80 mt-0.5">
                Applies dyslexia-friendly letter weighting across all sidebars, menus, and article
                lists.
              </p>
            </div>
          </div>

          {/* Font Size & Line Spacing */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                Font Size
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: "sm", label: "Small", sub: "16px" },
                  { id: "base", label: "Medium", sub: "18px" },
                  { id: "lg", label: "Large", sub: "21px" },
                  { id: "xl", label: "XL", sub: "24px" },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => updateA11y({ fontSize: s.id as any })}
                    className={`py-2 px-1 text-center rounded-xl border text-xs transition-all ${
                      settings.fontSize === s.id
                        ? "border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-bold"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div>{s.label}</div>
                    <div className="text-[10px] opacity-60 font-mono">{s.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                Line Spacing
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "normal", label: "Compact", sub: "1.6" },
                  { id: "relaxed", label: "Relaxed", sub: "1.85" },
                  { id: "spacious", label: "Spacious", sub: "2.2" },
                ].map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => updateA11y({ lineSpacing: l.id as any })}
                    className={`py-2 px-1 text-center rounded-xl border text-xs transition-all ${
                      settings.lineSpacing === l.id
                        ? "border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-bold"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div>{l.label}</div>
                    <div className="text-[10px] opacity-60 font-mono">{l.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Column Width & Letter Spacing */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                Reader Column Width
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "narrow", label: "Narrow", sub: "580px" },
                  { id: "normal", label: "Balanced", sub: "760px" },
                  { id: "wide", label: "Full Width", sub: "1024px" },
                ].map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => updateA11y({ columnWidth: w.id as any })}
                    className={`py-2 px-1 text-center rounded-xl border text-xs transition-all ${
                      settings.columnWidth === w.id
                        ? "border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-bold"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div>{w.label}</div>
                    <div className="text-[10px] opacity-60 font-mono">{w.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                Letter Spacing
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "normal", label: "Normal" },
                  { id: "wide", label: "Wide (+0.05em)" },
                  { id: "wider", label: "Wider (+0.1em)" },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => updateA11y({ letterSpacing: s.id as any })}
                    className={`py-2 px-1 text-center rounded-xl border text-xs transition-all ${
                      settings.letterSpacing === s.id
                        ? "border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-bold"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div>{s.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Article Curation & Filter Toggles */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Content Filtering &amp; Organization
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Hide Sponsored */}
              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-colors">
                <div className="space-y-0.5 pr-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Megaphone className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    Hide Sponsored
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Filter out paid promo posts
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.hideSponsored}
                  onChange={(e) => updateA11y({ hideSponsored: e.target.checked })}
                  className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                />
              </label>

              {/* Hide Vendors */}
              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-colors">
                <div className="space-y-0.5 pr-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    Hide Vendor Feeds
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Filter commercial supplier blogs
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.hideVendors}
                  onChange={(e) => updateA11y({ hideVendors: e.target.checked })}
                  className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
                />
              </label>

              {/* Group Related */}
              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-colors">
                <div className="space-y-0.5 pr-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Group Breaking Stories
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Cluster identical news stories
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={!settings.disableGrouping}
                  onChange={(e) => updateA11y({ disableGrouping: !e.target.checked })}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Section 2: Navigation & Gestures Cheat Sheet */}
        <section className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <Keyboard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Keyboard Shortcuts &amp; Gestures
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                High-efficiency triage without touching the mouse
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
            {[
              {
                key: "⌘K / Ctrl+K",
                label: "Command Palette",
                desc: "Instant jump to any feed, category, or action",
              },
              {
                key: "j / k",
                label: "Next / Prev Article",
                desc: "Advance or step back through active view",
              },
              { key: "m", label: "Toggle Read", desc: "Mark article as read or unread" },
              { key: "s", label: "Toggle Star", desc: "Add to or remove from starred queue" },
              {
                key: "[ / ]",
                label: "Focus Panes",
                desc: "Collapse sidebar ([) or article list (])",
              },
              {
                key: "Shift + A",
                label: "Mark All Read",
                desc: "Clear current feed or category view",
              },
              {
                key: "Swipe Row",
                label: "List Row Triage",
                desc: "Swipe right to Read, swipe left to Star",
              },
              {
                key: "Swipe Reader",
                label: "Reader Navigation",
                desc: "Swipe left/right between articles",
              },
            ].map((shortcut) => (
              <div
                key={shortcut.key}
                className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex items-start gap-3"
              >
                <kbd className="px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-xs text-slate-900 dark:text-white shrink-0">
                  {shortcut.key}
                </kbd>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {shortcut.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {shortcut.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: User Profile & Reader Persona (Zero Login) */}
        <section className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Reader Profile &amp; Preferences
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Local identity for reading metrics and export templates (no password required)
              </p>
            </div>
          </div>

          {profile ? (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={profile.displayName}
                    onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Harry, Alex, Reader"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Reading Velocity (WPM)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={1000}
                    value={profile.readingSpeedWpm}
                    onChange={(e) =>
                      setProfile({ ...profile, readingSpeedWpm: parseInt(e.target.value) || 230 })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-slate-400">
                    Used to compute authentic dwell words digested
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Obsidian Note Subfolder
                </label>
                <input
                  type="text"
                  value={profile.obsidianVaultSubfolder}
                  onChange={(e) =>
                    setProfile({ ...profile, obsidianVaultSubfolder: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  placeholder="01 - Inbox/Synapse"
                />
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4 space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Work &amp; Team Digest
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Customize the team digest generated when flagging articles with the briefcase
                    icon or{" "}
                    <kbd className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">
                      W
                    </kbd>{" "}
                    key
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Organization / Team Name
                    </label>
                    <input
                      type="text"
                      value={profile.workDigestName || ""}
                      onChange={(e) => setProfile({ ...profile, workDigestName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Work, Engineering, Acme, SecOps"
                    />
                    <span className="text-[10px] text-slate-400">
                      Changes all buttons and badges to &quot;[Name] Digest&quot;
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Digest Recipient Email
                    </label>
                    <input
                      type="email"
                      value={profile.workDigestEmail || ""}
                      onChange={(e) => setProfile({ ...profile, workDigestEmail: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      placeholder="e.g. team@company.com or your work email"
                    />
                    <span className="text-[10px] text-slate-400">
                      Pre-populates the recipient when creating email digests
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                >
                  {profileSaving ? "Saving..." : "Save Profile Settings"}
                </button>
                {profileMessage && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                    {profileMessage}
                  </span>
                )}
              </div>
            </form>
          ) : (
            <div className="text-xs text-slate-400">Loading reader profile...</div>
          )}
        </section>

        {/* Section 4: Integrations & Database Maintenance */}
        <section className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <HardDrive className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Storage, Vault &amp; Data Portability
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Obsidian vault synchronization, OPML portability, and database health
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Obsidian Vault Status */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <FolderCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Obsidian Canonical Vault</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-mono truncate">
                {systemStatus?.obsidian.configured
                  ? systemStatus.obsidian.path || "Mounted (Container Root)"
                  : "Not Mounted (Standalone Mode)"}
              </p>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Target Subfolder:{" "}
                <code className="bg-slate-200/60 dark:bg-slate-800 px-1 py-0.5 rounded">
                  {profile?.obsidianVaultSubfolder || "01 - Inbox/Synapse"}
                </code>
              </div>
              <div className="pt-2 flex items-center gap-1.5 text-xs font-medium">
                {systemStatus?.obsidian.configured ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4" /> Mounted &amp; Ready (Asset Localizer Active)
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Check className="w-4 h-4" /> Unmounted (Direct Browser .MD Download)
                  </span>
                )}
              </div>
            </div>

            {/* Google Docs Status */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <FileCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Google Docs &amp; Drive Export</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {systemStatus?.googleDocs.configured
                  ? "OAuth2 / Service Account configured"
                  : "Optional (Disabled / No Key)"}
              </p>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Generates formatted docs with full typography and web links.
              </div>
              <div className="pt-2 flex items-center gap-1.5 text-xs font-medium">
                {systemStatus?.googleDocs.configured ? (
                  <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <Check className="w-4 h-4" /> Operational
                  </span>
                ) : (
                  <span className="text-slate-400">Not Configured</span>
                )}
              </div>
            </div>
          </div>

          {/* Data Portability & Database Actions */}
          <div className="pt-2 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Data Portability &amp; Backups
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/api/feeds/export/opml"
                download="synapse-subscriptions.opml"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2 active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Export Subscriptions OPML</span>
              </a>

              <button
                onClick={handleCreateBackup}
                disabled={backupLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
              >
                <HardDrive className={`w-4 h-4 ${backupLoading ? "animate-spin" : ""}`} />
                <span>{backupLoading ? "Creating Backup..." : "Create Atomic Backup Now"}</span>
              </button>

              <button
                onClick={handleCheckIntegrity}
                disabled={checkLoading}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
              >
                <ShieldCheck className={`w-4 h-4 ${checkLoading ? "animate-spin" : ""}`} />
                <span>{checkLoading ? "Checking..." : "Verify Database Integrity"}</span>
              </button>
            </div>

            {backupResult && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 rounded-xl text-xs font-mono animate-in fade-in">
                {backupResult}
              </div>
            )}

            {checkResult && (
              <div
                className={`p-3 rounded-xl border text-xs font-mono animate-in fade-in ${
                  checkResult.healthy
                    ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                    : "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200"
                }`}
              >
                {checkResult.healthy ? "✓ " : "✗ "}
                {checkResult.message}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
