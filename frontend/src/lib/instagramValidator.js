/**
 * Lightweight client-side validation of Instagram usernames and profile URLs.
 * Cannot guarantee the account exists (that requires a live API hit), but catches
 * the vast majority of typos before we burn an Apify run.
 */
const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;
const RESERVED = new Set(["p", "reel", "reels", "stories", "explore", "direct", "accounts", "tv"]);

export function extractUsernameFromInput(raw) {
  if (!raw) return "";
  let value = raw.trim().replace(/^@/, "");
  const urlMatch = value.match(/instagram\.com\/([A-Za-z0-9._]+)\/?/i);
  if (urlMatch) value = urlMatch[1];
  return value;
}

export function validateInstagramHandle(raw) {
  const value = extractUsernameFromInput(raw);
  if (!value) return { state: "empty", message: "" };
  if (value.length > 30)
    return { state: "invalid", message: "Too long — Instagram usernames are max 30 characters" };
  if (!USERNAME_RE.test(value))
    return { state: "invalid", message: "Only letters, digits, periods and underscores allowed" };
  if (value.startsWith(".") || value.endsWith("."))
    return { state: "invalid", message: "Cannot start or end with a period" };
  if (value.includes(".."))
    return { state: "invalid", message: "Cannot contain consecutive periods" };
  if (RESERVED.has(value.toLowerCase()))
    return { state: "invalid", message: `"${value}" is an Instagram reserved keyword, not a profile` };
  return { state: "valid", message: "Looks like a valid Instagram handle", username: value };
}

export function validateInstagramUrl(raw) {
  if (!raw || !raw.trim()) return { state: "empty", message: "" };
  const trimmed = raw.trim();
  // Allow bare usernames OR full URLs
  if (!/^https?:\/\//i.test(trimmed) && !/^instagram\.com/i.test(trimmed)) {
    return validateInstagramHandle(trimmed);
  }
  const m = trimmed.match(/instagram\.com\/([A-Za-z0-9._]+)\/?/i);
  if (!m) return { state: "invalid", message: "Must be an instagram.com profile URL or a username" };
  return validateInstagramHandle(m[1]);
}

const POST_URL_RE = /^https?:\/\/(?:www\.)?instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?(\?.*)?$/i;

export function validateInstagramPostUrl(raw) {
  if (!raw || !raw.trim()) return { state: "empty", message: "" };
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { state: "invalid", message: "Must be a full URL starting with https://" };
  }
  const m = trimmed.match(POST_URL_RE);
  if (!m) {
    return { state: "invalid", message: "Use a reel/post URL e.g. instagram.com/reel/XYZ/ or /p/XYZ/" };
  }
  return { state: "valid", message: `Valid Instagram ${m[1]} URL`, shortcode: m[2], kind: m[1].toLowerCase() };
}

export const MAX_POST_URLS = 10;
