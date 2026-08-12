export function allowedEmailDomain() {
  return (process.env.RELAY_GOOGLE_DOMAIN ?? "ubcbiztech.com")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

export function isAllowedPortalEmail(email: string | null | undefined) {
  const domain = allowedEmailDomain();
  if (!email || !domain) return false;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${domain}`) && normalized.split("@").length === 2;
}

export function hasAllowedEmailDomain() {
  return Boolean(allowedEmailDomain());
}
