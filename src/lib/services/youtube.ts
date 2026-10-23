/**
 * Service to resolve any YouTube URL, handle, or channel ID into an official
 * YouTube RSS feed restricted strictly to Long-Form Videos (excluding Shorts & Live streams).
 *
 * YouTube Playlist Architecture:
 * - Channel ID: UC... (24 chars)
 * - All Uploads Playlist: UU... (24 chars)
 * - Shorts Only: UUSH...
 * - Live Streams: UULV...
 * - Long-Form Videos Only: UULF... (replaces UC or UU with UULF)
 *
 * Example:
 * Channel ID: UC_x5XG1OV2P6uZZ5FSM9Ttw
 * Long-Form Playlist ID: UULF_x5XG1OV2P6uZZ5FSM9Ttw
 * Final Feed: https://www.youtube.com/feeds/videos.xml?playlist_id=UULF_x5XG1OV2P6uZZ5FSM9Ttw
 */

export function toLongFormPlaylistId(id: string): string {
  if (id.startsWith("UULF")) {
    return id;
  }
  if (id.startsWith("UC") || id.startsWith("UU")) {
    return `UULF${id.slice(2)}`;
  }
  return id;
}

export function isYouTubeInput(input: string): boolean {
  const trimmed = input.trim();
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) return true;
  if (/^UULF[a-zA-Z0-9_-]{22}$/.test(trimmed)) return true;
  if (/^UU[a-zA-Z0-9_-]{22}$/.test(trimmed)) return true;
  if (trimmed.startsWith("@")) return true;
  return (
    trimmed.includes("youtube.com") ||
    trimmed.includes("youtu.be") ||
    trimmed.includes("playlist_id=")
  );
}

/**
 * Resolves any YouTube URL, channel link, handle, or channel ID into a long-form
 * video RSS feed URL.
 */
export async function resolveYouTubeLongFormFeed(inputUrl: string): Promise<string> {
  const url = inputUrl.trim();
  if (!url) return url;

  // 1. Direct channel ID (e.g. UC_x5XG1OV2P6uZZ5FSM9Ttw)
  const channelIdMatch = url.match(/^UC([a-zA-Z0-9_-]{22})$/);
  if (channelIdMatch) {
    return `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${channelIdMatch[1]}`;
  }

  // 2. Direct playlist ID (e.g. UULF... or UU...)
  const directPlaylistMatch = url.match(/^UU([a-zA-Z0-9_-]{22})$/);
  if (directPlaylistMatch) {
    return `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${directPlaylistMatch[1]}`;
  }
  if (/^UULF[a-zA-Z0-9_-]{22}$/.test(url)) {
    return `https://www.youtube.com/feeds/videos.xml?playlist_id=${url}`;
  }

  // 3. YouTube RSS URL with playlist_id=UULF... (already long form)
  if (url.includes("playlist_id=UULF")) {
    return url;
  }

  // 4. YouTube RSS URL with playlist_id=UU... (all uploads -> convert to UULF)
  const uploadsPlaylistMatch = url.match(/[?&]playlist_id=UU([a-zA-Z0-9_-]{22})/);
  if (uploadsPlaylistMatch) {
    return `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${uploadsPlaylistMatch[1]}`;
  }

  // 5. YouTube RSS URL with channel_id=UC... (convert to UULF)
  const rssChannelMatch = url.match(/[?&]channel_id=UC([a-zA-Z0-9_-]{22})/);
  if (rssChannelMatch) {
    return `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${rssChannelMatch[1]}`;
  }

  // 6. Direct channel URL: youtube.com/channel/UC...
  const channelUrlMatch = url.match(/\/channel\/UC([a-zA-Z0-9_-]{22})/);
  if (channelUrlMatch) {
    return `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${channelUrlMatch[1]}`;
  }

  // 7. Handle or page URL: @handle, /c/, /user/, watch?v=, youtu.be/
  if (url.startsWith("@") || url.includes("youtube.com") || url.includes("youtu.be")) {
    try {
      let targetFetchUrl = url;
      if (url.startsWith("@")) {
        targetFetchUrl = `https://www.youtube.com/${url}`;
      } else if (!url.startsWith("http://") && !url.startsWith("https://")) {
        targetFetchUrl = `https://${url}`;
      }

      const response = await fetch(targetFetchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const html = await response.text();
        // Prioritize canonical and structured metadata to avoid capturing
        // recommended, related, or sidebar channels (e.g. gridChannelRenderer)
        const patterns = [
          /<link rel="canonical" href="https?:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})"/,
          /<meta property="og:url" content="https?:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})"/,
          /<meta property="al:(?:ios|android|web):url" content="[^"]*?\/channel\/(UC[a-zA-Z0-9_-]{22})"/,
          /<meta itemprop="identifier" content="(UC[a-zA-Z0-9_-]{22})">/,
          /"urlCanonical":\s*"https?:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})"/,
          /"channelProfileMicroformatDetails":\s*\{[^}]*?"url":\s*"https?:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})"/,
          /"externalId":\s*"(UC[a-zA-Z0-9_-]{22})"/,
          /"browseEndpoint":\s*\{"browseId":\s*"(UC[a-zA-Z0-9_-]{22})"/,
        ];

        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            const rawChannelId = match[1];
            return `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${rawChannelId.slice(2)}`;
          }
        }
      }
    } catch {
      // Fallback: if fetch fails, return original URL for standard feed parser to attempt
    }
  }

  return url;
}
