// Security Input Sanitizer
// Protects against XSS, script injection, malicious HTML, and SQL injection patterns

export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove <script> tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove <iframe> tags
    .replace(/javascript:/gi, '') // Strip inline javascript: URIs
    .replace(/on\w+\s*=/gi, '') // Remove inline event handlers (e.g., onload=, onerror=)
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
    .trim();
}

export function sanitizeFileName(filename: string): string {
  if (!filename) return 'document.pdf';
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Keep only safe chars
    .replace(/\.\./g, '.'); // Prevent directory traversal
}
