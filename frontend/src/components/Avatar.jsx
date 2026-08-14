import React from 'react';

/**
 * Round profile picture with an initials fallback.
 *
 * The fallback is deterministic: the same account always gets the same tint,
 * so the header still reads as "your account" before a picture is uploaded.
 */

const TINTS = [
  'tint-sage', 'tint-moss', 'tint-clay', 'tint-slate', 'tint-sand', 'tint-fern'
];

export function initialsFor(name, email) {
  const source = String(name || '').trim() || String(email || '').trim();
  if (!source) return '?';
  const emailLocal = source.includes('@') ? source.split('@')[0] : source;
  const parts = emailLocal.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return emailLocal.slice(0, 2).toUpperCase();
}

function tintFor(key) {
  const source = String(key || '');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) % 997;
  }
  return TINTS[hash % TINTS.length];
}

export default function Avatar({ src, name, email, size = 40, className = '' }) {
  const label = initialsFor(name, email);
  const style = { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.36)}px` };

  if (src) {
    return (
      <span className={`avatar avatar-image ${className}`.trim()} style={style}>
        <img src={src} alt={name || email || 'Profile picture'} draggable="false" />
      </span>
    );
  }

  return (
    <span
      className={`avatar avatar-initials ${tintFor(email || name)} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}
