function googleDocId(input: string) {
  try {
    const url = new URL(input);
    if (url.hostname !== "docs.google.com") return null;
    return url.pathname.match(/^\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const documentId = googleDocId(typeof body?.url === "string" ? body.url : "");
    if (!documentId) return Response.json({ error: "Enter a valid Google Docs document link." }, { status: 400 });

    const response = await fetch(`https://docs.google.com/document/d/${documentId}/export?format=txt`, { redirect: "follow" });
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || contentType.includes("text/html") || /<html[\s>]/i.test(text.slice(0, 500))) {
      return Response.json({ error: "That document is private or unavailable. Make it viewable by link, or paste the schedule instead." }, { status: 422 });
    }
    if (!text.trim()) return Response.json({ error: "The document did not contain readable schedule text." }, { status: 422 });

    return Response.json({ text });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to import the Google Doc." }, { status: 500 });
  }
}
