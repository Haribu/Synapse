export const PURGE_YOUTUBE_SHORTS_SQL = `
  DELETE FROM feed_items
  WHERE (
    url LIKE '%youtube.com/shorts/%'
    OR url LIKE '%youtu.be/shorts/%'
    OR (
      (url LIKE '%youtube.com%' OR url LIKE '%youtu.be%')
      AND (
        url LIKE '%/shorts/%'
        OR lower(title) LIKE '%#shorts%'
        OR lower(title) LIKE '%#ytshorts%'
        OR lower(coalesce(snippet, '')) LIKE '%#shorts%'
        OR lower(coalesce(snippet, '')) LIKE '%#ytshorts%'
        OR lower(coalesce(snippet, '')) LIKE '%youtube.com/shorts/%'
      )
    )
  )
`;

/**
 * Purges YouTube Shorts from the given SQLite database handle.
 * Scoped strictly to YouTube URLs so blog/newsletter articles that embed a YouTube video
 * or contain "#short" substrings in HTML/prose are never deleted and re-ingested as unread.
 */
export function purgeYouTubeShortsFromDb(targetDb: { prepare: (sql: string) => { run: () => { changes: number } } }): number {
  const result = targetDb.prepare(PURGE_YOUTUBE_SHORTS_SQL).run();
  return result.changes;
}
