import { describe, it, expect } from 'vitest';
import {
  isValidUrl,
  isValidImageUrl,
  sanitizeFilename,
  validateFile,
  ALLOWED_VIDEO_TYPES
} from '../js/modules/validator.js';

describe('isValidUrl', () => {
  it('accepts http/https URLs', () => {
    expect(isValidUrl('https://prnt.sc/abc')).toBe(true);
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('rejects other protocols and garbage', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl(null)).toBe(false);
  });
});

describe('isValidImageUrl', () => {
  it('accepts direct image URLs and known services', () => {
    expect(isValidImageUrl('https://example.com/a.png')).toBe(true);
    expect(isValidImageUrl('https://prnt.sc/abc123')).toBe(true);
  });

  it('rejects non-image URLs', () => {
    expect(isValidImageUrl('https://example.com/page.html')).toBe(false);
  });
});

describe('sanitizeFilename', () => {
  it('strips path traversal and special characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('..');
    expect(sanitizeFilename('my file (1).png')).toBe('my_file__1_.png');
  });

  it('returns a fallback for empty input', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename(null)).toBe('file');
  });
});

describe('validateFile with MIME fallback (FR-1)', () => {
  it('accepts a .mov File with an empty reported type', () => {
    const file = new File(['x'.repeat(100)], 'recording.mov', { type: '' });
    const result = validateFile(file, { allowedTypes: ALLOWED_VIDEO_TYPES });
    expect(result.valid).toBe(true);
  });

  it('accepts a .mkv File with an empty reported type', () => {
    const file = new File(['x'.repeat(100)], 'recording.mkv', { type: '' });
    const result = validateFile(file, { allowedTypes: ALLOWED_VIDEO_TYPES });
    expect(result.valid).toBe(true);
  });

  it('rejects unknown types with a readable error', () => {
    const file = new File(['x'], 'notes.txt', { type: '' });
    const result = validateFile(file, { allowedTypes: ALLOWED_VIDEO_TYPES });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('unknown');
  });

  it('rejects empty files', () => {
    const file = new File([], 'empty.mp4', { type: 'video/mp4' });
    const result = validateFile(file, { allowedTypes: ALLOWED_VIDEO_TYPES });
    expect(result.valid).toBe(false);
  });
});
