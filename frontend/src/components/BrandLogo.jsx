import React from "react";

export function BrandMark({ className = '', size = 40 }) {
  return (
    <img
      src="/favicon.png"
      alt="Hosting mascot"
      className={`brand-mark ${className}`.trim()}
      style={{ width: size, height: size }}
      draggable="false"
    />
  );
}

export default function BrandLogo({ compact = false, className = '' }) {
  if (compact) {
    return (
      <div className={`brand-logo compact ${className}`.trim()}>
        <BrandMark size={38} />
        <div className="brand-copy">
          <strong>Hosting</strong>
          <span>by TechByGiusi</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`brand-logo ${className}`.trim()}>
      <img src="/brand-logo.png" alt="Hosting by TechByGiusi" className="brand-logo-image" draggable="false" />
    </div>
  );
}
