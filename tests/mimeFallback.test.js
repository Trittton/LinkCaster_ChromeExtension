import { describe, it, expect } from 'vitest';
import { getEffectiveMimeType, isMediaCategory } from '../js/modules/mimeFallback.js';

describe('getEffectiveMimeType', () => {
  it('returns the browser-reported type when present', () => {
    expect(getEffectiveMimeType({ name: 'clip.mov', type: 'video/quicktime' })).toBe('video/quicktime');
  });

  it('falls back to the extension when type is empty (FR-1)', () => {
    expect(getEffectiveMimeType({ name: 'clip.mov', type: '' })).toBe('video/quicktime');
    expect(getEffectiveMimeType({ name: 'clip.mkv', type: '' })).toBe('video/x-matroska');
    expect(getEffectiveMimeType({ name: 'clip.avi', type: '' })).toBe('video/x-msvideo');
    expect(getEffectiveMimeType({ name: 'shot.png', type: '' })).toBe('image/png');
  });

  it('is case-insensitive on the extension', () => {
    expect(getEffectiveMimeType({ name: 'CLIP.MOV', type: '' })).toBe('video/quicktime');
  });

  it('returns empty string for unknown extensions', () => {
    expect(getEffectiveMimeType({ name: 'file.xyz', type: '' })).toBe('');
    expect(getEffectiveMimeType({ name: 'noextension', type: '' })).toBe('');
  });

  it('handles missing input safely', () => {
    expect(getEffectiveMimeType(null)).toBe('');
    expect(getEffectiveMimeType({})).toBe('');
  });
});

describe('isMediaCategory', () => {
  it('classifies videos with empty reported type', () => {
    expect(isMediaCategory({ name: 'a.mov', type: '' }, 'video')).toBe(true);
    expect(isMediaCategory({ name: 'a.mov', type: '' }, 'image')).toBe(false);
  });

  it('classifies images', () => {
    expect(isMediaCategory({ name: 'a.png', type: 'image/png' }, 'image')).toBe(true);
    expect(isMediaCategory({ name: 'a.mp4', type: 'video/mp4' }, 'image')).toBe(false);
  });

  it('rejects unknown types', () => {
    expect(isMediaCategory({ name: 'a.txt', type: '' }, 'video')).toBe(false);
  });
});
