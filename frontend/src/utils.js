// ── Plugin-specific layout CSS ─────────────────────────────────────────────
// Only layout primitives — every value is a host design token (var(--xxx)).
// Colors, fonts, radii, transitions all come from the host app's tokens.css.

export const STYLE_ID = 'wg-plugin-styles';

export const LAYOUT_CSS = `
  .wg-peer-list { display: flex; flex-direction: column; gap: 6px; }

  .wg-peer-row {
    display: grid; grid-template-columns: 8px 1fr auto;
    align-items: center; gap: 12px;
    background: var(--bg-3); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 12px 16px;
    transition: border-color var(--transition);
  }
  .wg-peer-row:hover { border-color: var(--accent-border); }
  .wg-peer-name  { font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 3px; }
  .wg-peer-meta  { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; font-family: var(--font-mono); color: var(--text-2); }
  .wg-peer-ip    { color: var(--accent); }
  .wg-peer-actions { display: flex; gap: 6px; flex-shrink: 0; }

  .wg-info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
  .wg-info-key  { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); margin-bottom: 3px; }
  .wg-info-val  { font-family: var(--font-mono); font-size: 12px; word-break: break-all; color: var(--text); }

  .wg-tab-row { display: flex; gap: 6px; margin-bottom: 14px; }
  .wg-tab {
    padding: 5px 12px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); background: transparent;
    color: var(--text-2); font-family: var(--font-ui); font-size: 12px;
    cursor: pointer; transition: all var(--transition);
  }
  .wg-tab-active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent-border); }

  .wg-qr-img {
    display: block; margin: 0 auto; max-width: 200px; width: 100%;
    border-radius: var(--radius-sm); image-rendering: pixelated;
  }
  .wg-conf-pre {
    font-family: var(--font-mono); font-size: 11px; color: var(--text-2);
    background: var(--bg); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 12px;
    white-space: pre; overflow-x: auto; max-height: 200px; overflow-y: auto;
  }
  .wg-dl-row { display: flex; justify-content: flex-end; margin-top: 10px; }

  /* Skeleton shimmer — uses host @keyframes spin via globals.css */
  .wg-skel {
    background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-3) 50%, var(--bg-2) 75%);
    background-size: 200% 100%; animation: wg-shimmer 1.5s infinite;
    border-radius: var(--radius-sm); height: 12px;
  }
  @keyframes wg-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* Inline spinner (reuses host @keyframes spin from globals.css) */
  .wg-spin {
    display: inline-block; width: 13px; height: 13px;
    border: 2px solid var(--border); border-top-color: currentColor;
    border-radius: 50%; animation: spin 0.65s linear infinite;
  }

  .wg-peers-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
`;

export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = LAYOUT_CSS;
  document.head.appendChild(s);
}

export function removeStyles() {
  document.getElementById(STYLE_ID)?.remove();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function formatBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return n.toFixed(i ? 1 : 0) + ' ' + units[i];
}

export function formatHandshake(epoch) {
  if (!epoch || epoch === '0') return 'Never';
  const secs = Date.now() / 1000 - parseInt(epoch, 10);
  if (secs < 60)    return 'Just now';
  if (secs < 3600)  return Math.floor(secs / 60) + 'm ago';
  if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
  return Math.floor(secs / 86400) + 'd ago';
}

export function isOnline(peer) {
  if (!peer.last_handshake || peer.last_handshake === '0') return false;
  return (Date.now() / 1000 - parseInt(peer.last_handshake, 10)) < 180;
}
