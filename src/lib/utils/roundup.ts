/**
 * Detects self-syndicated weekly roundups and recap digests that repeat
 * articles already published earlier in the feed backlog.
 */
export function isWeeklyRoundup(item?: {
  title?: string | null;
  snippet?: string | null;
}): boolean {
  if (!item) return false;

  const title = (item.title || "").trim();
  const snippet = (item.snippet || "").trim();

  const titlePatterns = [
    /^a week in (?:security|review|tech|ai|crypto|threats|fintech)\b/i,
    /^(?:the )?week in (?:review|security|tech|brief|summary)\b/i,
    /^weekly (?:roundup|digest|recap|summary|wrap(?:-up)?)\b/i,
    /^weekly security (?:roundup|digest|recap|wrap(?:-up)?)\b/i,
    /^this week in (?:security|tech|ai|review|dev)\b/i,
    /^(?:security|tech|threat) (?:roundup|recap|weekly wrap(?:-up)?):/i,
    /^(?:monthly|quarterly) (?:roundup|recap|wrap(?:-up)?)\b/i,
    /^(?:the )?week at a glance\b/i,
    /^top (?:stories|posts|news) of the week\b/i,
    /^roundup:\s*(?:the )?week in/i,
  ];

  if (titlePatterns.some((pattern) => pattern.test(title))) {
    return true;
  }

  // Snippet patterns
  const snippetPatterns = [
    /\bhere(?:'s| is) (?:our|a) (?:weekly|monthly) (?:roundup|recap|summary) of (?:everything|stories|articles|what)\b/i,
    /\ba quick (?:recap|summary) of (?:the past week|this past week|what happened this week)\b/i,
    /\bin this week's (?:roundup|recap|edition), we look back at\b/i,
  ];

  if (snippetPatterns.some((pattern) => pattern.test(snippet))) {
    return true;
  }

  return false;
}
