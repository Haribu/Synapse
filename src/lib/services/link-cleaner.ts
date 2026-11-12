export function cleanUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_cid",
      "utm_reader",
      "ref",
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
      "source",
      "affiliate",
      "_hsenc",
      "_hsmi",
      "r",
      "publication_id",
      "post_id",
    ];

    for (const param of trackingParams) {
      url.searchParams.delete(param);
    }

    // Normalize path by removing trailing slash (unless path is just '/')
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}
