# Synapse REST & AI Agent API Reference

Synapse is designed from the ground up as an **API-first, dual-surface knowledge platform**:

1. **The Human Surface:** A distraction-free, keyboard-driven web reader with warm editorial typography and dyslexia modes.
2. **The Agent Surface:** A headless ingestion, full-text search, and clean Markdown extraction engine accessible to local AI agents, LLMs, and automated research workflows.

Every action in the Synapse interface is backed by decoupled REST endpoints powered by SQLite with WAL mode and SQLite FTS5 full-text indexing.

---

## 1. Authentication & Base URL

### Base URL

- Local Docker instance: `http://localhost:3005` (or `${SYNAPSE_URL:-http://localhost:3000}`)
- Production / Remote instance: `https://synapse.yourdomain.com`

### Authentication Methods

- **Local Loopback (`AUTH_MODE=none`):** By default, requests originating from `localhost` or local subnets (`127.0.0.1`, `192.168.x.x`, `10.x.x.x`) require zero authentication.
- **Pre-Shared Bearer Key (`SYNAPSE_API_KEY`):** For remote agents, external scripts, or deployments behind Cloudflare Access / Reverse Proxies, set `SYNAPSE_API_KEY` in your environment and pass it in the `Authorization` header:

```bash
Authorization: Bearer <SYNAPSE_API_KEY>
# Or via custom header:
x-api-key: <SYNAPSE_API_KEY>
```

---

## 2. Articles & Research Streams (`/api/items`)

### Query Articles & FTS5 Full-Text Search

Retrieve articles from your library with instant full-text search or targeted filtering.

```http
GET /api/items?q={searchQuery}&category={category}&unreadOnly=true&limit=25
```

#### Query Parameters

| Parameter     | Type      | Default | Description                                                                    |
| :------------ | :-------- | :------ | :----------------------------------------------------------------------------- |
| `q`           | `string`  | —       | Full-text FTS5 search query matching title, snippet, and article body.         |
| `category`    | `string`  | —       | Filter by feed category (e.g. `Technology`, `Cybersecurity`, `AI & Research`). |
| `feedId`      | `string`  | —       | Filter by specific feed UUID or slug.                                          |
| `unreadOnly`  | `boolean` | `false` | Return only unread articles.                                                   |
| `starredOnly` | `boolean` | `false` | Return only starred (Read Later) articles.                                     |
| `workOnly`    | `boolean` | `false` | Return only items flagged for your Team/Work digest.                           |
| `videoOnly`   | `boolean` | `false` | Return only YouTube/video items.                                               |
| `textOnly`    | `boolean` | `false` | Return only text/article items.                                                |
| `limit`       | `number`  | `50`    | Maximum items to return (up to 100).                                           |
| `offset`      | `number`  | `0`     | Pagination offset.                                                             |

#### Example Response

```json
{
  "items": [
    {
      "id": "item-abc-123",
      "feedId": "feed-xyz-789",
      "feedTitle": "Simon Willison's Weblog",
      "feedCategory": "Technology",
      "title": "Things we learned about LLMs in 2026",
      "url": "https://simonwillison.net/2026/...",
      "author": "Simon Willison",
      "snippet": "A deep dive into local reasoning models and agent harnesses...",
      "fullContentMarkdown": "# Things we learned...",
      "isRead": false,
      "isStarred": true,
      "isWork": false,
      "publishedAt": 1774320000,
      "createdAt": 1774321200
    }
  ]
}
```

---

### Extract Clean Reader Markdown

Fetch an article converted into clean, token-efficient Markdown with YAML frontmatter — stripped of navigation, ads, and tracker boilerplate.

```http
GET /api/items/{id}/markdown
```

#### Example Response (`text/markdown; charset=utf-8`)

```markdown
---
title: "Things we learned about LLMs in 2026"
source: "https://simonwillison.net/2026/..."
author: "Simon Willison"
feed: "Simon Willison's Weblog"
date_published: "2026-10-23T12:00:00.000Z"
date_saved: "2026-10-23T14:30:00.000Z"
tags:
  - technology
  - llm
status: to-review
---

# Things we learned about LLMs in 2026

A deep dive into local reasoning models and agent harnesses...
```

---

### Triage & Update Item State

Update the triage flags for an article (Read, Starred, or Work queue).

```http
PATCH /api/items
Content-Type: application/json

{
  "id": "item-abc-123",
  "isRead": true,
  "isStarred": false,
  "isWork": true
}
```

#### Example Response

```json
{
  "success": true
}
```

---

### Batch Mark All Read

Mark all items in a category, feed, or global queue as read.

```http
POST /api/items/mark-all-read
Content-Type: application/json

{
  "feedId": "feed-xyz-789",       // Optional: scope to single feed
  "category": "Technology"        // Optional: scope to category
}
```

---

