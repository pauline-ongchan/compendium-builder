export function getPublicationStatus(publishedAt: string) {
  const timestamp = publishedAt.trim();
  const isPublished = Boolean(timestamp) && timestamp.toLowerCase() !== "not published";
  return {
    isPublished,
    status: isPublished ? "Published" as const : "Not published" as const,
    activity: isPublished ? `Last published ${timestamp}` : "No publication yet",
    scheduleLabel: isPublished ? "Published schedule" : "Draft schedule",
  };
}
