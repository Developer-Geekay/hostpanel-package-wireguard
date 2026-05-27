/**
 * WireGuard Plugin – frontend
 *
 * Styling contract:
 *   - ALL colors, fonts, radii, transitions come from the host app's CSS tokens
 *     (var(--bg), var(--accent), var(--border), var(--font-ui), etc.)
 *   - Interactive elements use host CSS classes: .btn, .card, .modal-overlay,
 *     .modal, .toast, .dot-ok, .empty, input[type="text"] …
 *   - This file only defines plugin-specific LAYOUT CSS (peer row grid, info
 *     grid, QR sheet), and those rules also use only var(--xxx) tokens.
 *   - No hardcoded colors, no imported fonts, no duplicate animations.
 */

const WgPlugin = (() => {
  'use strict';

  const STYLE_ID = 'wg-plugin-styles';

  // ── Plugin-specific layout CSS (tokens only, no hardcoded values) ──────────
  const LAYOUT_CSS = `
    /* Peer list */
    .wg-peer-list { display: flex; flex-direction: column; gap: 6px; }
    .wg-peer-row {
      display: grid; grid-template-columns: 8px 1fr auto;
      align-items: center; gap: 12px;
      background: var(--bg-3); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 12px 16px;
      transition: border-color var(--transition);
    }
    .wg-peer-row:hover { border-color: var(--accent-border); }
    .wg-peer-name { font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 3px; }
    .wg-peer-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; font-family: var(--font-mono); color: var(--text-2); }
    .wg-peer-ip   { color: var(--accent); }
    .wg-peer-actions { display: flex; gap: 6px; flex-shrink: 0; }

    /* Server info grid */
    .wg-info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
    .wg-info-key  { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); margin-bottom: 3px; }
    .wg-info-val  { font-family: var(--font-mono); font-size: 12px; word-break: break-all; color: var(--text); }

    /* QR / Config sheet */
    .wg-tab-row { display: flex; gap: 6px; margin-bottom: 14px; }
    .wg-tab {
      padding: 5px 12px; border-radius: var(--radius-sm);
      border: 1px solid var(--border); background: transparent;
      color: var(--text-2); font-family: var(--font-ui); font-size: 12px;
      cursor: pointer; transition: all var(--transition);
    }
    .wg-tab-active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent-border); }
    .wg-qr-img { display: block; margin: 0 auto; max-width: 200px; width: 100%; border-radius: var(--radius-sm); image-rendering: pixelated; }
    .wg-conf-pre {
      font-family: var(--font-mono); font-size: 11px; color: var(--text-2);
      background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 12px; white-space: pre; overflow-x: auto; max-height: 200px; overflow-y: auto;
    }
    .wg-dl-row { display: flex; justify-content: flex-end; margin-top: 10px; }

    /* Skeleton — uses host @keyframes spin defined in globals.css */
    .wg-skel {
      background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-3) 50%, var(--bg-2) 75%);
      background-size: 200% 100%; animation: wg-shimmer 1.5s infinite;
      border-radius: var(--radius-sm); height: 12px;
    }
    @keyframes wg-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* Button-inline spinner (uses host @keyframes spin) */
    .wg-spin {
      display: inline-block; width: 13px; height: 13px;
      border: 2px solid var(--border); border-top-color: currentColor;
      border-radius: 50%; animation: spin 0.65s linear infinite;
    }

    /* Peers header row */
    .wg-peers-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
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
    s.textContent = LAYOUT_CSS;
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
  // Uses .toast .toast-ok / .toast-err from host components.css.
  // Mounts into a shared fixed container so multiple toasts stack correctly.

  let toastContainer = null;

  function Toast(msg, ok = true) {
    if (!toastContainer) {
      toastContainer = el('div');
      Object.assign(toastContainer.style, {
        position: 'fixed', bottom: '24px', right: '24px',
        zIndex: '9000', display: 'flex', flexDirection: 'column', gap: '8px',
      });
      document.body.appendChild(toastContainer);
    }

    const t = el('div', 'toast ' + (ok ? 'toast-ok' : 'toast-err'));
    t.append(el('span', 'toast-icon', ok ? '✓' : '✕'), el('span', 'toast-msg', msg));
    toastContainer.appendChild(t);

    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; }, 3400);
    setTimeout(() => t.remove(), 3700);
  }

  // ── Building Block: Header ─────────────────────────────────────────────────
  // Uses .page-header, .page-title, .page-desc from host globals.css.

  function Header() {
    const header = el('div', 'page-header');
    const left   = el('div');
    left.append(
      el('div', 'page-title', 'WireGuard VPN'),
      el('div', 'page-desc',  'Peer management & key distribution'),
    );
    header.appendChild(left);
    return header;
  }

  // ── Building Block: PeerRow ────────────────────────────────────────────────
  // Uses .dot .dot-ok / .dot-dim from host globals.css.
  // Uses .btn .btn-ghost .btn-danger .btn-sm from host components.css.

  function PeerRow(peer, { onQr, onDelete }) {
    const row  = el('div', 'wg-peer-row');
    const dot  = el('div', 'dot ' + (isOnline(peer) ? 'dot-ok' : 'dot-dim'));

    const info = el('div');
    const name = el('div', 'wg-peer-name', peer.name);
    const meta = el('div', 'wg-peer-meta');
    meta.append(
      el('span', 'wg-peer-ip', peer.allowed_ips),
      el('span', null, formatHandshake(peer.last_handshake)),
      el('span', null, '↓ ' + formatBytes(peer.transfer_rx)),
      el('span', null, '↑ ' + formatBytes(peer.transfer_tx)),
    );
    info.append(name, meta);

    const actions = el('div', 'wg-peer-actions');
    const qrBtn   = el('button', 'btn btn-ghost btn-sm', 'QR');
    const delBtn  = el('button', 'btn btn-danger btn-sm', 'Remove');
    qrBtn.addEventListener('click', () => onQr(peer.name));
    delBtn.addEventListener('click', () => onDelete(peer.name));
    actions.append(qrBtn, delBtn);

    row.append(dot, info, actions);
    return row;
  }

  // ── Building Block: AddModal ───────────────────────────────────────────────
  // Uses .modal-overlay .modal .modal-header .modal-title .modal-close
  //      .modal-body .modal-footer from host components.css.
  // Uses host input[type="text"] global styles — no custom .wg-input needed.

  function AddModal(api, { onSuccess }) {
    const overlay = el('div', 'modal-overlay');
    const modal   = el('div', 'modal animate-fade-in');
    modal.style.width = '380px';

    // Header
    const header    = el('div', 'modal-header');
    const closeBtn  = el('button', 'modal-close', '✕');
    header.append(el('span', 'modal-title', 'Add Peer'), closeBtn);

    // Body
    const body = el('div', 'modal-body');

    const nameField  = el('div', 'field');
    const nameLabel  = el('label', null, 'Peer name');
    const nameInput  = document.createElement('input');
    nameInput.type = 'text'; nameInput.placeholder = 'e.g. laptop, phone-ios';
    nameField.append(nameLabel, nameInput);

    const ipField  = el('div', 'field');
    const ipLabel  = el('label', null, 'Allowed IPs (optional — auto-assigned if blank)');
    const ipInput  = document.createElement('input');
    ipInput.type = 'text'; ipInput.placeholder = '10.66.66.x/32';
    ipField.append(ipLabel, ipInput);

    body.append(nameField, ipField);

    // Footer
    const footer    = el('div', 'modal-footer');
    const cancelBtn = el('button', 'btn btn-outline btn-md', 'Cancel');
    const addBtn    = el('button', 'btn btn-primary btn-md', 'Add Peer');
    footer.append(cancelBtn, addBtn);

    modal.append(header, body, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    nameInput.focus();

    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const submit = async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      addBtn.disabled = true;
      addBtn.innerHTML = '';
      addBtn.append(el('span', 'wg-spin'), document.createTextNode(' Adding…'));
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
    const overlay = el('div', 'modal-overlay');
    const modal   = el('div', 'modal animate-fade-in');
    modal.style.width = '360px';

    const header   = el('div', 'modal-header');
    const closeBtn = el('button', 'modal-close', '✕');
    header.append(el('span', 'modal-title', 'Remove Peer'), closeBtn);

    const body = el('div', 'modal-body');
    const msg  = el('p');
    msg.style.color = 'var(--text-2)';
    msg.append(
      document.createTextNode('Remove peer '),
      el('strong', null, name),
      document.createTextNode('? This will revoke VPN access.'),
    );
    body.appendChild(msg);

    const footer    = el('div', 'modal-footer');
    const cancelBtn = el('button', 'btn btn-outline btn-md', 'Cancel');
    const delBtn    = el('button', 'btn btn-danger btn-md', 'Remove');
    footer.append(cancelBtn, delBtn);

    modal.append(header, body, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    delBtn.addEventListener('click', async () => {
      delBtn.disabled = true;
      delBtn.innerHTML = '';
      delBtn.append(el('span', 'wg-spin'), document.createTextNode(' Removing…'));
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
    const overlay = el('div', 'modal-overlay');
    const modal   = el('div', 'modal animate-fade-in');
    modal.style.width = '400px';

    const header   = el('div', 'modal-header');
    const closeBtn = el('button', 'modal-close', '✕');
    header.append(el('span', 'modal-title', name + ' — Config'), closeBtn);

    const body = el('div', 'modal-body');

    // Tab switcher (plugin-specific, uses wg-tab which reads var(--xxx) tokens)
    const tabRow  = el('div', 'wg-tab-row');
    const qrTab   = el('button', 'wg-tab wg-tab-active', 'QR Code');
    const confTab = el('button', 'wg-tab', 'Config File');
    tabRow.append(qrTab, confTab);

    const content = el('div');
    const spinner = el('div', 'wg-spin');
    spinner.style.cssText = 'margin: 40px auto; display: block;';
    content.appendChild(spinner);

    const dlRow = el('div', 'wg-dl-row');

    body.append(tabRow, content, dlRow);

    const footer = el('div', 'modal-footer');
    footer.appendChild(el('span')); // spacer

    modal.append(header, body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Fetch data
    let configText = '';
    let qrObjectUrl = null;
    try {
      const [confRes, qrRes] = await Promise.all([
        api.raw('GET', 'peers/' + encodeURIComponent(name) + '/config'),
        api.raw('GET', 'peers/' + encodeURIComponent(name) + '/qr'),
      ]);
      if (confRes.ok) { const d = await confRes.json(); configText = d.config || ''; }
      if (qrRes.ok)   { qrObjectUrl = URL.createObjectURL(await qrRes.blob()); }
    } catch { Toast('Could not load peer config', false); }

    const renderQr = () => {
      content.innerHTML = ''; dlRow.innerHTML = '';
      if (qrObjectUrl) {
        const img = el('img', 'wg-qr-img');
        img.src = qrObjectUrl; img.alt = 'QR for ' + name;
        content.appendChild(img);
        const dl = el('a', 'btn btn-ghost btn-sm', 'Download PNG');
        dl.href = qrObjectUrl; dl.download = name + '.png';
        dlRow.appendChild(dl);
      } else {
        content.appendChild(el('p', null, 'QR unavailable (qrcode library not installed on server)'));
      }
    };

    const renderConf = () => {
      content.innerHTML = ''; dlRow.innerHTML = '';
      const pre = el('pre', 'wg-conf-pre');
      pre.textContent = configText || '# Config not available';
      content.appendChild(pre);
      if (configText) {
        const blob = new Blob([configText], { type: 'text/plain' });
        const dl   = el('a', 'btn btn-ghost btn-sm', 'Download .conf');
        dl.href = URL.createObjectURL(blob); dl.download = name + '.conf';
        dlRow.appendChild(dl);
      }
    };

    qrTab.addEventListener('click', () => {
      qrTab.classList.add('wg-tab-active');    confTab.classList.remove('wg-tab-active');
      renderQr();
    });
    confTab.addEventListener('click', () => {
      confTab.classList.add('wg-tab-active');  qrTab.classList.remove('wg-tab-active');
      renderConf();
    });

    renderQr();
  }

  // ── Building Block: ServerCard ─────────────────────────────────────────────
  // Uses .card .card-title from host globals.css.

  function ServerCard(api) {
    const card = el('div', 'card');
    card.appendChild(el('div', 'card-title', 'Server'));

    const grid   = el('div', 'wg-info-grid');
    const fields = [
      { key: 'endpoint',   label: 'Endpoint' },
      { key: 'address',    label: 'Interface IP' },
      { key: 'port',       label: 'Port' },
      { key: 'public_key', label: 'Public Key' },
    ];

    const valueEls = {};
    for (const f of fields) {
      const item = el('div');
      item.appendChild(el('div', 'wg-info-key', f.label));
      const val = el('div', 'wg-skel');
      val.style.width = f.key === 'public_key' ? '90%' : '55%';
      item.appendChild(val);
      valueEls[f.key] = val;
      grid.appendChild(item);
    }
    card.appendChild(grid);

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
  // Uses .card .card-title .empty .empty-title .empty-desc from host.
  // Uses .btn .btn-primary .btn-md for the Add Peer button.

  function PeerList(api) {
    const card    = el('div', 'card');
    const head    = el('div', 'wg-peers-head');
    const listEl  = el('div', 'wg-peer-list');
    const addBtn  = el('button', 'btn btn-primary btn-md', '+ Add Peer');

    head.append(el('div', 'card-title', 'VPN Peers'), addBtn);

    const refresh = async () => {
      try {
        const peers = await api.get('peers');
        listEl.innerHTML = '';
        if (!peers.length) {
          const empty = el('div', 'empty');
          empty.append(
            el('div', 'empty-icon', '🔒'),
            el('div', 'empty-title', 'No peers yet'),
            el('div', 'empty-desc', 'Add your first VPN peer to get started.'),
          );
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
        const empty = el('div', 'empty');
        empty.appendChild(el('div', 'empty-desc', 'Could not load peers: ' + (err.message || 'Unknown error')));
        listEl.appendChild(empty);
      }
    };

    // Skeleton rows while loading
    for (let i = 0; i < 3; i++) {
      const skel = el('div', 'wg-peer-row');
      skel.style.pointerEvents = 'none';
      const info = el('div');
      const n = el('div', 'wg-skel'); n.style.cssText = 'width:120px;margin-bottom:8px;';
      const m = el('div', 'wg-skel'); m.style.width = '70%';
      info.append(n, m);
      skel.append(el('div', 'dot dot-dim'), info, el('div'));
      listEl.appendChild(skel);
    }

    addBtn.addEventListener('click', () => AddModal(api, { onSuccess: refresh }));
    card.append(head, listEl);
    refresh();
    return card;
  }

  // ── Plugin API ─────────────────────────────────────────────────────────────

  return {
    init(hostEl, api) {
      injectStyles();
      // .page gives us the host app's standard page padding + scroll
      const page = el('div', 'page');
      page.append(Header(), ServerCard(api), PeerList(api));
      hostEl.appendChild(page);
    },
    destroy() {
      document.getElementById(STYLE_ID)?.remove();
      toastContainer?.remove();
      toastContainer = null;
    },
  };

})();

// ── Register with HostPanel package loader ─────────────────────────────────────
window.__hpkg = window.__hpkg || {};
window.__hpkg['wireguard'] = WgPlugin;
