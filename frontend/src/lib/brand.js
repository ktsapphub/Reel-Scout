/**
 * Brand configuration — single source of truth for the app's display name
 * and tagline. Values come from env vars (build-time) with sensible defaults
 * so a rebrand is a 1-line `.env` change instead of a code sweep.
 *
 *   REACT_APP_BRAND_NAME    e.g. "Reel Scout"
 *   REACT_APP_BRAND_TAGLINE e.g. "Instagram Reel scraper"
 */
export const BRAND_NAME = process.env.REACT_APP_BRAND_NAME || "Reel Scout";
export const BRAND_TAGLINE = process.env.REACT_APP_BRAND_TAGLINE || "Instagram Reel scraper";
