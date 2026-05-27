/**
 * WireGuard Plugin – UI building blocks
 *
 * Each section of the UI is a named factory function that returns a DOM node.
 * Blocks compose each other; nothing is hidden inside an anonymous wrapper.
 *
 * Registered on window.__hpkg['wireguard'] for PackageShell to call.
 */

const WgPlugin = (() => {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const STYLE_ID = 'wg-pkg-styles';

  // ── CSS ────────────────────────────────────────────────────────────────────
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    .wg-root {
      --teal: #00e5cc;
      --teal-dim: rgba(0,229,204,0.12);
      --teal-glow: 0 0 24px rgba(0,229,204,0.25);
      --bg: #070b0d;
      --surface: #0d1517;
      --surface2: #131c1f;
      --border: rgba(0,229,204,0.1);
      --border-hover: rgba(0,229,204,0.22);
      --text: #ccd9dc;
      --text-dim: #5e7e86;
      --green: #2ed573;
      --red: #ff4f5e;
      --font: 'Outfit', sans-serif;
      --mono: 'JetBrains Mono', monospace;

      font-family: var(--font);
      color: var(--text);
      background: var(--bg);
      min-height: 100%;
      padding: 28px 24px;
      box-sizing: border-box;
      position: relative;
      overflow-x: hidden;
    }

    .wg-root::before {
      content: '';
      position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background-image: radial-gradient(circle, rgba(0,229,204,0.055) 1px, transparent 1px);
      background-size: 30px 30px;
    }

    .wg-inner { position: relative; z-index: 1; max-width: 860px; margin: 0 auto; }

    /* ─── Header ─── */
    .wg-header { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; }
    .wg-header-icon {
      width: 46px; height: 46px; border-radius: 13px;
      background: var(--teal-dim); border: 1px solid rgba(0,229,204,0.2);
      display: grid; place-items: center; font-size: 24px;
      box-shadow: var(--teal-glow);
    }
    .wg-title { font-size: 20px; font-weight: 600; letter-spacing: -0.3px; color: #e8f2f4; }
    .wg-subtitle { font-size: 11px; color: var(--text-dim); font-family: var(--mono); margin-top: 3px; }

    /* ─── Cards ─── */
    .wg-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; padding: 20px 24px; margin-bottom: 20px;
      transition: border-color 0.2s;
    }
    .wg-card:hover { border-color: var(--border-hover); }
    .wg-card-label {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.1em; color: var(--teal); margin-bottom: 16px;
    }

    /* ─── Server Info ─── */
    .wg-info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(176px,1fr)); gap: 16px; }
    .wg-info-item { display: flex; flex-direction: column; gap: 5px; }
    .wg-info-key { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); }
    .wg-info-val { font-family: var(--mono); font-size: 12.5px; word-break: break-all; color: var(--text); }

    /* ─── Peers ─── */
    .wg-peers-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .wg-peers-title { font-size: 13px; font-weight: 500; color: #e8f2f4; }

    .wg-peer-list { display: flex; flex-direction: column; gap: 8px; }
    .wg-peer-row {
      display: grid; grid-template-columns: 10px 1fr auto;
      align-items: center; gap: 14px;
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: 10px; padding: 13px 16px;
      transition: border-color 0.15s;
    }
    .wg-peer-row:hover { border-color: var(--border-hover); }

    .wg-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; }
    .wg-dot-on { background: var(--green); box-shadow: 0 0 7px var(--green); }
    .wg-dot-off { background: #2a3f44; }

    .wg-peer-name { font-size: 13.5px; font-weight: 500; color: #e0ecee; margin-bottom: 5px; }
    .wg-peer-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; font-family: var(--mono); color: var(--text-dim); }
    .wg-peer-ip { color: var(--teal); }

    .wg-peer-actions { display: flex; gap: 7px; flex-shrink: 0; }

    .wg-empty { padding: 36px 0; text-align: center; color: var(--text-dim); font-size: 13px; }
    .wg-empty-icon { font-size: 28px; margin-bottom: 10px; }

    /* ─── Buttons ─── */
    .wg-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 18px; border-radius: 8px; border: none;
      cursor: pointer; font-family: var(--font); font-size: 13px; font-weight: 500;
      transition: all 0.15s; white-space: nowrap;
    }
    .wg-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .wg-btn-primary { background: var(--teal); color: #050b0d; }
    .wg-btn-primary:not(:disabled):hover { filter: brightness(1.1); box-shadow: var(--teal-glow); }
    .wg-btn-ghost {
      background: var(--teal-dim); color: var(--teal);
      border: 1px solid rgba(0,229,204,0.18);
    }
    .wg-btn-ghost:not(:disabled):hover { background: rgba(0,229,204,0.2); }
    .wg-btn-danger {
      background: rgba(255,79,94,0.12); color: var(--red);
      border: 1px solid rgba(255,79,94,0.18);
    }
    .wg-btn-danger:not(:disabled):hover { background: rgba(255,79,94,0.22); }
    .wg-btn-sm { padding: 5px 12px; font-size: 11.5px; border-radius: 6px; }
    .wg-btn-icon { padding: 5px 10px; font-size: 13px; border-radius: 6px; min-width: 32px; justify-content: center; }

    /* ─── Skeleton ─── */
    .wg-skel {
      background: linear-gradient(90deg, var(--surface) 25%, var(--surface2) 50%, var(--surface) 75%);
      background-size: 200% 100%; animation: wg-shimmer 1.5s infinite;
      border-radius: 5px; height: 13px;
    }
    @keyframes wg-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* ─── Overlay + Modal ─── */
    .wg-overlay {
      position: fixed; inset: 0; z-index: 800;
      background: rgba(3,7,9,0.82); backdrop-filter: blur(5px);
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .wg-modal {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 28px 30px;
      width: 360px; max-width: 100%;
      box-shadow: 0 28px 70px rgba(0,0,0,0.55), var(--teal-glow);
    }
    .wg-modal-title { font-size: 15px; font-weight: 600; color: #e8f2f4; margin-bottom: 22px; }
    .wg-modal-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 22px; }

    .wg-field { margin-bottom: 16px; }
    .wg-field-label { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); margin-bottom: 7px; }
    .wg-input {
      width: 100%; box-sizing: border-box;
      background: var(--bg); color: var(--text);
      border: 1px solid var(--border); border-radius: 8px;
      padding: 10px 13px; font-family: var(--font); font-size: 13.5px;
      outline: none; transition: border-color 0.2s;
    }
    .wg-input:focus { border-color: var(--teal); }
    .wg-input::placeholder { color: #2a3f44; }

    /* ─── QR Sheet ─── */
    .wg-qr-sheet {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 28px 30px;
      width: 420px; max-width: 100%;
      box-shadow: 0 28px 70px rgba(0,0,0,0.55);
    }
    .wg-qr-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
    .wg-qr-title { font-size: 15px; font-weight: 600; color: #e8f2f4; }
    .wg-close-btn {
      background: none; border: none; cursor: pointer;
      color: var(--text-dim); font-size: 18px; padding: 2px 6px;
      border-radius: 6px; transition: color 0.15s;
    }
    .wg-close-btn:hover { color: var(--text); }
    .wg-tab-row { display: flex; gap: 8px; margin-bottom: 16px; }
    .wg-tab {
      padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border);
      background: transparent; color: var(--text-dim); font-family: var(--font);
      font-size: 11.5px; cursor: pointer; transition: all 0.15s;
    }
    .wg-tab-active { background: var(--teal-dim); color: var(--teal); border-color: rgba(0,229,204,0.25); }
    .wg-qr-img { display: block; margin: 0 auto; max-width: 220px; width: 100%; border-radius: 6px; image-rendering: pixelated; }
    .wg-conf-code {
      font-family: var(--mono); font-size: 10.5px; color: var(--text-dim);
      background: var(--bg); border: 1px solid var(--border);
      border-radius: 8px; padding: 12px 14px;
      white-space: pre; overflow-x: auto;
      max-height: 220px; overflow-y: auto;
    }
    .wg-dl-row { display: flex; justify-content: flex-end; margin-top: 12px; }

    /* ─── Toast ─── */
    .wg-toast {
      position: fixed; bottom: 24px; right: 24px; z-index: 9000;
      display: flex; align-items: center; gap: 9px;
      padding: 11px 17px; border-radius: 10px; font-size: 12.5px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.4);
      transition: opacity 0.3s, transform 0.3s;
      max-width: 300px; pointer-events: none;
    }
    .wg-toast-ok  { background: rgba(46,213,115,0.14); border: 1px solid rgba(46,213,115,0.28); color: var(--green); }
    .wg-toast-err { background: rgba(255,79,94,0.14);  border: 1px solid rgba(255,79,94,0.28);  color: var(--red); }
    .wg-toast-gone { opacity: 0; transform: translateY(10px); }

    /* ─── Spinner ─── */
    .wg-spin {
      display: inline-block; width: 13px; height: 13px;
      border: 2px solid rgba(0,229,204,0.2); border-top-color: var(--teal);
      border-radius: 50%; animation: wg-spin 0.65s linear infinite;
    }
    @keyframes wg-spin { to { transform: rotate(360deg); } }
  `;

  // ── Primitives ─────────────────────────────────────────────────────────────

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls)      e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function formatBytes(n) {
    if (!n) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return n.toFixed(i ? 1 : 0) + ' ' + units[i];
  }

  function formatHandshake(epoch) {
    if (!epoch || epoch === '0') return 'Never';
    const secs = Date.now() / 1000 - parseInt(epoch, 10);
    if (secs < 60)    return 'Just now';
    if (secs < 3600)  return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    return Math.floor(secs / 86400) + 'd ago';
  }

  function isOnline(peer) {
    if (!peer.last_handshake || peer.last_handshake === '0') return false;
    return (Date.now() / 1000 - parseInt(peer.last_handshake, 10)) < 180;
  }

  // ── Building Block: Toast ──────────────────────────────────────────────────
  // Self-mounted; no return value needed.

  function Toast(msg, ok = true) {
    const t = el('div', 'wg-toast ' + (ok ? 'wg-toast-ok' : 'wg-toast-err'));
    t.append(el('span', null, ok ? '✓' : '✕'), el('span', null, msg));
    document.body.appendChild(t);
    setTimeout(() => {
      t.classList.add('wg-toast-gone');
      setTimeout(() => t.remove(), 350);
    }, 3200);
  }

  // ── Building Block: Header ─────────────────────────────────────────────────

  function Header() {
    const header = el('div', 'wg-header');
    const icon   = el('div', 'wg-header-icon', '🔒');
    const text   = el('div');
    text.append(
      el('div', 'wg-title', 'WireGuard VPN'),
      el('div', 'wg-subtitle', 'Peer management & key distribution')
    );
    header.append(icon, text);
    return header;
  }

  // ── Building Block: PeerRow ────────────────────────────────────────────────

  function PeerRow(peer, { onQr, onDelete }) {
    const row  = el('div', 'wg-peer-row');
    const dot  = el('div', 'wg-dot ' + (isOnline(peer) ? 'wg-dot-on' : 'wg-dot-off'));

    const info = el('div', 'wg-peer-info');
    const name = el('div', 'wg-peer-name', peer.name);
    const meta = el('div', 'wg-peer-meta');
    const ip   = el('span', 'wg-peer-ip', peer.allowed_ips);
    meta.append(
      ip,
      el('span', null, formatHandshake(peer.last_handshake)),
      el('span', null, '↓ ' + formatBytes(peer.transfer_rx)),
      el('span', null, '↑ ' + formatBytes(peer.transfer_tx))
    );
    info.append(name, meta);

    const actions = el('div', 'wg-peer-actions');
    const qrBtn   = el('button', 'wg-btn wg-btn-ghost wg-btn-sm wg-btn-icon', '◫ QR');
    const delBtn  = el('button', 'wg-btn wg-btn-danger wg-btn-sm', 'Remove');
    qrBtn.addEventListener('click', () => onQr(peer.name));
    delBtn.addEventListener('click', () => onDelete(peer.name));
    actions.append(qrBtn, delBtn);

    row.append(dot, info, actions);
    return row;
  }

  // ── Building Block: AddModal ───────────────────────────────────────────────

  function AddModal(api, { onSuccess }) {
    const overlay = el('div', 'wg-overlay');
    const modal   = el('div', 'wg-modal');

    const nameField  = el('div', 'wg-field');
    const nameLabel  = el('label', 'wg-field-label', 'Peer name');
    const nameInput  = el('input', 'wg-input');
    nameInput.placeholder = 'e.g. laptop, phone-ios';
    nameInput.type = 'text';
    nameField.append(nameLabel, nameInput);

    const ipField  = el('div', 'wg-field');
    const ipLabel  = el('label', 'wg-field-label', 'Allowed IPs (optional — auto-assigned if blank)');
    const ipInput  = el('input', 'wg-input');
    ipInput.placeholder = '10.66.66.x/32';
    ipInput.type = 'text';
    ipField.append(ipLabel, ipInput);

    const footer    = el('div', 'wg-modal-footer');
    const cancelBtn = el('button', 'wg-btn wg-btn-ghost', 'Cancel');
    const addBtn    = el('button', 'wg-btn wg-btn-primary', 'Add Peer');
    footer.append(cancelBtn, addBtn);

    modal.append(el('div', 'wg-modal-title', 'Add Peer'), nameField, ipField, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    nameInput.focus();

    const close = () => overlay.remove();
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const submit = async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      addBtn.disabled = true;
      addBtn.innerHTML = '';
      addBtn.appendChild(el('span', 'wg-spin'));
      try {
        const body = { name };
        const ip = ipInput.value.trim();
        if (ip) body.allowed_ips = ip;
        await api.post('peers', body);
        Toast('Peer "' + name + '" added');
        close();
        onSuccess();
      } catch (err) {
        Toast(err.message || 'Failed to add peer', false);
        addBtn.disabled = false;
        addBtn.textContent = 'Add Peer';
      }
    };

    addBtn.addEventListener('click', submit);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }

  // ── Building Block: DeleteModal ────────────────────────────────────────────

  function DeleteModal(name, api, { onSuccess }) {
    const overlay = el('div', 'wg-overlay');
    const modal   = el('div', 'wg-modal');

    const msg = el('p', 'wg-confirm-msg');
    msg.append(
      document.createTextNode('Remove peer '),
      el('strong', null, name),
      document.createTextNode('? This will revoke VPN access.')
    );

    const footer    = el('div', 'wg-modal-footer');
    const cancelBtn = el('button', 'wg-btn wg-btn-ghost', 'Cancel');
    const delBtn    = el('button', 'wg-btn wg-btn-danger', 'Remove');
    footer.append(cancelBtn, delBtn);

    modal.append(el('div', 'wg-modal-title', 'Remove Peer'), msg, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    delBtn.addEventListener('click', async () => {
      delBtn.disabled = true;
      delBtn.innerHTML = '';
      delBtn.appendChild(el('span', 'wg-spin'));
      try {
        await api.delete('peers/' + encodeURIComponent(name));
        Toast('Peer "' + name + '" removed');
        close();
        onSuccess();
      } catch (err) {
        Toast(err.message || 'Failed to remove peer', false);
        delBtn.disabled = false;
        delBtn.textContent = 'Remove';
      }
    });
  }

  // ── Building Block: QRSheet ────────────────────────────────────────────────

  async function QRSheet(name, api) {
    const overlay = el('div', 'wg-overlay');
    const sheet   = el('div', 'wg-qr-sheet');

    const head      = el('div', 'wg-qr-head');
    const closeBtn  = el('button', 'wg-close-btn', '×');
    closeBtn.setAttribute('aria-label', 'Close');
    head.append(el('div', 'wg-qr-title', name), closeBtn);

    const tabRow  = el('div', 'wg-tab-row');
    const qrTab   = el('button', 'wg-tab wg-tab-active', 'QR Code');
    const confTab = el('button', 'wg-tab', 'Config File');
    tabRow.append(qrTab, confTab);

    const content = el('div', 'wg-qr-content');
    const spinner = el('div', 'wg-spin');
    spinner.style.cssText = 'margin: 40px auto; display: block;';
    content.appendChild(spinner);

    const dlRow = el('div', 'wg-dl-row');

    sheet.append(head, tabRow, content, dlRow);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    let configText = '';
    let qrObjectUrl = null;

    try {
      const [confRes, qrRes] = await Promise.all([
        api.raw('GET', 'peers/' + encodeURIComponent(name) + '/config'),
        api.raw('GET', 'peers/' + encodeURIComponent(name) + '/qr'),
      ]);
      if (confRes.ok) { const d = await confRes.json(); configText = d.config || ''; }
      if (qrRes.ok)   { qrObjectUrl = URL.createObjectURL(await qrRes.blob()); }
    } catch {
      Toast('Could not load peer config', false);
    }

    const renderQr = () => {
      content.innerHTML = '';
      dlRow.innerHTML   = '';
      if (qrObjectUrl) {
        const img = el('img', 'wg-qr-img');
        img.src = qrObjectUrl;
        img.alt = 'WireGuard QR code for ' + name;
        content.appendChild(img);
        const dl = el('a', 'wg-btn wg-btn-ghost wg-btn-sm', 'Download PNG');
        dl.href = qrObjectUrl; dl.download = name + '.png';
        dlRow.appendChild(dl);
      } else {
        content.appendChild(el('p', null, 'QR code unavailable (qrcode library not installed)'));
      }
    };

    const renderConf = () => {
      content.innerHTML = '';
      dlRow.innerHTML   = '';
      const pre = el('pre', 'wg-conf-code');
      pre.textContent = configText || '# Config not available';
      content.appendChild(pre);
      if (configText) {
        const blob = new Blob([configText], { type: 'text/plain' });
        const dl   = el('a', 'wg-btn wg-btn-ghost wg-btn-sm', 'Download .conf');
        dl.href = URL.createObjectURL(blob); dl.download = name + '.conf';
        dlRow.appendChild(dl);
      }
    };

    qrTab.addEventListener('click', () => {
      qrTab.classList.add('wg-tab-active');
      confTab.classList.remove('wg-tab-active');
      renderQr();
    });
    confTab.addEventListener('click', () => {
      confTab.classList.add('wg-tab-active');
      qrTab.classList.remove('wg-tab-active');
      renderConf();
    });

    renderQr();
  }

  // ── Building Block: ServerCard ─────────────────────────────────────────────

  function ServerCard(api) {
    const card  = el('div', 'wg-card');
    const label = el('div', 'wg-card-label', 'Server');
    const grid  = el('div', 'wg-info-grid');

    const fields = [
      { key: 'endpoint',   label: 'Endpoint' },
      { key: 'address',    label: 'Interface IP' },
      { key: 'port',       label: 'Port' },
      { key: 'public_key', label: 'Public Key' },
    ];

    const valueEls = {};
    for (const f of fields) {
      const item = el('div', 'wg-info-item');
      item.appendChild(el('div', 'wg-info-key', f.label));
      const val = el('div', 'wg-skel');
      val.style.width = f.key === 'public_key' ? '90%' : '60%';
      item.appendChild(val);
      valueEls[f.key] = val;
      grid.appendChild(item);
    }

    card.append(label, grid);

    api.get('server/info').then(info => {
      for (const f of fields) {
        const v = valueEls[f.key];
        v.className   = 'wg-info-val';
        v.textContent = String(info[f.key] ?? '-');
      }
    }).catch(() => {
      for (const v of Object.values(valueEls)) {
        v.className = 'wg-info-val'; v.textContent = 'Unavailable';
      }
    });

    return card;
  }

  // ── Building Block: PeerList ───────────────────────────────────────────────

  function PeerList(api) {
    const card    = el('div', 'wg-card');
    const head    = el('div', 'wg-peers-head');
    const titleEl = el('div', 'wg-peers-title', 'VPN Peers');
    const addBtn  = el('button', 'wg-btn wg-btn-primary', '+ Add Peer');
    const listEl  = el('div', 'wg-peer-list');

    const refresh = async () => {
      try {
        const peers = await api.get('peers');
        listEl.innerHTML = '';
        if (!peers.length) {
          const empty = el('div', 'wg-empty');
          empty.append(el('div', 'wg-empty-icon', '🔒'), el('p', null, 'No peers configured. Add your first VPN peer.'));
          listEl.appendChild(empty);
        } else {
          for (const peer of peers) {
            listEl.appendChild(PeerRow(peer, {
              onQr:     name => QRSheet(name, api),
              onDelete: name => DeleteModal(name, api, { onSuccess: refresh }),
            }));
          }
        }
      } catch (err) {
        listEl.innerHTML = '';
        const errEl = el('div', 'wg-empty');
        errEl.appendChild(el('p', null, 'Could not load peers: ' + (err.message || 'Unknown error')));
        listEl.appendChild(errEl);
      }
    };

    // Skeleton while loading
    for (let i = 0; i < 3; i++) {
      const skel = el('div', 'wg-peer-row');
      skel.style.pointerEvents = 'none';
      const n = el('div', 'wg-skel'); n.style.cssText = 'width:120px;margin-bottom:8px;';
      const m = el('div', 'wg-skel'); m.style.width = '80%';
      const info = el('div', 'wg-peer-info');
      info.append(n, m);
      skel.append(el('div', 'wg-dot wg-dot-off'), info, el('div'));
      listEl.appendChild(skel);
    }

    addBtn.addEventListener('click', () => AddModal(api, { onSuccess: refresh }));
    head.append(titleEl, addBtn);
    card.append(head, listEl);

    refresh();
    return card;
  }

  // ── Plugin API (returned to PackageShell) ──────────────────────────────────

  return {
    init(hostEl, api) {
      injectStyles();
      const root  = el('div', 'wg-root');
      const inner = el('div', 'wg-inner');
      inner.append(Header(), ServerCard(api), PeerList(api));
      root.appendChild(inner);
      hostEl.appendChild(root);
    },
    destroy() {
      document.getElementById(STYLE_ID)?.remove();
    },
  };

})();

// ── Register with HostPanel package loader ─────────────────────────────────────
window.__hpkg = window.__hpkg || {};
window.__hpkg['wireguard'] = WgPlugin;
