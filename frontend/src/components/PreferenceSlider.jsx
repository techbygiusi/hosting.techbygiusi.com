import React from 'react';

export default function PreferenceSlider({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  compact = false
}) {
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const count = Math.max(options.length, 1);

  return (
    <div
      className={`preference-slider ${compact ? 'preference-slider-compact' : ''} ${className}`.trim()}
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ '--preference-count': count, '--preference-index': activeIndex }}
    >
      <span className="preference-slider-thumb" aria-hidden="true" />
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`preference-slider-option ${active ? 'active' : ''}`}
            onClick={() => onChange(option.value)}
            role="radio"
            aria-checked={active}
            title={option.title || option.label}
          >
            {Icon ? <Icon size={compact ? 14 : 16} /> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
