function approvedEmails() {
  return new Set(
    (process.env.RELAY_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isApprovedAdminEmail(email: string | null | undefined) {
  return Boolean(email && approvedEmails().has(email.toLowerCase()));
}

export function hasApprovedAdmins() {
  return approvedEmails().size > 0;
}
