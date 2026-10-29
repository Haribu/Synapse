"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  ExternalLink,
  CheckCircle,
  RefreshCw,
  Sparkles,
  Zap,
  Trash2,
  AlertTriangle,
  Check,
} from "lucide-react";
import { decodeHtmlEntities } from "@/lib/utils/decode";
import { cleanArticleHtml } from "@/lib/utils/clean-html";
import { marked } from "marked";
import { AccessibilitySettings } from "@/lib/utils/accessibility";
import { isSponsoredContent } from "@/lib/utils/sponsored";
import { useDwellTracker } from "@/hooks/useDwellTracker";

import { ReaderTopBar } from "./reader/ReaderTopBar";
import { ReaderNotesDrawer } from "./reader/ReaderNotesDrawer";
import { ReaderPostReadCard } from "./reader/ReaderPostReadCard";
import { ReaderLinkMenu, LinkMenuState } from "./reader/ReaderLinkMenu";
import { ReaderLightbox, LightboxImage } from "./reader/ReaderLightbox";
import { ReaderMobileThumbBar } from "./reader/ReaderMobileThumbBar";

export interface ReaderItem {
  id: string;
  title: string;
  url: string;
  author?: string;
  snippet?: string;
  fullContentHtml?: string;
  fullContentMarkdown?: string;
  isFullFetched?: boolean;
  publishedAt?: string;
  feedId?: string;
  feedTitle?: string;
  feedCategory?: string;
  feedEditorialType?: string;
  mediaType?: "article" | "video" | "podcast";
  videoId?: string;
  isRead?: boolean;
  isStarred?: boolean;
  isWork?: boolean;
  userNotes?: string;
  tags?: string;
}

export interface ReaderViewProps {
  item: ReaderItem | null;
  onToggleRead: (id: string, isRead: boolean) => void;
  onToggleStar: (id: string, isStarred: boolean) => void;
  onToggleWork?: (id: string, isWork: boolean) => void;
  onBack?: () => void;
  onItemUpdated?: (updated: ReaderItem) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onOpenFeedback?: () => void;
  a11ySettings?: AccessibilitySettings;
  onOpenA11y?: () => void;
  onDelete?: () => void;
  onSelectFeed?: (feedId: string) => void;
  onSelectCategory?: (category: string) => void;
  onToggleFocusReader?: () => void;
  isFocusReader?: boolean;
  workDigestName?: string;
}

