import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ServerCard from './ServerCard';
import PeerList from './PeerList';
import { injectStyles, removeStyles } from './utils';

let _nextToastId = 0;

// Toast stack — rendered into document.body via portal so it sits above everything.
// Uses .toast .toast-ok .toast-err .toast-icon .toast-msg from host components.css.
function ToastStack({ toasts }) {
  return createPortal(
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
      display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.kind} animate-fade-in`}>
          <span className="toast-icon">{t.kind === 'ok' ? '✓' : '✕'}</span>
          <span className="toast-msg">{t.msg}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// Root component.
// Uses .page .page-header .page-title .page-desc from host globals.css.
export default function App({ api }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, kind = 'ok') => {
    const id = ++_nextToastId;
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  // Inject plugin-specific layout CSS; clean up on unmount.
  useEffect(() => {
    injectStyles();
    return removeStyles;
  }, []);

  return (
    <>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">WireGuard VPN</h1>
            <p className="page-desc">Peer management &amp; key distribution</p>
          </div>
        </div>
        <ServerCard api={api} />
        <PeerList api={api} toast={toast} />
      </div>
      <ToastStack toasts={toasts} />
    </>
  );
}
