"use client";

import React, { useState, useEffect } from "react";
import {
  MessageSquarePlus,
  X,
  Check,
  Loader2,
  Sparkles,
  Clock,
  CheckCircle2,
  Server,
  ExternalLink,
} from "lucide-react";
import { APP_VERSION } from "@/lib/version";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  articleTitle?: string | null;
  articleId?: string | null;
  currentView?: string | null;
}

const CATEGORIES = [
  "Bug",
  "General",
  "Navigation",
  "Mobile UI",
  "Reader",
  "Sync / Feeds",
  "Feature Request",
];

export function FeedbackModal({
  isOpen,
  onClose,
  articleTitle,
  articleId,
  currentView,
}: FeedbackModalProps) {
  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [destination, setDestination] = useState<"local" | "github">("local");
  const [category, setCategory] = useState("Bug");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen && activeTab === "history") {
      loadHistory();
    }
  }, [isOpen, activeTab]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/feedback");
      const data = await res.json();
      if (data.feedback) setHistory(data.feedback);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    setSubmitting(true);
    setError(null);

    const devInfo =
      typeof window !== "undefined"
        ? `${window.innerWidth}x${window.innerHeight} (${/Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "Desktop"})`
        : undefined;

    const repoUrl = process.env.NEXT_PUBLIC_GITHUB_REPO_URL || "https://github.com/Haribu/synapse";

    if (destination === "github") {
      const issueTitle = `[${category}] ${comment.slice(0, 60).replace(/\n/g, " ")}${comment.length > 60 ? "..." : ""}`;
      const issueBody = `### Summary\n${comment.trim()}\n\n### Category\n${category}\n\n### Context\n- **Synapse Version:** v${APP_VERSION}\n- **Current View:** \`${currentView || "Main"}\`${
        articleTitle ? `\n- **Article Context:** ${articleTitle} (\`${articleId || ""}\`)` : ""
      }\n- **Environment:** ${devInfo || "Web"}\n\n---\n*Logged via Synapse Dual-Mode Feedback Modal*`;
      const label =
        category === "Bug" ? "bug" : category === "Feature Request" ? "enhancement" : "feedback";
      const githubUrl = `${repoUrl}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}&labels=${encodeURIComponent(label)}`;

      // 1. Record locally so it appears in History & Status
      try {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            comment: comment.trim(),
            articleTitle: articleTitle || undefined,
            articleId: articleId || undefined,
            currentView: currentView || undefined,
            deviceInfo: devInfo,
            status: "opened_on_github",
            resolutionNotes: `Submitted upstream to GitHub: ${issueTitle}`,
          }),
        });
      } catch {
        // Continue even if local log fails
      }

      // 2. Open GitHub issue in a new tab
      window.open(githubUrl, "_blank", "noopener,noreferrer");

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setComment("");
        setActiveTab("history");
      }, 1200);
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          comment: comment.trim(),
          articleTitle: articleTitle || undefined,
          articleId: articleId || undefined,
          currentView: currentView || undefined,
          deviceInfo: devInfo,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to submit feedback");
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setComment("");
        setActiveTab("history");
      }, 1200);
    } catch (err: any) {
      setError(err.message || "Could not log feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6 sm:zoom-in-95 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="pt-2.5 pb-1 flex justify-center sm:hidden">
          <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="h-14 px-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <MessageSquarePlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Feedback & Ideas</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Captured for next iteration review
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

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 px-5 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("new")}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === "new"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            New Feedback
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "history"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <span>History & Status</span>
          </button>
        </div>

        {activeTab === "history" ? (
          <div className="p-5 max-h-[65vh] overflow-y-auto space-y-3">
            {loadingHistory ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                <span>Loading feedback items...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                <p>No feedback submitted yet.</p>
                <a
                  href={process.env.NEXT_PUBLIC_GITHUB_REPO_URL ? `${process.env.NEXT_PUBLIC_GITHUB_REPO_URL}/issues` : "https://github.com/Haribu/synapse/issues"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline font-semibold text-[11px]"
                >
                  <span>Explore Synapse GitHub Issues</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1 pb-1">
                  <span>Open items & past 7 days closed</span>
                  <a
                    href={process.env.NEXT_PUBLIC_GITHUB_REPO_URL ? `${process.env.NEXT_PUBLIC_GITHUB_REPO_URL}/issues` : "https://github.com/Haribu/synapse/issues"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                  >
                    <span>View GitHub Issues</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                {history.map((item) => {
                  const isDone = item.status === "implemented" || item.status === "resolved";
                  const isGithub = item.status === "opened_on_github";
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800/40">
                            {item.category || "General"}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border shrink-0 ${
                            isDone
                              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50"
                              : isGithub
                                ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/50"
                                : "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50"
                          }`}
                        >
                          {isDone ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>Implemented</span>
                            </>
                          ) : isGithub ? (
                            <>
                              <ExternalLink className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                              <span>On GitHub</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                              <span>Local Open</span>
                            </>
                          )}
                        </span>
                      </div>

                      <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-normal">
                        {item.comment}
                      </p>

                      {item.resolutionNotes && (
                        <p className={`text-[11px] p-2 rounded-lg border mt-1 ${
                          isGithub
                            ? "text-purple-800 dark:text-purple-300/90 bg-purple-50/70 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/40"
                            : "text-emerald-800 dark:text-emerald-300/90 bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40"
                        }`}>
                          <strong>{isGithub ? "Status:" : "Resolution:"}</strong> {item.resolutionNotes}
                        </p>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        ) : (
          /* Form Body */
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Destination Toggle: Local Backlog vs Upstream GitHub Issue */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Feedback Destination
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800/70 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDestination("local")}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    destination === "local"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-slate-700/60"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                  }`}
                >
                  <Server className="w-3.5 h-3.5 text-blue-500" />
                  <span>Local Instance</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDestination("github")}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    destination === "github"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-slate-700/60"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                  }`}
                >
                  <ExternalLink className="w-3.5 h-3.5 text-purple-500" />
                  <span>GitHub Project</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
                {destination === "local"
                  ? "Saves privately to your local SQLite & Obsidian vault to guide your own development."
                  : "Opens a pre-filled issue on the Synapse GitHub project under your own GitHub account."}
              </p>
            </div>

            {/* Category Chips */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Category
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      category === cat
                        ? destination === "github"
                          ? "bg-purple-600 text-white shadow-sm"
                          : "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Context Badge */}
            <div className="px-3 py-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-500 dark:text-slate-400">Context:</span>
              <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono text-[10px]">
                {currentView || "All Articles"}
              </span>
              {articleTitle && (
                <span className="truncate max-w-[260px] text-slate-700 dark:text-slate-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-blue-500 shrink-0" />
                  <strong>{articleTitle}</strong>
                </span>
              )}
            </div>

            {/* Comment Textarea */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {destination === "github" ? "Issue Title & Description" : "Your Feedback or Feature Request"}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  destination === "github"
                    ? "Describe the bug or feature request you would like to report to the Synapse open source project..."
                    : "What feels clunky, what's broken, or what feature do you want next for your local instance?"
                }
                rows={4}
                required
                autoFocus
                className="w-full p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none"
              />
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs">
                {error}
              </div>
            )}

            {/* Footer Actions */}
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || success || !comment.trim()}
                className={`min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md ${
                  success
                    ? "bg-emerald-600 text-white"
                    : destination === "github"
                      ? "bg-purple-600 hover:bg-purple-700 active:scale-95 text-white disabled:opacity-50"
                      : "bg-blue-600 hover:bg-blue-700 active:scale-95 text-white disabled:opacity-50"
                }`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{destination === "github" ? "Opening..." : "Logging..."}</span>
                  </>
                ) : success ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{destination === "github" ? "Opening GitHub Issue..." : "Logged to Local Backlog!"}</span>
                  </>
                ) : destination === "github" ? (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    <span>Open GitHub Issue ↗</span>
                  </>
                ) : (
                  <span>Submit Feedback</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
