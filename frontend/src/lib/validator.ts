import { sanitizeInput } from './sanitizer';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedValue?: string;
}

export function validateEmail(email: string): ValidationResult {
  const sanitized = sanitizeInput(email);
  if (!sanitized) return { isValid: false, error: 'Email address is required' };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    return { isValid: false, error: 'Please enter a valid email address (e.g. user@domain.com)' };
  }
  return { isValid: true, sanitizedValue: sanitized };
}

export function validatePassword(password: string): ValidationResult {
  if (!password || password.length < 6) {
    return { isValid: false, error: 'Password must be at least 6 characters long' };
  }
  return { isValid: true, sanitizedValue: password };
}

export function validateAgentName(name: string): ValidationResult {
  const sanitized = sanitizeInput(name);
  if (!sanitized || sanitized.length < 2) {
    return { isValid: false, error: 'Agent name must be at least 2 characters long' };
  }
  if (sanitized.length > 50) {
    return { isValid: false, error: 'Agent name cannot exceed 50 characters' };
  }
  return { isValid: true, sanitizedValue: sanitized };
}

export function validateSystemPrompt(prompt: string): ValidationResult {
  const sanitized = sanitizeInput(prompt);
  if (!sanitized || sanitized.length < 10) {
    return { isValid: false, error: 'System prompt must be at least 10 characters long to define agent persona' };
  }
  return { isValid: true, sanitizedValue: sanitized };
}

export function validatePdfFile(file: File | null): ValidationResult {
  if (!file) return { isValid: false, error: 'No file selected. Please choose a PDF file to upload.' };
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return { isValid: false, error: 'Invalid file format. Only PDF files (.pdf) are supported.' };
  }
  const maxBytes = 50 * 1024 * 1024; // 50MB
  if (file.size > maxBytes) {
    return { isValid: false, error: `File size exceeds limit (${(file.size / 1024 / 1024).toFixed(1)}MB). Max allowed is 50MB.` };
  }
  return { isValid: true };
}
