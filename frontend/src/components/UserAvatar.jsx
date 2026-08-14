import React from 'react';

function initialsFromUser(user) {
  const source = String(user?.name || user?.email || '').trim();
  if (!source) return 'HP';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

export default function UserAvatar({ user, size = 40, className = '', alt }) {
  const initials = initialsFromUser(user);
  const style = { width: size, height: size };

  if (user?.avatarUrl) {
    return (
      <span className={`user-avatar ${className}`.trim()} style={style}>
        <img src={user.avatarUrl} alt={alt || user?.name || user?.email || 'Profile image'} loading="lazy" />
      </span>
    );
  }

  return (
    <span className={`user-avatar user-avatar-fallback ${className}`.trim()} style={style} aria-label={alt || initials}>
      {initials}
    </span>
  );
}
