import { describe, expect, it } from "bun:test";
import { toLongFormPlaylistId, isYouTubeInput, resolveYouTubeLongFormFeed } from "./youtube";

describe("YouTube Long-Form Feed Resolver", () => {
  it("converts channel IDs (UC...) to long-form playlist IDs (UULF...)", () => {
    expect(toLongFormPlaylistId("UC_x5XG1OV2P6uZZ5FSM9Ttw")).toBe("UULF_x5XG1OV2P6uZZ5FSM9Ttw");
  });

  it("converts upload playlist IDs (UU...) to long-form playlist IDs (UULF...)", () => {
    expect(toLongFormPlaylistId("UU_x5XG1OV2P6uZZ5FSM9Ttw")).toBe("UULF_x5XG1OV2P6uZZ5FSM9Ttw");
  });

  it("preserves already long-form playlist IDs (UULF...)", () => {
    expect(toLongFormPlaylistId("UULF_x5XG1OV2P6uZZ5FSM9Ttw")).toBe("UULF_x5XG1OV2P6uZZ5FSM9Ttw");
  });

  it("detects YouTube URLs and channel inputs", () => {
    expect(isYouTubeInput("UC_x5XG1OV2P6uZZ5FSM9Ttw")).toBe(true);
    expect(isYouTubeInput("@mkbhd")).toBe(true);
    expect(isYouTubeInput("https://www.youtube.com/channel/UC1234567890123456789012")).toBe(true);
    expect(isYouTubeInput("https://news.ycombinator.com/rss")).toBe(false);
  });

  it("resolves raw channel ID to long-form video feed", async () => {
    const result = await resolveYouTubeLongFormFeed("UC_x5XG1OV2P6uZZ5FSM9Ttw");
    expect(result).toBe(
      "https://www.youtube.com/feeds/videos.xml?playlist_id=UULF_x5XG1OV2P6uZZ5FSM9Ttw"
    );
  });

  it("resolves channel_id parameter to long-form playlist feed", async () => {
    const result = await resolveYouTubeLongFormFeed(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw"
    );
    expect(result).toBe(
      "https://www.youtube.com/feeds/videos.xml?playlist_id=UULF_x5XG1OV2P6uZZ5FSM9Ttw"
    );
  });

  it("resolves uploads playlist_id=UU... to long-form playlist_id=UULF...", async () => {
    const result = await resolveYouTubeLongFormFeed(
      "https://www.youtube.com/feeds/videos.xml?playlist_id=UU_x5XG1OV2P6uZZ5FSM9Ttw"
    );
    expect(result).toBe(
      "https://www.youtube.com/feeds/videos.xml?playlist_id=UULF_x5XG1OV2P6uZZ5FSM9Ttw"
    );
  });

  it("preserves already long-form feed URL", async () => {
    const url = "https://www.youtube.com/feeds/videos.xml?playlist_id=UULF_x5XG1OV2P6uZZ5FSM9Ttw";
    const result = await resolveYouTubeLongFormFeed(url);
    expect(result).toBe(url);
  });

  it("resolves channel URL (/channel/UC...) to long-form feed", async () => {
    const result = await resolveYouTubeLongFormFeed(
      "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw"
    );
    expect(result).toBe(
      "https://www.youtube.com/feeds/videos.xml?playlist_id=UULF_x5XG1OV2P6uZZ5FSM9Ttw"
    );
  });

  it("leaves non-YouTube RSS feeds untouched", async () => {
    const feed = "https://daringfireball.net/feeds/main";
    const result = await resolveYouTubeLongFormFeed(feed);
    expect(result).toBe(feed);
  });

  it("prioritizes canonical channel metadata over recommended channels in handle pages", async () => {
    const originalFetch = globalThis.fetch;
    // Simulate YouTube channel page with a recommended channel before the canonical link
    const mockHtml = `
      <html>
        <head>
          <script>
            // Sidebar / recommended channels
            var config = {"gridChannelRenderer":{"channelId":"UC8EQAfueDGNeqb1ALm0LjHA"}};
          </script>
          <link rel="canonical" href="https://www.youtube.com/channel/UCvLc83k5o11EIF1lEo0VmuQ">
          <meta property="og:url" content="https://www.youtube.com/channel/UCvLc83k5o11EIF1lEo0VmuQ">
        </head>
        <body></body>
      </html>
    `;

    globalThis.fetch = (async () => {
      return new Response(mockHtml, { status: 200, headers: { "Content-Type": "text/html" } });
    }) as any;

    try {
      const result = await resolveYouTubeLongFormFeed("https://www.youtube.com/@svdelos");
      expect(result).toBe(
        "https://www.youtube.com/feeds/videos.xml?playlist_id=UULFvLc83k5o11EIF1lEo0VmuQ"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
