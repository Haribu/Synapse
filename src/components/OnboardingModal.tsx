"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Upload,
  Plus,
  Rss,
  Check,
  CheckCircle2,
  X,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Cpu,
  ShieldAlert,
  Globe,
  Palette,
  Briefcase,
  User,
  FolderCheck,
  Compass,
  FlaskConical,
} from "lucide-react";
import { STARTER_PACKS } from "@/lib/data/starter-packs";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted: () => void;
  isDryRun?: boolean;
}

export function OnboardingModal({
  isOpen,
  onClose,
  onCompleted,
  isDryRun = false,
}: OnboardingModalProps) {
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Profile & Team Settings
  const [displayName, setDisplayName] = useState("Reader");
  const [readingIntent, setReadingIntent] = useState<"personal" | "team">("personal");
  const [workDigestName, setWorkDigestName] = useState("Work");
  const [workDigestEmail, setWorkDigestEmail] = useState("");
  const [obsidianSubfolder, setObsidianSubfolder] = useState("01 - Inbox/Synapse");
  const [savingProfile, setSavingProfile] = useState(false);

  // Step 2: Feeds & Ingestion
  const [activeTab, setActiveTab] = useState<"packs" | "opml" | "manual">("packs");
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([
    "tech-engineering",
    "ai-machine-learning",
  ]);
  const [subscribingPacks, setSubscribingPacks] = useState(false);
  const [packSuccess, setPackSuccess] = useState<string | null>(null);

  // OPML Upload state
  const [opmlFile, setOpmlFile] = useState<File | null>(null);
  const [uploadingOpml, setUploadingOpml] = useState(false);
  const [opmlResult, setOpmlResult] = useState<string | null>(null);

  // Manual URL state
  const [manualUrl, setManualUrl] = useState("");
  const [manualCategory, setManualCategory] = useState("General");
  const [addingManual, setAddingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Load existing profile on open (or pristine defaults in dry run)
  useEffect(() => {
    if (isOpen) {
      if (isDryRun) {
        setDisplayName("Reader");
        setReadingIntent("personal");
        setWorkDigestName("Work");
        setWorkDigestEmail("");
        setObsidianSubfolder("01 - Inbox/Synapse");
        setStep(1);
        setPackSuccess(null);
        setOpmlResult(null);
        setManualError(null);
        return;
      }
      fetch("/api/profile")
        .then((res) => res.json())
        .then((data) => {
          if (data.profile) {
            if (data.profile.displayName) setDisplayName(data.profile.displayName);
            if (data.profile.workDigestName) {
              setWorkDigestName(data.profile.workDigestName);
              if (data.profile.workDigestName !== "Work" || data.profile.workDigestEmail) {
                setReadingIntent("team");
              }
            }
            if (data.profile.workDigestEmail) setWorkDigestEmail(data.profile.workDigestEmail);
            if (data.profile.obsidianVaultSubfolder)
              setObsidianSubfolder(data.profile.obsidianVaultSubfolder);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, isDryRun]);

  if (!isOpen) return null;

  const handleSaveProfileAndContinue = async () => {
    setSavingProfile(true);
    if (isDryRun) {
      setTimeout(() => {
        setSavingProfile(false);
        setStep(2);
      }, 350);
      return;
    }
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || "Reader",
          workDigestName: readingIntent === "team" ? workDigestName.trim() || "Work" : "Work",
          workDigestEmail: readingIntent === "team" ? workDigestEmail.trim() || null : null,
          obsidianVaultSubfolder: obsidianSubfolder.trim() || "01 - Inbox/Synapse",
        }),
      });
      setStep(2);
    } catch (err) {
      console.warn("Failed to save profile during onboarding", err);
      setStep(2);
    } finally {
      setSavingProfile(false);
    }
  };

  const togglePack = (packId: string) => {
    setSelectedPackIds((prev) =>
      prev.includes(packId) ? prev.filter((id) => id !== packId) : [...prev, packId]
    );
  };

  const handleSubscribePacks = async () => {
    if (selectedPackIds.length === 0) return;
    setSubscribingPacks(true);
    setPackSuccess(null);

    if (isDryRun) {
      setTimeout(() => {
        setSubscribingPacks(false);
        setPackSuccess(
          `✓ Dry run: Simulated subscription to ${totalFeedsSelected} feeds across ${selectedPackIds.length} packs. No feeds were added to your database.`
        );
        setTimeout(() => {
          onClose();
        }, 1500);
      }, 600);
      return;
    }

    try {
      const res = await fetch("/api/feeds/starter-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packIds: selectedPackIds }),
      });
      const data = await res.json();
      if (data.success) {
        setPackSuccess(
          `Subscribed to ${data.addedCount} feeds! (${data.skippedCount} already in library)`
        );
        setTimeout(() => {
          onCompleted();
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setPackSuccess(`Subscription error: ${err.message}`);
    } finally {
      setSubscribingPacks(false);
    }
  };

  const handleOpmlUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opmlFile) return;
    setUploadingOpml(true);
    setOpmlResult(null);

    if (isDryRun) {
      setTimeout(() => {
        setUploadingOpml(false);
        setOpmlResult("✓ Dry run: Simulated OPML import. No feeds were added to your database.");
        setTimeout(() => {
          onClose();
        }, 1500);
      }, 600);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("opml", opmlFile);
      const res = await fetch("/api/feeds/import-opml", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setOpmlResult(`Successfully imported ${data.importedCount} feeds!`);
        setTimeout(() => {
          onCompleted();
          onClose();
        }, 1200);
      } else {
        setOpmlResult(`Import failed: ${data.error}`);
      }
    } catch (err: any) {
      setOpmlResult(`Upload error: ${err.message}`);
    } finally {
      setUploadingOpml(false);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUrl.trim()) return;
    setAddingManual(true);
    setManualError(null);

    if (isDryRun) {
      setTimeout(() => {
        setAddingManual(false);
        onClose();
      }, 600);
      return;
    }

    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedUrl: manualUrl.trim(),
          category: manualCategory,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onCompleted();
        onClose();
      } else {
        setManualError(data.error || "Failed to add feed");
      }
    } catch (err: any) {
      setManualError(err.message);
    } finally {
      setAddingManual(false);
    }
  };

  const getPackIcon = (iconName: string) => {
    switch (iconName) {
      case "Cpu":
        return <Cpu className="w-4 h-4 text-slate-700 dark:text-slate-300" />;
      case "Sparkles":
        return <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      case "ShieldAlert":
        return <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case "Globe":
        return <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case "Palette":
        return <Palette className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
      default:
        return <BookOpen className="w-4 h-4 text-slate-700 dark:text-slate-300" />;
    }
  };

  const totalFeedsSelected = STARTER_PACKS.filter((p) => selectedPackIds.includes(p.id)).reduce(
    (acc, p) => acc + p.feeds.length,
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full h-full md:h-auto md:max-h-[92vh] md:max-w-2xl bg-[#FAF8F5] dark:bg-[#0B0D12] border-0 md:border md:border-[var(--card-border)] md:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Editorial Header */}
        <div className="p-6 border-b border-[var(--card-border)] flex items-start justify-between bg-stone-100/60 dark:bg-stone-900/40">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-stone-200/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
              <Compass className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
              <span>Synapse Sanctuary • Step {step} of 2</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-slate-900 dark:text-white tracking-tight">
              {step === 1 ? "Personalize Your Reading Sanctuary" : "Curate Your Reading Library"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans leading-relaxed max-w-lg">
              {step === 1
                ? "Configure your reader handle, curation intent, and literature note preferences. All data stays local to your SQLite database."
                : "Select vetted starter bundles, import an existing OPML library, or paste a custom feed URL."}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dry Run Simulation Banner */}
        {isDryRun && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-amber-700 dark:text-amber-400">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 shrink-0 text-amber-500" />
              <span>
                <strong>Dry Run Mode:</strong> Previewing first-run onboarding. No settings, feeds,
                or databases will be altered.
              </span>
            </div>
            <span className="font-mono text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
              Simulation Only
            </span>
          </div>
        )}

        {/* Step Progression Bar */}
        <div className="flex border-b border-[var(--card-border)] bg-stone-50/50 dark:bg-stone-950/40 px-6 py-2.5 text-xs font-medium gap-6">
          <button
            onClick={() => setStep(1)}
            className={`flex items-center gap-2 transition-colors ${
              step === 1
                ? "text-slate-900 dark:text-white font-bold"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${
                step === 1
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold"
                  : "bg-stone-200 dark:bg-stone-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              1
            </span>
            <span>Reader &amp; Curation Persona</span>
          </button>

          <button
            onClick={() => setStep(2)}
            className={`flex items-center gap-2 transition-colors ${
              step === 2
                ? "text-slate-900 dark:text-white font-bold"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${
                step === 2
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold"
                  : "bg-stone-200 dark:bg-stone-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              2
            </span>
            <span>Feed Subscriptions</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {step === 1 ? (
            <div className="space-y-6">
              {/* Reader Identity */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span>Reader Handle</span>
                </div>
                <div>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Harry, Alex, Reader"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-stone-900 border border-[var(--card-border)] rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400 font-sans shadow-2xs"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Used to label reading dwell telemetry and local session digests.
                  </span>
                </div>
              </div>

              {/* Reading Intent Selector: Personal vs Team */}
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Reading &amp; Curation Purpose
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setReadingIntent("personal")}
                    className={`p-4 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                      readingIntent === "personal"
                        ? "bg-stone-100/80 dark:bg-stone-800/80 border-slate-400 dark:border-slate-500 shadow-xs"
                        : "bg-white dark:bg-stone-900/60 border-[var(--card-border)] hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                        Personal Sanctuary
                      </span>
                      {readingIntent === "personal" && (
                        <div className="w-4 h-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Distraction-free personal reading, study queues, and quiet research synthesis.
                    </p>
                  </div>

                  <div
                    onClick={() => setReadingIntent("team")}
                    className={`p-4 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                      readingIntent === "team"
                        ? "bg-stone-100/80 dark:bg-stone-800/80 border-slate-400 dark:border-slate-500 shadow-xs"
                        : "bg-white dark:bg-stone-900/60 border-[var(--card-border)] hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                        Team &amp; Work Curation
                      </span>
                      {readingIntent === "team" && (
                        <div className="w-4 h-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Flag stories while reading with <kbd className="font-mono text-[10px]">W</kbd>{" "}
                      to compile 1-click email and Slack summaries.
                    </p>
                  </div>
                </div>
              </div>

              {/* Team Digest Progressive Reveal */}
              {readingIntent === "team" && (
                <div className="p-4 rounded-xl border border-[var(--card-border)] bg-stone-100/50 dark:bg-stone-900/40 space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Team or Company Name
                      </label>
                      <input
                        type="text"
                        value={workDigestName}
                        onChange={(e) => setWorkDigestName(e.target.value)}
                        placeholder="e.g. Engineering, Acme, SecOps"
                        className="w-full px-3 py-2 bg-white dark:bg-stone-950 border border-[var(--card-border)] rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400 font-sans"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Badges will label as &quot;{workDigestName || "Work"} Digest&quot;.
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Digest Destination Email (Optional)
                      </label>
                      <input
                        type="email"
                        value={workDigestEmail}
                        onChange={(e) => setWorkDigestEmail(e.target.value)}
                        placeholder="e.g. team@company.com"
                        className="w-full px-3 py-2 bg-white dark:bg-stone-950 border border-[var(--card-border)] rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400 font-mono"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Pre-fills the mailto: recipient when dispatching digests.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Obsidian & Literature Notes */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <FolderCheck className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span>Obsidian Literature Notes (Optional)</span>
                </div>
                <div>
                  <input
                    type="text"
                    value={obsidianSubfolder}
                    onChange={(e) => setObsidianSubfolder(e.target.value)}
                    placeholder="01 - Inbox/Synapse"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-stone-900 border border-[var(--card-border)] rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400 font-mono shadow-2xs"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Target subfolder inside your mounted vault. If unmounted, notes download as
                    clean .md files.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tab Selector */}
              <div className="flex border-b border-[var(--card-border)] pb-3 gap-2">
                <button
                  onClick={() => setActiveTab("packs")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    activeTab === "packs"
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
                      : "bg-stone-200/80 dark:bg-stone-800 text-slate-600 dark:text-slate-300 hover:bg-stone-300"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Curated Starter Packs</span>
                </button>

                <button
                  onClick={() => setActiveTab("opml")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    activeTab === "opml"
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
                      : "bg-stone-200/80 dark:bg-stone-800 text-slate-600 dark:text-slate-300 hover:bg-stone-300"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import OPML</span>
                </button>

                <button
                  onClick={() => setActiveTab("manual")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    activeTab === "manual"
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
                      : "bg-stone-200/80 dark:bg-stone-800 text-slate-600 dark:text-slate-300 hover:bg-stone-300"
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Single Feed</span>
                </button>
              </div>

              {activeTab === "packs" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-2.5">
                    {STARTER_PACKS.map((pack) => {
                      const isSelected = selectedPackIds.includes(pack.id);
                      return (
                        <div
                          key={pack.id}
                          onClick={() => togglePack(pack.id)}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3.5 ${
                            isSelected
                              ? "bg-stone-100/90 dark:bg-stone-800/70 border-slate-400 dark:border-slate-500 shadow-xs"
                              : "bg-white dark:bg-stone-900/60 border-[var(--card-border)] hover:border-slate-300 dark:hover:border-slate-700"
                          }`}
                        >
                          <div className="p-2 rounded-lg bg-stone-200/70 dark:bg-stone-800 shrink-0 mt-0.5">
                            {getPackIcon(pack.icon)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                {pack.name}
                              </h3>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-200/80 dark:bg-stone-800 text-slate-600 dark:text-slate-400">
                                {pack.feeds.length} feeds
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                              {pack.description}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {pack.feeds.map((f) => (
                                <span
                                  key={f.feedUrl}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800/80 text-slate-600 dark:text-slate-300 font-sans font-medium"
                                >
                                  {f.title}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-1 transition-colors ${
                              isSelected
                                ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white"
                                : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {packSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span>{packSuccess}</span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "opml" && (
                <form onSubmit={handleOpmlUpload} className="space-y-4">
                  <div className="border-2 border-dashed border-[var(--card-border)] rounded-2xl p-8 text-center space-y-3 hover:border-slate-400 transition-colors bg-white/50 dark:bg-stone-900/40">
                    <div className="p-3 bg-stone-200/80 dark:bg-stone-800 text-slate-700 dark:text-slate-300 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer hover:underline">
                        <span>Click to select an OPML file</span>
                        <input
                          type="file"
                          accept=".opml,.xml"
                          onChange={(e) => setOpmlFile(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Exported from Feedly, Inoreader, NetNewsWire, Miniflux, etc.
                      </p>
                    </div>

                    {opmlFile && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-200/80 dark:bg-stone-800 text-slate-800 dark:text-slate-200 text-xs font-mono font-medium">
                        <Rss className="w-3.5 h-3.5 text-blue-500" />
                        <span>
                          {opmlFile.name} ({(opmlFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                    )}
                  </div>

                  {opmlResult && (
                    <div className="p-3 rounded-xl bg-stone-100 dark:bg-stone-800 text-slate-800 dark:text-slate-200 text-xs font-mono">
                      {opmlResult}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!opmlFile || uploadingOpml}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-sm"
                  >
                    {uploadingOpml ? "Importing OPML..." : "Start OPML Import"}
                  </button>
                </form>
              )}

              {activeTab === "manual" && (
                <form onSubmit={handleManualAdd} className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Feed URL or Website
                      </label>
                      <input
                        type="url"
                        required
                        value={manualUrl}
                        onChange={(e) => setManualUrl(e.target.value)}
                        placeholder="https://simonwillison.net/atom/entries/ or https://theverge.com"
                        className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-[var(--card-border)] rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400 font-mono"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Direct RSS/Atom URLs and standard websites are automatically discovered.
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Category
                      </label>
                      <select
                        value={manualCategory}
                        onChange={(e) => setManualCategory(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-[var(--card-border)] rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                      >
                        <option value="Technology">Technology</option>
                        <option value="Cybersecurity">Cybersecurity</option>
                        <option value="World & Economy">World & Economy</option>
                        <option value="Culture">Culture</option>
                        <option value="Science">Science</option>
                        <option value="General">General</option>
                      </select>
                    </div>
                  </div>

                  {manualError && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs">
                      {manualError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={addingManual || !manualUrl.trim()}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-sm"
                  >
                    {addingManual ? "Validating & Adding..." : "Add Feed"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--card-border)] bg-stone-100/50 dark:bg-stone-900/40 flex items-center justify-between">
          {step === 1 ? (
            <>
              <span className="text-xs text-slate-400 font-sans">
                You can change all preferences anytime in Settings.
              </span>
              <button
                onClick={handleSaveProfileAndContinue}
                disabled={savingProfile}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95 shadow-sm"
              >
                <span>{savingProfile ? "Saving..." : "Continue to Feeds"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 border border-[var(--card-border)] text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-all flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-semibold hover:bg-stone-200/50 dark:hover:bg-stone-800 rounded-xl transition-all"
                >
                  {isDryRun ? "Exit Preview" : "Skip for now"}
                </button>

                {activeTab === "packs" && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                      {totalFeedsSelected} feeds selected
                    </span>
                    <button
                      onClick={handleSubscribePacks}
                      disabled={selectedPackIds.length === 0 || subscribingPacks}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95 shadow-sm"
                    >
                      <span>
                        {subscribingPacks
                          ? "Subscribing..."
                          : isDryRun
                            ? "Simulate Launch"
                            : "Launch Synapse"}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