export function ReaderView({
  item,
  onToggleRead,
  onToggleStar,
  onToggleWork,
  onBack,
  onItemUpdated,
  onPrev,
  onNext,
  onOpenFeedback,
  a11ySettings,
  onOpenA11y,
  onDelete,
  onSelectFeed,
  onSelectCategory,
  onToggleFocusReader,
  isFocusReader,
  workDigestName,
}: ReaderViewProps) {
  const [hydrating, setHydrating] = useState(false);
  const [syncingObsidian, setSyncingObsidian] = useState(false);
  const [savingToResearch, setSavingToResearch] = useState(false);
  const [researchSuccess, setResearchSuccess] = useState(false);
  const [exportingGDocs, setExportingGDocs] = useState(false);
  const [obsidianSuccess, setObsidianSuccess] = useState<string | null>(null);
  const [, setGDocsUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  // Research notes and tags state
  const [userNotes, setUserNotes] = useState<string>(item?.userNotes || "");
  const [tags, setTags] = useState<string[]>(() => {
    if (!item?.tags) return [];
    return item.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  });
  const [tagInput, setTagInput] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSavedToast, setNotesSavedToast] = useState(false);
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);

  // Auto-hydrate prompt state
  const [autoHydratePrompt, setAutoHydratePrompt] = useState<{
    feedId: string;
    feedTitle: string;
  } | null>(null);
  const [enablingAutoHydrate, setEnablingAutoHydrate] = useState(false);
  const [autoHydrateSuccess, setAutoHydrateSuccess] = useState<string | null>(null);
  const [lightboxImg, setLightboxImg] = useState<LightboxImage | null>(null);

  // Responsive full content state
  const [currentFullHtml, setCurrentFullHtml] = useState<string | null>(
    item?.fullContentHtml || null
  );
  const [currentIsFullFetched, setCurrentIsFullFetched] = useState<boolean>(
    item?.isFullFetched || false
  );

  // Reading progress & auto-hide mobile chrome state
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [mobileBarsHidden, setMobileBarsHidden] = useState<boolean>(false);
  const lastScrollTopRef = useRef<number>(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtTopAtTouchStart = useRef<boolean>(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevItemIdRef = useRef<string | null>(null);

  // Link context menu / long-press state
  const [linkMenu, setLinkMenu] = useState<LinkMenuState | null>(null);

  // Swipe gesture navigation refs
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Track dwell time and classify engagement (<10s flick, 10-29s skim, >=30s read)
  useDwellTracker(item);

  // Sync state when item changes
  useEffect(() => {
    setCurrentFullHtml(item?.fullContentHtml || null);
    setCurrentIsFullFetched(item?.isFullFetched || false);
    setHydrateError(null);
    setUserNotes(item?.userNotes || "");
    if (item?.tags) {
      setTags(
        item.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      );
    } else {
      setTags([]);
    }
    if (prevItemIdRef.current !== item?.id) {
      setMobileBarsHidden(false);
      setScrollProgress(0);
      lastScrollTopRef.current = 0;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
      prevItemIdRef.current = item?.id || null;
    }
  }, [item?.id, item?.fullContentHtml, item?.isFullFetched, item?.userNotes, item?.tags]);

  const handleReaderScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const top = el.scrollTop;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll > 20) {
      setScrollProgress(Math.min(100, Math.max(0, (top / maxScroll) * 100)));
    } else {
      setScrollProgress(0);
    }

    const delta = top - lastScrollTopRef.current;
    if (top < 48) {
      setMobileBarsHidden(false);
    } else if (delta > 12) {
      setMobileBarsHidden(true);
    } else if (delta < -10) {
      setMobileBarsHidden(false);
    }
    lastScrollTopRef.current = top;
  };

  // Auto-hydrate empty Research Inbox articles when selected
  useEffect(() => {
    if (
      item &&
      !item.feedId &&
      (!item.fullContentHtml || item.fullContentHtml.length < 50) &&
      !hydrating &&
      !hydrateError
    ) {
      handleHydrate();
    }
  }, [item?.id]);

  // Handle image clicks inside article body for lightbox preview
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName && target.tagName.toLowerCase() === "img") {
      const img = target as HTMLImageElement;
      if (img.src && !img.src.startsWith("data:")) {
        e.preventDefault();
        setLightboxImg({ src: img.src, alt: img.alt || "Article image" });
      }
    }
  };

  // Handle link contextmenu and touch long-press inside article body
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    let touchTimer: NodeJS.Timeout | null = null;
    let touchStartX = 0;
    let touchStartY = 0;

    const cancelTouch = () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      const targetElement = e.target as HTMLElement;
      // Never trigger link menu on images (users tap to zoom/lightbox or right-click to copy image)
      if (targetElement.closest("img")) return;

      const anchor = targetElement.closest("a");
      if (anchor && anchor.href && /^https?:\/\//i.test(anchor.href)) {
        e.preventDefault();
        setLinkMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          url: anchor.href,
          text: anchor.innerText?.trim() || anchor.href,
        });
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      cancelTouch();
      const targetElement = e.target as HTMLElement;
      // Never trigger link menu on images
      if (targetElement.closest("img")) return;

      const anchor = targetElement.closest("a");
      if (anchor && anchor.href && /^https?:\/\//i.test(anchor.href) && e.touches[0]) {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;

        // Intentional long-press: 750ms delay so casual scrolling / reading pauses never trigger the menu
        touchTimer = setTimeout(() => {
          setLinkMenu({
            visible: true,
            x: touch.clientX,
            y: touch.clientY,
            url: anchor.href,
            text: anchor.innerText?.trim() || anchor.href,
          });
          touchTimer = null;
        }, 750);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchTimer || !e.touches[0]) return;
      const touch = e.touches[0];
      const moveX = Math.abs(touch.clientX - touchStartX);
      const moveY = Math.abs(touch.clientY - touchStartY);

      // If finger moves more than 8px, it is a scroll gesture — cancel immediately
      if (moveX > 8 || moveY > 8) {
        cancelTouch();
      }
    };

    const handleTouchEnd = () => {
      cancelTouch();
    };

    const handleScroll = () => {
      cancelTouch();
      setLinkMenu(null);
    };

    const handleImageError = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName && target.tagName.toLowerCase() === "img") {
        const img = target as HTMLImageElement;
        if (img.dataset.hasFailed) return;
        img.dataset.hasFailed = "true";

        const wrapper = document.createElement("div");
        wrapper.className =
          "my-4 p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs select-none";

        const infoDiv = document.createElement("div");
        infoDiv.className = "flex items-center gap-2.5 min-w-0";
        infoDiv.innerHTML = `
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div class="truncate">
            <span class="font-medium text-slate-800 dark:text-slate-200 block truncate">${img.alt ? img.alt : "Embedded article image"}</span>
            <span class="text-slate-500 dark:text-slate-400 text-[11px] block truncate">Image blocked or unavailable from origin host</span>
          </div>
        `;

        const link = document.createElement("a");
        link.href = img.src;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className =
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 font-medium transition-colors shrink-0 shadow-sm";
        link.innerHTML = `<span>Open original image</span> <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>`;

        wrapper.appendChild(infoDiv);
        wrapper.appendChild(link);
        img.replaceWith(wrapper);
      }
    };

    el.addEventListener("error", handleImageError, true);
    el.addEventListener("contextmenu", handleContextMenu);
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("touchcancel", handleTouchEnd);

    const scrollContainer = scrollContainerRef.current;
    scrollContainer?.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      cancelTouch();
      el.removeEventListener("error", handleImageError, true);
      el.removeEventListener("contextmenu", handleContextMenu);
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
      scrollContainer?.removeEventListener("scroll", handleScroll);
    };
  }, [item]);

  if (!item) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 bg-[var(--background)] p-8 transition-colors">
        <FileText className="w-12 h-12 stroke-[1.2] mb-3 text-slate-300 dark:text-slate-700" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          No article selected
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          Select an article from the list or press ⌘K to jump
        </p>
      </div>
    );
  }

  // Hydrate full page
  const handleHydrate = async () => {
    if (!item) return;
    setHydrating(true);
    setHydrateError(null);
    try {
      const res = await fetch(`/api/items/${item.id}/hydrate`, { method: "POST" });
      const data = await res.json();
      const extractedHtml = data.contentHtml || data.item?.fullContentHtml;
      if (extractedHtml) {
        setCurrentFullHtml(extractedHtml);
        setCurrentIsFullFetched(true);
        if (data.feedId && data.feedTitle && !data.autoFullFetch) {
          setAutoHydratePrompt({ feedId: data.feedId, feedTitle: data.feedTitle });
        }
        if (onItemUpdated) {
          onItemUpdated({
            ...item,
            fullContentHtml: extractedHtml,
            fullContentMarkdown: data.contentMarkdown || data.item?.fullContentMarkdown,
            isFullFetched: true,
          });
        }
      } else {
        setHydrateError(data.error || "Could not extract full content from this URL");
      }
    } catch (err: any) {
      console.error("Hydration failed", err);
      setHydrateError(err.message || "Network error fetching article");
    } finally {
      setHydrating(false);
    }
  };

  // Enable auto-hydration for the source feed
  const handleEnableAutoHydrate = async () => {
    if (!autoHydratePrompt) return;
    setEnablingAutoHydrate(true);
    try {
      await fetch(`/api/feeds/${autoHydratePrompt.feedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFullFetch: true }),
      });
      setAutoHydrateSuccess(`Always auto-hydrating ${autoHydratePrompt.feedTitle}`);
      setAutoHydratePrompt(null);
      setTimeout(() => setAutoHydrateSuccess(null), 4000);
    } catch (err) {
      console.error("Failed to enable auto-hydrate", err);
    } finally {
      setEnablingAutoHydrate(false);
    }
  };

  // Save to Research Inbox
  const handleSaveToResearch = async () => {
    if (!item) return;
    setSavingToResearch(true);
    try {
      const res = await fetch("/api/reading-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: item.url,
          title: item.title,
          sourceFeedItemId: item.id,
          sourceContext: item.feedTitle,
          fullContentHtml: item.fullContentHtml || currentFullHtml || undefined,
          fullContentMarkdown: item.fullContentMarkdown || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResearchSuccess(true);
        setTimeout(() => setResearchSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Save to Research Inbox failed", err);
    } finally {
      setSavingToResearch(false);
    }
  };

  // Toggle Work Flag
  const handleToggleWork = async () => {
    if (!item) return;
    const nextWorkState = !item.isWork;
    if (onToggleWork) {
      onToggleWork(item.id, nextWorkState);
    } else {
      try {
        await fetch("/api/items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, isWork: nextWorkState }),
        });
        if (onItemUpdated) {
          onItemUpdated({ ...item, isWork: nextWorkState });
        }
      } catch (err) {
        console.error("Failed to toggle work flag", err);
      }
    }
  };

  // Sync to Obsidian
  const handleSaveObsidian = async () => {
    if (!item) return;
    setSyncingObsidian(true);
    setObsidianSuccess(null);
    try {
      const res = await fetch(`/api/items/${item.id}/obsidian`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userNotes,
          tags,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setObsidianSuccess(data.filePath);
        setTimeout(() => setObsidianSuccess(null), 4000);
      } else if (data.code === "VAULT_NOT_MOUNTED") {
        // Vault unmounted: trigger direct browser download
        const a = document.createElement("a");
        a.href = `/api/items/${item.id}/markdown`;
        a.download = `${(item.title || "article").slice(0, 50)}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setObsidianSuccess("Vault unmounted: Downloaded Markdown note directly to browser.");
        setTimeout(() => setObsidianSuccess(null), 4000);
      } else {
        setObsidianSuccess(`Export failed: ${data.error || "Unknown error"}`);
        setTimeout(() => setObsidianSuccess(null), 4000);
      }
    } catch (err) {
      console.error("Obsidian sync failed", err);
    } finally {
      setSyncingObsidian(false);
    }
  };

  // Persist User Notes and Tags
  const handlePersistNotesAndTags = async (nextNotes: string, nextTags: string[]) => {
    if (!item) return;
    setIsSavingNotes(true);
    try {
      const tagsString = nextTags.join(",");
      await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          userNotes: nextNotes,
          tags: tagsString,
        }),
      });
      setNotesSavedToast(true);
      setTimeout(() => setNotesSavedToast(false), 2000);
      if (onItemUpdated) {
        onItemUpdated({
          ...item,
          userNotes: nextNotes,
          tags: tagsString,
        });
      }
    } catch (err) {
      console.error("Failed to save research notes/tags", err);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleAddTag = (tagToAdd: string) => {
    const clean = tagToAdd
      .trim()
      .replace(/^#/, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");
    if (!clean || tags.includes(clean)) return;
    const nextTags = [...tags, clean];
    setTags(nextTags);
    setTagInput("");
    handlePersistNotesAndTags(userNotes, nextTags);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const nextTags = tags.filter((t) => t !== tagToRemove);
    setTags(nextTags);
    handlePersistNotesAndTags(userNotes, nextTags);
  };

  // Export to Google Docs
  const handleExportGoogleDocs = async () => {
    setExportingGDocs(true);
    try {
      const res = await fetch(`/api/items/${item.id}/google-docs`, { method: "POST" });
      const data = await res.json();
      if (data.documentUrl) {
        setGDocsUrl(data.documentUrl);
        window.open(data.documentUrl, "_blank");
      }
    } catch (err) {
      console.error("Google Docs export failed", err);
    } finally {
      setExportingGDocs(false);
    }
  };

  // Web Share or Clipboard
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          url: item.url,
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fallback to copy
      }
    }

    navigator.clipboard.writeText(item.url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Save Link to Reading List
  const handleSaveLinkToReadingList = async (url: string, contextText: string) => {
    try {
      await fetch("/api/reading-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          sourceFeedItemId: item.id,
          sourceContext: contextText,
        }),
      });
      setLinkMenu(null);
    } catch (err) {
      console.error("Failed to save to reading list", err);
    }
  };

  const effectiveVideoId =
    item.videoId ||
    item.url?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] ||
    (currentFullHtml || "").match(
      /(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    )?.[1];

  let displayHtml = cleanArticleHtml(currentFullHtml || item.snippet || "", item.title);
  if ((!displayHtml || displayHtml.trim().length < 50) && item.fullContentMarkdown) {
    try {
      displayHtml = cleanArticleHtml(marked.parse(item.fullContentMarkdown) as string, item.title);
    } catch {}
  }
  if (effectiveVideoId && displayHtml) {
    const escapedVid = effectiveVideoId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    displayHtml = displayHtml
      .replace(
        new RegExp(
          `<div[^>]*class=["'][^"']*ars-video-container[^"']*["'][^>]*>[\\s\\S]*?<iframe[^>]*${escapedVid}[^>]*>[\\s\\S]*?<\\/iframe>\\s*<\\/div>\\s*<\\/div>`,
          "gi"
        ),
        ""
      )
      .replace(
        new RegExp(
          `(?:<div[^>]*>\\s*)?<iframe[^>]*${escapedVid}[^>]*>[\\s\\S]*?<\\/iframe>(?:\\s*<\\/div>)?`,
          "gi"
        ),
        ""
      );
  }
  const isSnippetOnly = !currentIsFullFetched && (!currentFullHtml || currentFullHtml.length < 500);

  // Estimate reading time from plain text word count (~230 wpm)
  const plainWordCount = displayHtml
    ? displayHtml
        .replace(/<[^>]+>/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length
    : 0;
  const readingMinutes = Math.max(1, Math.round(plainWordCount / 230));

  // Accessibility & Typography formatting
  const fontClass =
    a11ySettings?.fontFamily === "dyslexic"
      ? "font-dyslexic"
      : a11ySettings?.fontFamily === "serif"
        ? "font-serif-reader"
        : a11ySettings?.fontFamily === "mono"
          ? "font-mono-reader"
          : "font-sans-reader";

  const columnWidthClass =
    a11ySettings?.columnWidth === "narrow"
      ? "max-w-xl"
      : a11ySettings?.columnWidth === "wide"
        ? "max-w-5xl"
        : "max-w-3xl";

  const readerStyle: React.CSSProperties = {
    fontSize:
      a11ySettings?.fontSize === "sm"
        ? "1rem"
        : a11ySettings?.fontSize === "base"
          ? "1.125rem"
          : a11ySettings?.fontSize === "lg"
            ? "1.3125rem"
            : a11ySettings?.fontSize === "xl"
              ? "1.5rem"
              : "1.125rem",
    lineHeight:
      a11ySettings?.lineSpacing === "normal"
        ? "1.6"
        : a11ySettings?.lineSpacing === "spacious"
          ? "2.2"
          : "1.85",
    letterSpacing:
      a11ySettings?.letterSpacing === "wide"
        ? "0.05em"
        : a11ySettings?.letterSpacing === "wider"
          ? "0.1em"
          : "normal",
  };

  // Swipe left/right and swipe down gesture navigation
  const handleSwipeTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isAtTopAtTouchStart.current = (scrollContainerRef.current?.scrollTop || 0) <= 5;
    }
  };

  const handleSwipeTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchEndX - touchStartX.current;
    const diffY = touchEndY - touchStartY.current;

    // Check for swipe down to return to feed list (only if started at top of article)
    if (isAtTopAtTouchStart.current && diffY > 60 && diffY > Math.abs(diffX) * 1.5) {
      if (onBack) {
        onBack();
        touchStartX.current = null;
        touchStartY.current = null;
        return;
      }
    }

    // Responsive swipe threshold 40px, horizontal intent > 1.2x vertical intent
    if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY) * 1.2) {
      if (diffX < 0) {
        // Swiped Left -> Forward (Next article)
        if (onNext) {
          if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
          onNext();
        }
      } else {
        // Swiped Right -> Backwards (Previous article or back to list)
        if (onPrev) {
          if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
          onPrev();
        } else if (onBack) {
          onBack();
        }
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleDeleteCurrentFeed = item.feedId
    ? async () => {
        if (
          window.confirm(
            `Permanently delete the feed "${item.feedTitle || "this feed"}" and all its articles?`
          )
        ) {
          await fetch(`/api/feeds/${item.feedId}`, { method: "DELETE" });
          if (onBack) onBack();
          if (onItemUpdated) window.location.reload();
        }
      }
    : undefined;

  return (
    <div
      onTouchStart={handleSwipeTouchStart}
      onTouchEnd={handleSwipeTouchEnd}
      className="flex-1 flex flex-col h-full bg-[var(--background)] overflow-hidden relative transition-colors touch-pan-y"
    >
      {/* Editorial Reading Progress Hairline */}
      <div className="h-0.5 w-full bg-transparent z-30 shrink-0 overflow-hidden">
        <div
          className="h-full bg-blue-600 dark:bg-blue-400 transition-[width] duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Top Action Bar */}
      <ReaderTopBar
        item={item}
        onBack={onBack}
        onToggleRead={onToggleRead}
        onToggleStar={onToggleStar}
        onToggleWork={handleToggleWork}
        onOpenFeedback={onOpenFeedback}
        onOpenA11y={onOpenA11y}
        onDelete={onDelete}
        onDeleteFeed={handleDeleteCurrentFeed}
        hydrating={hydrating}
        currentIsFullFetched={currentIsFullFetched}
        handleHydrate={handleHydrate}
        notesDrawerOpen={notesDrawerOpen}
        setNotesDrawerOpen={setNotesDrawerOpen}
        hasNotesOrTags={userNotes.trim().length > 0 || tags.length > 0}
        savingToResearch={savingToResearch}
        researchSuccess={researchSuccess}
        handleSaveToResearch={handleSaveToResearch}
        syncingObsidian={syncingObsidian}
        handleSaveObsidian={handleSaveObsidian}
        exportingGDocs={exportingGDocs}
        handleExportGoogleDocs={handleExportGoogleDocs}
        copiedLink={copiedLink}
        handleShare={handleShare}
        onToggleFocusReader={onToggleFocusReader}
        isFocusReader={isFocusReader}
        hiddenOnScroll={mobileBarsHidden}
        workDigestName={workDigestName}
      />

      {/* Obsidian Notification Toast */}
      {obsidianSuccess && (
        <div className="absolute top-16 right-6 z-20 bg-purple-100 dark:bg-purple-950 border border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200 px-4 py-2.5 rounded-xl text-xs shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <span>Saved to Obsidian: {obsidianSuccess.split("/").pop()}</span>
        </div>
      )}

      {/* Hydrate Error Toast */}
      {hydrateError && (
        <div className="absolute top-16 left-6 right-6 md:left-auto md:right-6 md:w-96 z-20 bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 px-4 py-3 rounded-xl text-xs shadow-xl flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-2">
          <span>{hydrateError}</span>
          <button
            onClick={() => setHydrateError(null)}
            className="text-amber-700 dark:text-amber-400 font-bold p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Split Workspace: Article Column + Docked Notes Drawer (on xl desktop) */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Article Body */}
        <div
          ref={scrollContainerRef}
          onScroll={handleReaderScroll}
          className={`flex-1 overflow-y-auto overflow-x-hidden touch-pan-y px-4 sm:px-6 md:px-10 py-6 md:py-10 ${columnWidthClass} mx-auto w-full max-w-full pb-28 md:pb-12`}
        >
          {/* Auto-Hydrate Confirmation Banner */}
          {autoHydratePrompt && (
            <div className="mb-6 p-3.5 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-slate-800 dark:text-slate-200">
                  Always auto-hydrate future articles from{" "}
                  <strong>{autoHydratePrompt.feedTitle}</strong>?
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleEnableAutoHydrate}
                  disabled={enablingAutoHydrate}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-sm transition-all"
                >
                  {enablingAutoHydrate ? "Saving..." : "Always Auto-Hydrate"}
                </button>
                <button
                  onClick={() => setAutoHydratePrompt(null)}
                  className="px-2.5 py-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Success toast for auto-hydrate */}
          {autoHydrateSuccess && (
            <div className="mb-6 p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{autoHydrateSuccess}</span>
            </div>
          )}

          {/* Header Metadata */}
          <div className="mb-7 pb-6 border-b border-[var(--card-border)]">
            <div className="flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 mb-2.5 flex-wrap">
              {item.feedId && onSelectFeed ? (
                <button
                  onClick={() => onSelectFeed(item.feedId!)}
                  className="hover:underline font-semibold text-blue-600 dark:text-blue-400"
                  title={`View all articles from ${item.feedTitle || "this feed"}`}
                >
                  {item.feedTitle || "Feed"}
                </button>
              ) : (
                <span>{item.feedTitle || "Feed"}</span>
              )}
              {item.feedEditorialType === "vendor" && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                  title="Vendor blog — commercial / promotional bias"
                >
                  Vendor
                </span>
              )}
              {item.feedEditorialType === "official" && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30"
                  title="Official standard or government agency"
                >
                  Official
                </span>
              )}
              {item.feedEditorialType === "community" && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                  title="Community / open organization"
                >
                  Community
                </span>
              )}
              {item.feedEditorialType === "news" && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30"
                  title="News publication"
                >
                  News
                </span>
              )}
              {item.feedCategory && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  {onSelectCategory ? (
                    <button
                      onClick={() => onSelectCategory(item.feedCategory!)}
                      className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:underline"
                      title={`View category "${item.feedCategory}"`}
                    >
                      {item.feedCategory}
                    </button>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">{item.feedCategory}</span>
                  )}
                </>
              )}
              {item.publishedAt && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <span className="text-slate-400 dark:text-slate-500">
                    {new Date(item.publishedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </>
              )}
              {plainWordCount > 30 && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">
                    {readingMinutes} min read
                  </span>
                </>
              )}
            </div>

            <h1
              className={`text-2xl sm:text-3xl md:text-[32px] font-extrabold text-[var(--foreground)] tracking-tight leading-[1.2] mb-3 ${fontClass}`}
            >
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors decoration-2 underline-offset-4 group inline"
                title="Open source article"
              >
                {decodeHtmlEntities(item.title)}
                <ExternalLink
                  className="inline-block w-4 h-4 ml-2 opacity-0 group-hover:opacity-70 transition-opacity align-baseline"
                  aria-hidden="true"
                />
              </a>
            </h1>

            {item.author && (
              <div className="text-xs text-slate-500 dark:text-slate-400">By {item.author}</div>
            )}

            {/* Vendor Publication Notice Banner */}
            {item.feedEditorialType === "vendor" && (
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold">Vendor Publication Notice:</span> This article is
                  published by a commercial vendor (
                  <strong className="font-semibold">{item.feedTitle || "vendor"}</strong>) and may
                  contain product marketing, promotional slant, or commercial bias.
                </div>
              </div>
            )}

            {/* Sponsored Article Notice Banner */}
            {isSponsoredContent(item) && (
              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold">Sponsored Content Notice:</span> This article contains
                  sponsored, paid, or promotional partner content.
                </div>
              </div>
            )}
          </div>

          {/* Embedded Video Player if YouTube */}
          {effectiveVideoId && (
            <div className="mb-8 rounded-xl overflow-hidden aspect-video bg-black shadow-2xl border border-slate-200 dark:border-slate-800">
              <iframe
                src={`https://www.youtube.com/embed/${effectiveVideoId}?autoplay=0&rel=0`}
                title={item.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          )}

          {/* Snippet Notice & Full Page Call-To-Action */}
          {isSnippetOnly && (
            <div className="my-6 p-4 md:p-5 rounded-2xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs text-blue-900 dark:text-blue-200">
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Reading Short Feed Snippet</span>
                </div>
                <p className="text-xs text-blue-800/80 dark:text-blue-300/80">
                  This feed only provides a short preview summary. Tap below to fetch the full web
                  article with images.
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleHydrate}
                  disabled={hydrating}
                  className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${hydrating ? "animate-spin" : ""}`} />
                  <span>{hydrating ? "Extracting Article..." : "Extract Full Page"}</span>
                </button>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] min-w-[44px] px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                >
                  <span>Web</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Empty Content State Fallback with 1-click Extraction */}
          {(!displayHtml || displayHtml.trim().length < 50) && (
            <div className="my-8 p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Article content not yet extracted
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {hydrateError ||
                    "This research article has no cached body content. Tap below to fetch and extract the full article."}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleHydrate}
                  disabled={hydrating}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition-all shadow-md flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${hydrating ? "animate-spin" : ""}`} />
                  <span>{hydrating ? "Extracting Article..." : "Fetch Full Content"}</span>
                </button>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <span>Open in Web</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Rendered HTML Content */}
          <div
            ref={contentRef}
            onClick={handleContentClick}
            className={`reader-content text-slate-800 dark:text-slate-200 select-text ${fontClass} ${
              a11ySettings?.hideHeaderImages ? "hide-hero-images" : ""
            }`}
            style={readerStyle}
            dangerouslySetInnerHTML={{ __html: displayHtml }}
          />

          {/* Post-Read Personal Synthesis & Obsidian Frontmatter Tags */}
          <ReaderPostReadCard
            userNotes={userNotes}
            onChangeNotes={setUserNotes}
            onPersistNotes={handlePersistNotesAndTags}
            tags={tags}
            tagInput={tagInput}
            onChangeTagInput={setTagInput}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            isSavingNotes={isSavingNotes}
            notesSavedToast={notesSavedToast}
            syncingObsidian={syncingObsidian}
            onSaveObsidian={handleSaveObsidian}
          />
        </div>

        {/* Slide-Out (Mobile/Tablet) or Inline Docked (Desktop xl) Research Notes & Tags */}
        <ReaderNotesDrawer
          isOpen={notesDrawerOpen}
          onClose={() => setNotesDrawerOpen(false)}
          userNotes={userNotes}
          onChangeNotes={setUserNotes}
          onPersistNotes={handlePersistNotesAndTags}
          tags={tags}
          tagInput={tagInput}
          onChangeTagInput={setTagInput}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          isSavingNotes={isSavingNotes}
          notesSavedToast={notesSavedToast}
          syncingObsidian={syncingObsidian}
          onSaveObsidian={handleSaveObsidian}
        />
      </div>

      {/* Floating Link Context Menu for Newsletters */}
      <ReaderLinkMenu
        linkMenu={linkMenu}
        onClose={() => setLinkMenu(null)}
        onSaveLinkToReadingList={handleSaveLinkToReadingList}
      />

      {/* Mobile One-Handed Bottom Thumb Bar */}
      <ReaderMobileThumbBar
        itemId={item.id}
        isRead={item.isRead}
        isStarred={item.isStarred}
        isWork={item.isWork}
        hasNotesOrTags={userNotes.trim().length > 0 || tags.length > 0}
        onToggleRead={onToggleRead}
        onToggleStar={onToggleStar}
        onToggleWork={handleToggleWork}
        onOpenNotes={() => setNotesDrawerOpen(true)}
        onOpenA11y={onOpenA11y}
        onDelete={onDelete}
        onNext={onNext}
        hiddenOnScroll={mobileBarsHidden}
      />

      {/* Image Lightbox Modal */}
      <ReaderLightbox image={lightboxImg} onClose={() => setLightboxImg(null)} />
    </div>
  );
}
