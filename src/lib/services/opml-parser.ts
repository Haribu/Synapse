import { XMLParser } from "fast-xml-parser";

export interface ParsedFeedOutline {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  category: string;
}

export function parseOPML(opmlXmlContent: string): ParsedFeedOutline[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const parsed = parser.parse(opmlXmlContent);
  const results: ParsedFeedOutline[] = [];

  const body = parsed?.opml?.body;
  if (!body) return results;

  const outlines = Array.isArray(body.outline) ? body.outline : [body.outline];

  function traverse(node: any, currentCategory: string) {
    if (!node) return;

    const items = Array.isArray(node) ? node : [node];

    for (const item of items) {
      const title = item["@_title"] || item["@_text"] || "Untitled Feed";
      const xmlUrl = item["@_xmlUrl"];
      const htmlUrl = item["@_htmlUrl"];
      const type = item["@_type"];

      if (xmlUrl) {
        results.push({
          title,
          xmlUrl,
          htmlUrl,
          category: currentCategory || "General",
        });
      } else if (item.outline) {
        // Nested folder or category
        const subCategory = item["@_text"] || item["@_title"] || currentCategory;
        traverse(item.outline, subCategory);
      }
    }
  }

  traverse(outlines, "General");
  return results;
}