## 3. Feeds & Ingestion Management (`/api/feeds`)

### List All Feeds

Retrieve all subscribed feeds, categories, health statuses, and unread counters.

```http
GET /api/feeds
```

#### Example Response

```json
{
  "feeds": [
    {
      "id": "feed-xyz-789",
      "title": "Ars Technica",
      "feedUrl": "https://feeds.arstechnica.com/arstechnica/index",
      "siteUrl": "https://arstechnica.com",
      "category": "Technology",
      "unreadCount": 14,
      "lastFetchedAt": 1774320000,
      "lastError": null
    }
  ]
}
```

---

### Subscribe to a New Feed

Add an RSS, Atom, or YouTube channel feed to your library.

```http
POST /api/feeds
Content-Type: application/json

{
  "feedUrl": "https://simonwillison.net/atom/everything/",
  "category": "Technology"
}
```

---

### Trigger Background Synchronization

Force an immediate background ingestion cycle across the dual-pool sync engine.

```http
POST /api/feeds/sync-all
```

#### Example Response

```json
{
  "success": true,
  "message": "Dual-pool background sync triggered."
}
```

---

## 4. Collaborative Intelligence & Digests (`/api/digest`)

### Generate Work / Team Digest

Compile all items currently flagged as `isWork = true` into a clean executive digest summary.

```http
GET /api/digest/work
```

#### Example Response

```json
{
  "digestName": "Engineering Intelligence Digest",
  "itemCount": 4,
  "markdown": "# Engineering Intelligence Digest — 23 Oct 2026\n\n* **[Article Title](https://...)** — Key takeaways...\n",
  "items": [ ... ]
}
```

---

## 5. Code Examples

### Python (AI Research Agent Example)

```python
import os
import httpx

SYNAPSE_URL = os.getenv("SYNAPSE_URL", "http://localhost:3005")
API_KEY = os.getenv("SYNAPSE_API_KEY", "")

headers = {}
if API_KEY:
    headers["Authorization"] = f"Bearer {API_KEY}"

def search_synapse(query: str, limit: int = 5):
    """Search your Synapse library using SQLite FTS5."""
    url = f"{SYNAPSE_URL}/api/items"
    params = {"q": query, "limit": limit}
    response = httpx.get(url, params=params, headers=headers)
    response.raise_for_status()
    return response.json().get("items", [])

def get_clean_markdown(item_id: str) -> str:
    """Fetch reader Markdown formatted for LLM context injection."""
    url = f"{SYNAPSE_URL}/api/items/{item_id}/markdown"
    response = httpx.get(url, headers=headers)
    response.raise_for_status()
    return response.text

# Example: Search for local agent articles and extract text
results = search_synapse("reasoning models")
for article in results:
    print(f"Found: {article['title']} ({article['feedTitle']})")
    md = get_clean_markdown(article["id"])
    print(f"Tokens approx: {len(md) // 4}\n")
```

---

### TypeScript / Bun (Agent Tool Example)

```typescript
const SYNAPSE_URL = process.env.SYNAPSE_URL || "http://localhost:3005";
const API_KEY = process.env.SYNAPSE_API_KEY;

const headers: Record<string, string> = {
  "Content-Type": "application/json",
};
if (API_KEY) {
  headers["Authorization"] = `Bearer ${API_KEY}`;
}

// 1. Fetch unread articles in Technology
const res = await fetch(`${SYNAPSE_URL}/api/items?unreadOnly=true&category=Technology&limit=10`, {
  headers,
});
const { items } = await res.json();

// 2. Mark top item as read
if (items.length > 0) {
  await fetch(`${SYNAPSE_URL}/api/items`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ id: items[0].id, isRead: true }),
  });
  console.log(`Triaged: ${items[0].title}`);
}
```

---

## 6. Model Context Protocol (MCP) Integration

Synapse ships with a native **Model Context Protocol (MCP)** server so any AI coding assistant or desktop agent (Claude Desktop, Antigravity, Cursor, Claude Code) can natively search your library and read articles.

### Adding to Claude Desktop / Antigravity MCP Config

Add Synapse to your `claude_desktop_config.json` or `antigravity.json`:

```json
{
  "mcpServers": {
    "synapse": {
      "command": "bun",
      "args": ["run", "mcp"],
      "env": {
        "SYNAPSE_URL": "http://localhost:3005",
        "SYNAPSE_API_KEY": "your-optional-api-key"
      }
    }
  }
}
```

### Available Tools

1. `synapse_search(query: string, limit?: number)`: Full-text FTS5 search across your entire article library.
2. `synapse_get_unread(category?: string, limit?: number)`: Grabs your active reading queue.
3. `synapse_get_markdown(id: string)`: Fetches clean, token-efficient Markdown for any article.
4. `synapse_triage(id: string, action: "read" | "unread" | "star" | "work")`: Allows the agent to organize and triage articles.
