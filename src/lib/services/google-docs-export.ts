export interface GoogleDocExportPayload {
  title: string;
  sourceUrl: string;
  author?: string;
  contentMarkdown: string;
  folderName?: string;
}

export async function exportToGoogleDoc(
  payload: GoogleDocExportPayload
): Promise<{ docUrl: string; docId: string }> {
  // Check if credentials/OAuth environment variables are configured
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const oauthToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

  if (!serviceAccountKey && !oauthToken) {
    // Generate a formatted Markdown / HTML fallback or mock if credentials are not yet set
    return {
      docId: "draft-pending-auth",
      docUrl: `https://docs.google.com/document/create?title=${encodeURIComponent(payload.title)}`,
    };
  }

  // Implementation uses googleapis to create document and batchUpdate text
  const { google } = await import("googleapis");

  const auth = oauthToken
    ? new google.auth.OAuth2()
    : new google.auth.GoogleAuth({
        keyFile: serviceAccountKey,
        scopes: [
          "https://www.googleapis.com/auth/documents",
          "https://www.googleapis.com/auth/drive.file",
        ],
      });

  if (oauthToken && auth instanceof google.auth.OAuth2) {
    auth.setCredentials({ access_token: oauthToken });
  }

  const docs = google.docs({ version: "v1", auth: auth as any });

  const doc = await docs.documents.create({
    requestBody: {
      title: payload.title,
    },
  });

  const docId = doc.data.documentId!;

  const textBody = `Title: ${payload.title}\nSource: ${payload.sourceUrl}\nAuthor: ${payload.author || "Unknown"}\nDate: ${new Date().toLocaleDateString()}\n\n---\n\n${payload.contentMarkdown}`;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: textBody,
          },
        },
      ],
    },
  });

  return {
    docId,
    docUrl: `https://docs.google.com/document/d/${docId}/edit`,
  };
}
