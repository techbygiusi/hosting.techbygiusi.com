import React from 'react';
import { CloseIcon } from './Icons';

export default function ActionModal({ title, subtitle, children, onClose, wide = false }) {
  return (
    <div className="modal-backdrop-clean" onClick={onClose}>
      <div className={`modal-clean ${wide ? 'wide' : ''}`} onClick={(event) => event.stopPropagation()}>
        <div className="modal-clean-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="modal-clean-body">{children}</div>
      </div>
    </div>
  );
}
