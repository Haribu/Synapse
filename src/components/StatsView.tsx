"use client";

import React, { useEffect, useState } from "react";
import {
  Clock,
  BookOpen,
  Zap,
  Bookmark,
  TrendingUp,
  FolderPlus,
  Flame,
  PieChart,
  BarChart3,
  Layers,
  Database,
  HardDrive,
  Terminal,
  Cpu,
  Video,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Filter,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { APP_VERSION } from "@/lib/version";

interface StatsData {
  summary: {
    totalArticles: number;
    readArticles: number; // Triaged / marked read
    engagedArticles?: number; // >=30s genuine read
    flickedArticles?: number; // <10s quick dismissal
    skimmedArticles?: number; // 10-29s glance
    engagementRatio?: number;
    unreadArticles: number;
    starredArticles: number;
    hydratedArticles: number;
    researchInboxCount: number;
    boardsCount: number;
    obsidianSaved: number;
    gdocsSaved: number;
    totalWordsRead: number;
    estimatedMinutesRead: number;
    loggedSeconds: number;
    streakDays: number;
    isStreakActiveToday?: boolean;
  };
  queueClearance?: {
    starred: {
      total: number;
      read: number;
      engaged: number;
      pending: number;
    };
    research: {
      total: number;
      read: number;
      pending: number;
    };
    obsidianNotesSaved: number;
    gdocsNotesSaved: number;
  };
  categories: {
    category: string;
    total: number;
    read: number;
    engaged?: number;
    engagedSeconds?: number;
  }[];
  mediaBreakdown: {
    type: string;
    count: number;
  }[];
  contentSplit?: {
    written: {
      total: number;
      read: number;
      engaged: number;
      wordsRead: number;
      minutesRead: number;
    };
    video: {
      total: number;
      triaged?: number;
      watched: number;
      watchHours?: number;
      watchMinutes?: number;
      watchLater: number;
    };
  };
  noiseStats?: {
    sponsoredCount: number;
    roundupCount: number;
    vendorCount: number;
    readCount: number;
    totalSuppressed: number;
  };
  dailyVelocity: {
    date: string;
    count: number;
    engaged?: number;
    skimmed?: number;
    flicked?: number;
  }[];
  nerdStats?: {
    dbSizeBytes: number;
    walSizeBytes: number;
    totalDiskMb: string;
    pageSize: number;
    pageCount: number;
    freelistCount: number;
    mostReadFeeds?: {
      title: string;
      category: string | null;
      editorialType: string | null;
      engagedSeconds?: number;
      engagedCount?: number;
      readCount: number;
      totalCount: number;
    }[];
    highestVolumeFeeds?: {
      title: string;
      category: string | null;
      editorialType: string | null;
      itemCount: number;
    }[];
    topFeeds: {
      title: string;
      category: string | null;
      editorialType: string | null;
      itemCount: number;
    }[];
    tableCounts: {
      feeds: number;
      feedItems: number;
      readingList: number;
      readingSessions: number;
      feedback: number;
      ftsIndexed: number;
    };
    syncTelemetry?: {
      lastSyncAt: string | null;
      durationMs: number;
      totalFeeds: number;
      standardFeedsChecked: number;
      youtubeFeedsChecked: number;
      adaptiveSkippedCount: number;
      healthyCount: number;
      errorCount: number;
      newArticlesTotal: number;
      nextScheduledAt: string | null;
    } | null;
  } | null;
}

export interface StatsViewProps {
  onNavigateView?: (view: "unread" | "starred" | "reading_list" | "all" | "work") => void;
}

export function StatsView({ onNavigateView }: StatsViewProps = {}) {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load stats", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900 text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Calculating reading analytics...</span>
        </div>
      </div>
    );
  }

  if (!data || !data.summary) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900 text-slate-500">
        Unable to load reading statistics.
      </div>
    );
  }

  const { summary, categories, mediaBreakdown, dailyVelocity } = data;

  const hoursRead = Math.floor(summary.estimatedMinutesRead / 60);
  const remainingMinutes = summary.estimatedMinutesRead % 60;
  const deepResearchTotal =
    (summary.obsidianSaved || 0) + (summary.gdocsSaved || 0) + (summary.researchInboxCount || 0);

  const maxVelocity = Math.max(...dailyVelocity.map((v) => v.count), 1);

  return (
    <div className="flex-1 bg-slate-900 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-8 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <span>Reading &amp; Research Analytics</span>
            {summary.streakDays > 0 ? (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  summary.isStreakActiveToday
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
              >
                <Flame
                  className={`w-3.5 h-3.5 ${summary.isStreakActiveToday ? "fill-emerald-400" : "fill-amber-400"}`}
                />
                {summary.streakDays} Day Streak ·{" "}
                {summary.isStreakActiveToday ? "Active Today" : "Read Today to Maintain"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                <Flame className="w-3.5 h-3.5 text-slate-500" />0 Day Streak · Read 1 to Start
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Grounded telemetry across genuine active reading (≥30s), triage volume, and synthesized
            research assets.
          </p>
        </div>
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-800/80 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-all shadow-sm shrink-0"
        >
          <HelpCircle className="w-4 h-4 text-blue-400" />
          <span>{showGuide ? "Hide Analytics Guide" : "Analytics Guide & System Updates"}</span>
          {showGuide ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Analytics & System Updates Guide Panel */}
      {showGuide && (
        <div className="mb-8 p-6 rounded-2xl border border-blue-500/30 bg-slate-950/80 shadow-lg space-y-6 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5 text-blue-400">
              <Sparkles className="w-5 h-5 text-blue-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-blue-300">
                Synapse Telemetry Guide &amp; Architecture Updates
              </h2>
            </div>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              v{APP_VERSION} Release
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300">
            {/* Column 1: Reading Telemetry Model */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs border-b border-slate-800 pb-1.5">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span>How Reading Metrics Are Measured</span>
              </div>

              <div className="space-y-2 leading-relaxed">
                <p>
                  <strong className="text-white">Triaged vs. Deep Engaged:</strong> In traditional
                  RSS readers, clicking &ldquo;Mark All Read&rdquo; artificially inflates
                  consumption metrics. Synapse uses a 3-tier active dwell timer to capture authentic
                  attention:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                  <li>
                    <strong className="text-slate-200">Flick (&lt;10s):</strong> Opened but quickly
                    skimmed past or dismissed.
                  </li>
                  <li>
                    <strong className="text-slate-200">Skim (10–29s):</strong> Headline and
                    introductory pass.
                  </li>
                  <li>
                    <strong className="text-slate-200">Deep Engaged (&ge;30s):</strong> Genuine,
                    focused long-form reading.
                  </li>
                </ul>
              </div>

              <div className="space-y-1.5 leading-relaxed">
                <p>
                  <strong className="text-white">Words Read &amp; Velocity:</strong> Rather than
                  summing raw article word counts, digested words are bounded by a human reading
                  velocity of ~230 words per minute multiplied by active dwell time. Background tabs
                  and abandoned windows do not accumulate read words.
                </p>
              </div>

              <div className="space-y-1.5 leading-relaxed">
                <p>
                  <strong className="text-white">Video &amp; Watch Later Segregation:</strong>{" "}
                  YouTube and video subscriptions are separated from textual feeds. Videos marked
                  read via list triage are recorded as <em>Triaged / Dismissed</em>; only videos
                  with active playback or &ge;30s duration are recorded as <em>Actually Watched</em>
                  .
                </p>
              </div>
            </div>

            {/* Column 2: Recent Architecture Updates */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs border-b border-slate-800 pb-1.5">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span>Recent System &amp; Engine Enhancements</span>
              </div>

              <div className="space-y-2.5 leading-relaxed text-slate-400">
                <div>
                  <span className="text-purple-300 font-semibold block text-[11px]">
                    ✦ Editorial Sanctuary &amp; 3-Tier Multi-Device UX (v0.4.0)
                  </span>
                  <span>
                    Warm Paper (
                    <code className="text-[10px] text-purple-300 bg-slate-900 px-1 py-0.5 rounded">
                      #FAF8F5
                    </code>
                    ) and Deep Obsidian (
                    <code className="text-[10px] text-purple-300 bg-slate-900 px-1 py-0.5 rounded">
                      #0B0D12
                    </code>
                    ) surfaces, 2-pane tablet layout, auto-hiding mobile reader bars, horizontal
                    swipe-to-triage rows,{" "}
                    <kbd className="font-mono text-[10px] bg-slate-800 px-1 rounded">⌘K</kbd>{" "}
                    Command Palette, and inline docked desktop notes.
                  </span>
                </div>

                <div>
                  <span className="text-purple-300 font-semibold block text-[11px]">
                    ✦ Zero-Token Multi-Signal Breaking Story Clustering
                  </span>
                  <span>
                    Articles published within 72 hours covering identical breaking stories are
                    grouped under the authoritative source with an expandable{" "}
                    <code className="text-[10px] text-purple-300 bg-slate-900 px-1 py-0.5 rounded">
                      +N related sources
                    </code>{" "}
                    accordion.
                  </span>
                </div>

                <div>
                  <span className="text-purple-300 font-semibold block text-[11px]">
                    ✦ Multi-Tier Ingestion &amp; Anti-Blocking Fallbacks
                  </span>
                  <span>
                    Fallback JSON-LD schema extraction and structured metadata capture.
                    Unreachable, bot-challenged, or Turnstile-blocked pages progressively escalate
                    to Jina Reader and Wayback Machine web archives.
                  </span>
                </div>

                <div>
                  <span className="text-purple-300 font-semibold block text-[11px]">
                    ✦ Filter-Bounded Navigation &amp; Hero Image Toggles
                  </span>
                  <span>
                    Keyboard navigation (
                    <kbd className="font-mono text-[10px] bg-slate-800 px-1 rounded">j</kbd>/
                    <kbd className="font-mono text-[10px] bg-slate-800 px-1 rounded">k</kbd>) and
                    reader pagination strictly cycle through filtered items. Reading settings
                    include toggles to suppress large header/hero images.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3-Tier Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {/* Tier 2: True Reading Time */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Active Reading Time</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {hoursRead > 0 ? `${hoursRead}h ${remainingMinutes}m` : `${remainingMinutes}m`}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            ~{summary.totalWordsRead.toLocaleString()} words digested
          </div>
          <div className="text-[10px] text-blue-400/80 mt-1 font-mono">≥30s active dwell</div>
        </div>

        {/* Tier 1 vs Tier 2: Reading Engagement */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Engaged vs Triaged</span>
            <BookOpen className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {summary.engagedArticles || 0}{" "}
            <span className="text-sm font-normal text-slate-500">
              deep / {summary.readArticles} triaged
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${summary.engagementRatio || 0}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex justify-between">
            <span>{summary.engagementRatio || 0}% true consumption</span>
            <span>{summary.flickedArticles || 0} quick dismissals</span>
          </div>
        </div>

        {/* Hydrated Full Pages */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Full Pages Hydrated</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{summary.hydratedArticles}</div>
          <div className="text-[11px] text-slate-500 mt-1">Clean markdown extracted</div>
          <div className="text-[10px] text-amber-400/80 mt-1 font-mono">
            Resolving snippet stubs & partial feeds
          </div>
        </div>

        {/* Tier 3: Deep Research Assets */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Deep Research Assets</span>
            <Bookmark className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{deepResearchTotal}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {summary.obsidianSaved} Obsidian · {summary.gdocsSaved} GDocs
          </div>
          <div className="text-[10px] text-purple-400/80 mt-1 font-mono">
            {summary.researchInboxCount} in Research Inbox
          </div>
        </div>
      </div>

      {/* Deep Research & Saved Queue Clearance */}
      {data.queueClearance && (
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 shadow-sm mb-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-amber-400" />
                <span>Deep Research &amp; Saved Queue Clearance</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Prevent reading debt by actively digesting starred articles and synthesizing
                research inbox links into permanent notes.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-md border border-purple-500/20">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{data.queueClearance.obsidianNotesSaved} Notes in Obsidian</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Read Later (Starred Articles) Queue */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    Read Later (Starred Articles)
                  </span>
                  <span className="text-xs font-mono text-amber-400">
                    {data.queueClearance.starred.pending} Pending /{" "}
                    {data.queueClearance.starred.total} Total
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {data.queueClearance.starred.engaged} deep reads completed out of{" "}
                  {data.queueClearance.starred.read} triaged articles.
                </p>
                <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all"
                    style={{
                      width: `${
                        data.queueClearance.starred.total > 0
                          ? Math.round(
                              (data.queueClearance.starred.read /
                                data.queueClearance.starred.total) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {onNavigateView && (
                <button
                  onClick={() => onNavigateView("starred")}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all group"
                >
                  <span>Digest Starred Articles</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}
            </div>

            {/* Research Inbox (External Links & Literature) */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    Research Inbox (External Links)
                  </span>
                  <span className="text-xs font-mono text-purple-400">
                    {data.queueClearance.research.pending} Pending /{" "}
                    {data.queueClearance.research.total} Total
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  External deep-dives, academic papers, and newsletters waiting for literature
                  synthesis.
                </p>
                <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-purple-500 h-full rounded-full transition-all"
                    style={{
                      width: `${
                        data.queueClearance.research.total > 0
                          ? Math.round(
                              (data.queueClearance.research.read /
                                data.queueClearance.research.total) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {onNavigateView && (
                <button
                  onClick={() => onNavigateView("reading_list")}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-all group"
                >
                  <span>Digest Research Inbox</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Written Content vs Video Breakdown */}
      {data.contentSplit && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* Written Articles Card */}
          <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-blue-400" />
                Written Articles
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {data.contentSplit.written.total} total
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Read / Triaged</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {data.contentSplit.written.read}
                </div>
                <div className="text-[9px] text-slate-500">
                  {Math.round(
                    (data.contentSplit.written.read / (data.contentSplit.written.total || 1)) * 100
                  )}
                  % triaged
                </div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Deep Engaged</div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">
                  {data.contentSplit.written.engaged}
                </div>
                <div className="text-[9px] text-slate-500">≥30s reading</div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Words Read</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {(data.contentSplit.written.wordsRead / 1000).toFixed(1)}k
                </div>
                <div className="text-[9px] text-slate-500">
                  ~{data.contentSplit.written.minutesRead} mins
                </div>
              </div>
            </div>
          </div>

          {/* Videos & Media Card */}
          <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <Video className="w-4 h-4 text-rose-400" />
                Watch Later &amp; Videos
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {data.contentSplit.video.total} total
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Triaged / Dismissed</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {data.contentSplit.video.triaged ?? data.contentSplit.video.total}
                </div>
                <div className="text-[9px] text-slate-500">
                  {Math.round(
                    ((data.contentSplit.video.triaged ?? 0) /
                      (data.contentSplit.video.total || 1)) *
                      100
                  )}
                  % triaged
                </div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Actually Watched</div>
                <div className="text-lg font-bold text-purple-400 mt-0.5">
                  {data.contentSplit.video.watched}
                </div>
                <div className="text-[9px] text-slate-500">
                  {(data.contentSplit.video.watchHours ?? 0) > 0
                    ? `~${data.contentSplit.video.watchHours}h duration (≥30s)`
                    : `~${data.contentSplit.video.watchMinutes ?? 0}m duration (≥30s)`}
                </div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Watch Later</div>
                <div className="text-lg font-bold text-amber-400 mt-0.5">
                  {data.contentSplit.video.watchLater}
                </div>
                <div className="text-[9px] text-slate-500">In video queue</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Noise Reduction & Suppression Telemetry Card */}
      {data.noiseStats && (
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-amber-400" />
              Noise Reduction &amp; Excluded Content
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {data.noiseStats.totalSuppressed} total promotional / syndicated items
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Sponsored / Webinars / Demos</div>
              <div className="text-lg font-bold text-amber-400 mt-0.5">
                {data.noiseStats.sponsoredCount}
              </div>
              <div className="text-[9px] text-slate-500">
                Commercial promotion &amp; lead-magnets
              </div>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Weekly Roundups &amp; Recaps</div>
              <div className="text-lg font-bold text-purple-400 mt-0.5">
                {data.noiseStats.roundupCount}
              </div>
              <div className="text-[9px] text-slate-500">Duplicate weekly digest summaries</div>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Vendor Editorial Posts</div>
              <div className="text-lg font-bold text-blue-400 mt-0.5">
                {data.noiseStats.vendorCount}
              </div>
              <div className="text-[9px] text-slate-500">Commercial / vendor blogs</div>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Triaged / Hidden Read</div>
              <div className="text-lg font-bold text-slate-300 mt-0.5">
                {data.noiseStats.readCount}
              </div>
              <div className="text-[9px] text-slate-500">Filtered from unread view</div>
            </div>
          </div>
        </div>
      )}

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Weekly Reading Velocity Bar Chart */}
        <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <span>7-Day Reading Velocity</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Engaged reading sessions (≥30s dwell)
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-blue-400">
                <span className="w-2 h-2 rounded-sm bg-blue-600 inline-block" /> Engaged
              </span>
              <span className="flex items-center gap-1 text-slate-500">
                <span className="w-2 h-2 rounded-sm bg-slate-800 inline-block" /> Skims
              </span>
            </div>
          </div>

          <div className="h-44 flex items-end gap-3 pt-4">
            {dailyVelocity.map((day) => {
              const heightPercent = Math.max(Math.round((day.count / maxVelocity) * 100), 8);

              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                  <div className="text-[10px] text-slate-400 font-mono">
                    {day.count > 0 ? day.count : ""}
                  </div>
                  <div className="w-full bg-slate-900 rounded-t-md h-32 flex items-end overflow-hidden p-1">
                    <div
                      className="w-full bg-blue-600 hover:bg-blue-500 rounded-t transition-all"
                      style={{ height: `${heightPercent}%` }}
                      title={`${day.date}: ${day.count} engaged reads (${day.skimmed || 0} skims, ${day.flicked || 0} dismissals)`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 truncate max-w-[45px]">
                    {day.date.split(",")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Breakdown (Dual-Metric: Deeply Read vs Triaged) */}
        <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <PieChart className="w-4 h-4 text-purple-400" />
                <span>Topic & Category Distribution</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Dual-metric: Digested reading vs triage volume
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> Digested
              </span>
              <span className="flex items-center gap-1 text-slate-500">
                <span className="w-2 h-2 rounded-sm bg-purple-900/60 inline-block" /> Triaged
              </span>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            {categories.length === 0 ? (
              <p className="text-xs text-slate-500">No category data available.</p>
            ) : (
              categories.map((cat) => {
                const triagedPercent = cat.total > 0 ? Math.round((cat.read / cat.total) * 100) : 0;
                const engagedPercent =
                  cat.total > 0 ? Math.round(((cat.engaged || 0) / cat.total) * 100) : 0;

                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-300">{cat.category}</span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        <span className="text-emerald-400 font-semibold">{cat.engaged || 0}</span>{" "}
                        deep / <span className="text-slate-400">{cat.read}</span> triaged (
                        {cat.total} total)
                      </span>
                    </div>
                    {/* Dual Progress Bar: Outer track represents triaged %, inner fill represents deeply read % */}
                    <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden relative">
                      <div
                        className="bg-purple-900/50 h-full rounded-full absolute left-0 top-0 transition-all"
                        style={{ width: `${triagedPercent}%` }}
                        title={`${cat.category}: ${cat.read} triaged (${triagedPercent}%)`}
                      />
                      <div
                        className="bg-emerald-500 h-full rounded-full absolute left-0 top-0 transition-all"
                        style={{ width: `${engagedPercent}%` }}
                        title={`${cat.category}: ${cat.engaged || 0} deeply read (${engagedPercent}%)`}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Additional Deep Research Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="w-4 h-4 text-purple-400" />
            <div>
              <span className="text-xs text-slate-300 block font-medium">
                Research Inbox Staging
              </span>
              <span className="text-[10px] text-slate-500">Longform URLs awaiting review</span>
            </div>
          </div>
          <span className="text-sm font-bold text-white font-mono">
            {summary.researchInboxCount}
          </span>
        </div>

        <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderPlus className="w-4 h-4 text-blue-400" />
            <div>
              <span className="text-xs text-slate-300 block font-medium">
                Google Docs Briefings
              </span>
              <span className="text-[10px] text-slate-500">Exported research briefs</span>
            </div>
          </div>
          <span className="text-sm font-bold text-white font-mono">{summary.gdocsSaved}</span>
        </div>

        <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <div>
              <span className="text-xs text-slate-300 block font-medium">
                Active Curation Boards
              </span>
              <span className="text-[10px] text-slate-500">Synthesized topic workspaces</span>
            </div>
          </div>
          <span className="text-sm font-bold text-white font-mono">{summary.boardsCount}</span>
        </div>
      </div>

      {/* Stats for Nerds — Engine & Database Storage Telemetry */}
      {data.nerdStats && (
        <div className="bg-slate-950/70 rounded-xl border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5 font-mono">
                  <span>STATS_FOR_NERDS</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-sans">
                    SQLite WAL
                  </span>
                </h3>
                <p className="text-[10px] text-slate-500">
                  Local storage, engine telemetry, and engagement depth
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-emerald-400 font-mono">
                {data.nerdStats.totalDiskMb} MB
              </span>
              <p className="text-[10px] text-slate-500">Total Disk Footprint</p>
            </div>
          </div>

          {/* Disk & Page Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
                <Database className="w-3.5 h-3.5 text-blue-400" />
                <span>DB File</span>
              </div>
              <span className="text-xs font-bold text-slate-200 font-mono">
                {(data.nerdStats.dbSizeBytes / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>

            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
                <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                <span>WAL File</span>
              </div>
              <span className="text-xs font-bold text-slate-200 font-mono">
                {(data.nerdStats.walSizeBytes / 1024).toFixed(1)} KB
              </span>
            </div>

            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
                <Cpu className="w-3.5 h-3.5 text-amber-400" />
                <span>Page Count</span>
              </div>
              <span className="text-xs font-bold text-slate-200 font-mono">
                {data.nerdStats.pageCount.toLocaleString()} ({data.nerdStats.pageSize}B)
              </span>
            </div>

            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>FTS5 Search Index</span>
              </div>
              <span className="text-xs font-bold text-slate-200 font-mono">
                {data.nerdStats.tableCounts.ftsIndexed.toLocaleString()} docs
              </span>
            </div>
          </div>

          {/* Sync Engine Operational Telemetry */}
          {data.nerdStats.syncTelemetry && (
            <div className="bg-slate-900/60 p-3.5 rounded-lg border border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-bold text-slate-200 font-mono text-[11px]">
                    SYNC_ENGINE_TELEMETRY
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-sans">
                    Adaptive Dual-Pool
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  {data.nerdStats.syncTelemetry.healthyCount} /{" "}
                  {data.nerdStats.syncTelemetry.totalFeeds} Healthy
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-[11px]">
                <div className="bg-slate-950/40 p-2.5 rounded border border-slate-800/50">
                  <span className="text-slate-500 text-[10px] block">Last Sweep</span>
                  <span className="font-mono text-slate-200 font-semibold text-xs">
                    {data.nerdStats.syncTelemetry.lastSyncAt
                      ? new Date(data.nerdStats.syncTelemetry.lastSyncAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Pending"}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {(data.nerdStats.syncTelemetry.durationMs / 1000).toFixed(1)}s duration
                  </span>
                </div>

                <div className="bg-slate-950/40 p-2.5 rounded border border-slate-800/50">
                  <span className="text-slate-500 text-[10px] block">Pipeline Ingestion</span>
                  <span className="font-mono text-slate-200 font-semibold text-xs">
                    {data.nerdStats.syncTelemetry.newArticlesTotal} new articles
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {data.nerdStats.syncTelemetry.errorCount} errors
                  </span>
                </div>

                <div className="bg-slate-950/40 p-2.5 rounded border border-slate-800/50">
                  <span className="text-slate-500 text-[10px] block">Adaptive Filter</span>
                  <span className="font-mono text-slate-200 font-semibold text-xs">
                    {data.nerdStats.syncTelemetry.standardFeedsChecked +
                      data.nerdStats.syncTelemetry.youtubeFeedsChecked}{" "}
                    Checked
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {data.nerdStats.syncTelemetry.adaptiveSkippedCount} fresh / skipped
                  </span>
                </div>

                <div className="bg-slate-950/40 p-2.5 rounded border border-slate-800/50">
                  <span className="text-slate-500 text-[10px] block">Pool Split</span>
                  <span className="font-mono text-slate-200 font-semibold text-xs">
                    {data.nerdStats.syncTelemetry.standardFeedsChecked} RSS ·{" "}
                    {data.nerdStats.syncTelemetry.youtubeFeedsChecked} YT
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Next:{" "}
                    {data.nerdStats.syncTelemetry.nextScheduledAt
                      ? new Date(data.nerdStats.syncTelemetry.nextScheduledAt).toLocaleTimeString(
                          [],
                          { hour: "2-digit", minute: "2-digit" }
                        )
                      : "in ~30m"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Dual Feed Analytics: Most Read Feeds (Grounded in Time) vs Highest Ingestion Volume */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Table 1: Most Engaged Feeds (Ranked by time and deep reads) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Most Engaged Feeds</span>
                </span>
                <span className="text-[10px] text-slate-500">Engaged Time · Deep / Triaged</span>
              </div>
              <div className="divide-y divide-slate-800/60 border border-slate-800/80 rounded-lg overflow-hidden bg-slate-900/40">
                {data.nerdStats.mostReadFeeds && data.nerdStats.mostReadFeeds.length > 0 ? (
                  data.nerdStats.mostReadFeeds.map((f, idx) => {
                    const minutesSpent = Math.round((f.engagedSeconds || 0) / 60);
                    return (
                      <div
                        key={idx}
                        className="px-3 py-2 flex items-center justify-between text-xs hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <span className="text-[10px] font-mono text-emerald-400 w-4">
                            #{idx + 1}
                          </span>
                          <span className="text-slate-300 font-medium truncate">{f.title}</span>
                          {f.category && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-slate-400 shrink-0">
                              {f.category}
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono text-emerald-400 text-xs block">
                            {minutesSpent > 0 ? `${minutesSpent}m spent` : `<1m spent`}
                          </span>
                          <span className="text-slate-500 text-[10px] block font-mono">
                            {f.engagedCount || 0} deep / {f.readCount} triaged
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3 text-center text-xs text-slate-500">
                    No read items recorded yet
                  </div>
                )}
              </div>
            </div>

            {/* Table 2: Highest Ingestion Volume (Syndication Noise) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span>Highest Ingestion Volume</span>
                </span>
                <span className="text-[10px] text-slate-500">Total Items</span>
              </div>
              <div className="divide-y divide-slate-800/60 border border-slate-800/80 rounded-lg overflow-hidden bg-slate-900/40">
                {(data.nerdStats.highestVolumeFeeds || data.nerdStats.topFeeds || []).map(
                  (f, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2 flex items-center justify-between text-xs hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="text-[10px] font-mono text-slate-500 w-4">#{idx + 1}</span>
                        <span className="text-slate-300 font-medium truncate">{f.title}</span>
                        {f.category && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-slate-400 shrink-0">
                            {f.category}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-slate-400 text-xs shrink-0">
                        {f.itemCount}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
