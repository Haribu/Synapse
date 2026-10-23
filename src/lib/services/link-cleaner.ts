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
    ];

    for (const param of trackingParams) {
      url.searchParams.delete(param);
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}
