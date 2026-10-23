/**
 * Generates a complete shareable session URL.
 * Dynamically detects subpaths (e.g. /glfbrd on GitHub Pages),
 * custom domains, and local development.
 */
export function getSessionShareUrl(accessCode: string): string {
  if (typeof window === 'undefined') return '';

  // Extract base path (e.g., '/glfbrd' on GitHub Pages, or '' on custom domains/localhost)
  const basePath = window.location.pathname
    .replace(/\/s\/?.*$/, '') // Remove /s route and subpaths
    .replace(/\/$/, '');      // Remove trailing slash

  return `${window.location.origin}${basePath}/s?code=${encodeURIComponent(accessCode)}`;
}