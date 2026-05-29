/* hostpanel-package-wireguard — frontend/main.js
 * SDK plugin: no build step required.
 * Registered via window.__hpkg_sdk.register('wireguard', WireGuardApp).
 *
 * NOTE: htm passes props to React.createElement, so `style` must be a JS object.
 * Use style=${{ prop: 'value' }} syntax throughout.
 */
(function () {
  'use strict';

  const sdk = window.__hpkg_sdk;
  const { html, useState, useEffect, useCallback, useRef } = sdk;
  const { SdkConfirmModal } = sdk.components;
  const { useApi, useToast } = sdk.hooks;

  // ── Styles ──────────────────────────────────────────────────────────────────

  const STYLE_ID = 'wg-plugin-styles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      .wg-server-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 14px; }
      .wg-stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-3); margin-bottom: 4px; }
      .wg-stat-val { font-family: var(--font-mono); font-size: 12px; word-break: break-all; color: var(--text); display: flex; align-items: center; gap: 6px; }
      .wg-status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 500; }
      .wg-status-up { background: rgba(34,197,94,.12); color: #22c55e; }
      .wg-status-down { background: var(--bg-2); color: var(--text-3); border: 1px solid var(--border); }
      .wg-server-footer { display: flex; justify-content: flex-end; margin-top: 6px; gap: 6px; }
      .wg-peers-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 8px; }
      .wg-peers-btns { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .wg-peer-list { display: flex; flex-direction: column; gap: 6px; }
      .wg-peer-row { display: grid; grid-template-columns: 10px 1fr auto; align-items: start; gap: 12px; background: var(--bg-3); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 16px; transition: border-color var(--transition); }
      .wg-peer-row:hover { border-color: var(--accent-border); }
      .wg-peer-row.wg-disabled { opacity: .5; }
      .wg-peer-name { font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 3px; display: flex; align-items: center; gap: 6px; }
      .wg-peer-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; font-family: var(--font-mono); color: var(--text-2); margin-top: 2px; }
      .wg-peer-ip { color: var(--accent); }
      .wg-peer-actions { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
      .wg-badge { font-size: 10px; padding: 1px 5px; border-radius: 3px; background: var(--bg-2); color: var(--text-3); border: 1px solid var(--border); }
      .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
      .dot-ok { background: #22c55e; box-shadow: 0 0 5px #22c55e66; }
      .dot-dim { background: var(--text-3); }
      .wg-copy-btn { background: none; border: none; cursor: pointer; color: var(--text-3); padding: 2px 4px; border-radius: 3px; font-size: 10px; line-height: 1; }
      .wg-copy-btn:hover { color: var(--accent); background: var(--accent-dim); }
      .wg-tab-row { display: flex; gap: 6px; margin-bottom: 14px; }
      .wg-tab { padding: 5px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: transparent; color: var(--text-2); font-family: var(--font-ui); font-size: 12px; cursor: pointer; transition: all var(--transition); }
      .wg-tab-active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent-border); }
      .wg-qr-img { display: block; margin: 0 auto; max-width: 220px; width: 100%; border-radius: var(--radius-sm); image-rendering: pixelated; }
      .wg-conf-pre { font-family: var(--font-mono); font-size: 11px; color: var(--text-2); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; white-space: pre; overflow-x: auto; max-height: 220px; overflow-y: auto; margin: 0; }
      .wg-modal-dl { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; gap: 8px; flex-wrap: wrap; }
      .wg-spin { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: currentColor; border-radius: 50%; animation: spin .65s linear infinite; vertical-align: middle; }
      .wg-skel { background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-3) 50%, var(--bg-2) 75%); background-size: 200% 100%; animation: wg-shimmer 1.5s infinite; border-radius: var(--radius-sm); height: 14px; }
      @keyframes wg-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      .wg-setup-card { padding: 0 !important; overflow: hidden; }
      .wg-setup-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; background: none; border: none; cursor: pointer; padding: 14px 18px; color: var(--text); font-size: 13px; font-weight: 500; font-family: var(--font-ui); }
      .wg-setup-toggle:hover { background: var(--bg-2); }
      .wg-setup-chevron { font-size: 18px; color: var(--text-3); transition: transform var(--transition); display: inline-block; }
      .wg-setup-chevron-open { transform: rotate(90deg); }
      .wg-setup-steps { padding: 4px 18px 18px; display: flex; flex-direction: column; gap: 16px; border-top: 1px solid var(--border); }
      .wg-setup-step { display: flex; gap: 14px; align-items: flex-start; padding-top: 14px; }
      .wg-setup-num { width: 24px; height: 24px; border-radius: 50%; background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent-border); font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
      .wg-setup-step-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
      .wg-setup-step-desc { font-size: 12px; color: var(--text-2); line-height: 1.6; }
      .wg-setup-link { font-size: 11px; padding: 2px 8px; border-radius: 3px; background: var(--bg-2); border: 1px solid var(--border); color: var(--accent); text-decoration: none; }
      .wg-setup-link:hover { background: var(--accent-dim); border-color: var(--accent-border); }
      .wg-first-time-tip { font-size: 12px; color: var(--accent); background: var(--accent-dim); border: 1px solid var(--accent-border); border-radius: var(--radius-sm); padding: 8px 12px; margin-bottom: 14px; }
      .wg-no-config-note { font-size: 12px; color: var(--text-3); padding: 16px; text-align: center; }
      .field { margin-bottom: 14px; }
      .field label { display: block; font-size: 11px; font-weight: 500; color: var(--text-2); margin-bottom: 5px; }
      .field input, .field textarea { width: 100%; box-sizing: border-box; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 7px 10px; color: var(--text); font-family: var(--font-mono); font-size: 12px; outline: none; transition: border-color var(--transition); }
      .field input:focus, .field textarea:focus { border-color: var(--accent-border); }
      .field textarea { resize: vertical; min-height: 64px; }
    `;
    document.head.appendChild(s);
  }

  function removeStyles() { document.getElementById(STYLE_ID)?.remove(); }

  // ── Utilities ────────────────────────────────────────────────────────────────

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
    if (secs < 60) return 'Just now';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    return Math.floor(secs / 86400) + 'd ago';
  }

  function isOnline(peer) {
    if (!peer.last_handshake || peer.last_handshake === '0') return false;
    return (Date.now() / 1000 - parseInt(peer.last_handshake, 10)) < 180;
  }

  function copyText(text) {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function triggerDownload(content, filename, type = 'text/plain') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Shared modal wrapper (uses host CSS) ────────────────────────────────────

  function WgModal({ title, width = 400, onClose, children, footer }) {
    useEffect(() => {
      const esc = e => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', esc);
      return () => window.removeEventListener('keydown', esc);
    }, [onClose]);

    return html`
      <div class="modal-overlay" onClick=${e => e.target === e.currentTarget && onClose()}>
        <div class="modal animate-fade-in" style=${{ width, maxWidth: '95vw' }}>
          <div class="modal-header">
            <span class="modal-title">${title}</span>
            <button class="modal-close" onClick=${onClose} aria-label="Close">✕</button>
          </div>
          <div class="modal-body">${children}</div>
          ${footer && html`<div class="modal-footer">${footer}</div>`}
        </div>
      </div>
    `;
  }

  // ── QR / Config modal ────────────────────────────────────────────────────────

  function QRModal({ name, api, isNew, onClose }) {
    const [tab, setTab]         = useState('qr');
    const [loading, setLoading] = useState(true);
    const [qrUrl, setQrUrl]     = useState(null);
    const [config, setConfig]   = useState('');
    const [noConfig, setNoConfig] = useState(false);
    const [copied, setCopied]   = useState(false);

    useEffect(() => {
      let cancelled = false;
      Promise.all([
        api.get('peers/' + encodeURIComponent(name) + '/config')
          .then(d => { if (!cancelled) setConfig(d.config || ''); })
          .catch(() => { if (!cancelled) setNoConfig(true); }),
        api.raw('GET', 'peers/' + encodeURIComponent(name) + '/qr')
          .then(async r => {
            if (!cancelled && r.ok) setQrUrl(URL.createObjectURL(await r.blob()));
          })
          .catch(() => {}),
      ]).finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, [name]);

    const handleCopy = () => {
      copyText(config);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    };

    return html`
      <${WgModal} title=${name + ' — Config'} width=${420} onClose=${onClose}>
        ${isNew && html`
          <div class="wg-first-time-tip">
            Scan this QR with your WireGuard app or download the config file.
          </div>
        `}

        ${noConfig
          ? html`<p class="wg-no-config-note">No config available — this peer uses a client-generated key.</p>`
          : html`
            <div class="wg-tab-row">
              <button class=${'wg-tab' + (tab === 'qr'   ? ' wg-tab-active' : '')} onClick=${() => setTab('qr')}>QR Code</button>
              <button class=${'wg-tab' + (tab === 'conf' ? ' wg-tab-active' : '')} onClick=${() => setTab('conf')}>Config File</button>
            </div>

            ${loading
              ? html`<div style=${{ textAlign: 'center', padding: '32px 0' }}><span class="wg-spin" /></div>`
              : tab === 'qr'
                ? (qrUrl
                    ? html`<img class="wg-qr-img" src=${qrUrl} alt=${'QR for ' + name} />`
                    : html`<p class="wg-no-config-note">QR unavailable — install the <code>qrcode</code> library on the server.</p>`)
                : html`<pre class="wg-conf-pre">${config || '# Config not available'}</pre>`
            }

            <div class="wg-modal-dl">
              <div style=${{ display: 'flex', gap: 6 }}>
                ${!loading && tab === 'conf' && config && html`
                  <button class="btn btn-ghost btn-sm" onClick=${handleCopy}>
                    ${copied ? '✓ Copied' : 'Copy'}
                  </button>
                `}
              </div>
              <div style=${{ display: 'flex', gap: 6 }}>
                ${!loading && tab === 'qr' && qrUrl && html`
                  <a class="btn btn-ghost btn-sm" href=${qrUrl} download=${name + '.png'}>Download PNG</a>
                `}
                ${!loading && config && html`
                  <button class="btn btn-ghost btn-sm"
                    onClick=${() => triggerDownload(config, name + '.conf')}>
                    Download .conf
                  </button>
                `}
              </div>
            </div>
          `
        }
      </${WgModal}>
    `;
  }

  // ── Add Peer modal ───────────────────────────────────────────────────────────

  function AddModal({ api, onClose, onAdded }) {
    const [name, setName]   = useState('');
    const [ip, setIp]       = useState('');
    const [busy, setBusy]   = useState(false);
    const [err, setErr]     = useState('');

    const submit = async () => {
      if (!name.trim()) return;
      setBusy(true); setErr('');
      try {
        const body = { name: name.trim() };
        if (ip.trim()) body.allowed_ips = ip.trim();
        await api.post('peers', body);
        onAdded(name.trim());
      } catch (e) {
        setErr(e.message || 'Failed to add peer');
        setBusy(false);
      }
    };

    return html`
      <${WgModal}
        title="Add Peer"
        onClose=${onClose}
        footer=${html`
          <button class="btn btn-outline btn-md" onClick=${onClose} disabled=${busy}>Cancel</button>
          <button class="btn btn-primary btn-md" onClick=${submit} disabled=${busy || !name.trim()}>
            ${busy ? html`<span class="wg-spin" /> Adding…` : 'Add Peer'}
          </button>
        `}
      >
        <div class="field">
          <label>Peer name</label>
          <input type="text" value=${name} onInput=${e => setName(e.target.value)}
            onKeyDown=${e => e.key === 'Enter' && submit()}
            placeholder="e.g. laptop, phone-ios" autoFocus />
        </div>
        <div class="field" style=${{ marginBottom: 0 }}>
          <label>VPN IP <span style=${{ color: 'var(--text-3)', fontWeight: 400 }}>(optional — auto-assigned if blank)</span></label>
          <input type="text" value=${ip} onInput=${e => setIp(e.target.value)} placeholder="10.8.0.x/32" />
        </div>
        ${err && html`<p style=${{ color: 'var(--err)', fontSize: 12, marginTop: 10 }}>${err}</p>`}
      </${WgModal}>
    `;
  }

  // ── Import Peer modal (client-generated key) ─────────────────────────────────

  function ImportModal({ api, onClose, onDone }) {
    const [name, setName]     = useState('');
    const [pubkey, setPubkey] = useState('');
    const [ip, setIp]         = useState('');
    const [busy, setBusy]     = useState(false);
    const [err, setErr]       = useState('');

    const submit = async () => {
      if (!name.trim() || !pubkey.trim()) return;
      setBusy(true); setErr('');
      try {
        const body = { name: name.trim(), public_key: pubkey.trim() };
        if (ip.trim()) body.allowed_ips = ip.trim();
        await api.post('peers/import', body);
        onDone();
      } catch (e) {
        setErr(e.message || 'Failed to import peer');
        setBusy(false);
      }
    };

    return html`
      <${WgModal}
        title="Import Peer (Client Key)"
        width=${440}
        onClose=${onClose}
        footer=${html`
          <button class="btn btn-outline btn-md" onClick=${onClose} disabled=${busy}>Cancel</button>
          <button class="btn btn-primary btn-md" onClick=${submit} disabled=${busy || !name.trim() || !pubkey.trim()}>
            ${busy ? html`<span class="wg-spin" /> Importing…` : 'Import Peer'}
          </button>
        `}
      >
        <p style=${{ fontSize: 12, color: 'var(--text-2)', marginBottom: 14, marginTop: 0, lineHeight: 1.6 }}>
          Use this when your device has its own WireGuard keypair.
          Paste the device's <strong>public key</strong> — the private key stays on your device.
        </p>
        <div class="field">
          <label>Peer name</label>
          <input type="text" value=${name} onInput=${e => setName(e.target.value)} placeholder="e.g. router, desktop" autoFocus />
        </div>
        <div class="field">
          <label>Public key</label>
          <textarea value=${pubkey} onInput=${e => setPubkey(e.target.value)}
            placeholder="wg pubkey output (44 chars, base64)" style=${{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
        </div>
        <div class="field" style=${{ marginBottom: 0 }}>
          <label>VPN IP <span style=${{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
          <input type="text" value=${ip} onInput=${e => setIp(e.target.value)} placeholder="10.8.0.x/32" />
        </div>
        ${err && html`<p style=${{ color: 'var(--err)', fontSize: 12, marginTop: 10 }}>${err}</p>`}
      </${WgModal}>
    `;
  }

  // ── Rename modal ─────────────────────────────────────────────────────────────

  function RenameModal({ name, api, onClose, onDone }) {
    const [newName, setNewName] = useState(name);
    const [busy, setBusy]       = useState(false);
    const [err, setErr]         = useState('');

    const submit = async () => {
      if (!newName.trim() || newName.trim() === name) { onClose(); return; }
      setBusy(true); setErr('');
      try {
        await api.post('peers/' + encodeURIComponent(name) + '/rename', { new_name: newName.trim() });
        onDone(newName.trim());
      } catch (e) {
        setErr(e.message || 'Rename failed');
        setBusy(false);
      }
    };

    return html`
      <${WgModal}
        title="Rename Peer"
        width=${360}
        onClose=${onClose}
        footer=${html`
          <button class="btn btn-outline btn-md" onClick=${onClose} disabled=${busy}>Cancel</button>
          <button class="btn btn-primary btn-md" onClick=${submit} disabled=${busy || !newName.trim()}>
            ${busy ? html`<span class="wg-spin" /> Saving…` : 'Save'}
          </button>
        `}
      >
        <div class="field" style=${{ marginBottom: 0 }}>
          <label>New name</label>
          <input type="text" value=${newName} onInput=${e => setNewName(e.target.value)}
            onKeyDown=${e => e.key === 'Enter' && submit()} autoFocus />
        </div>
        ${err && html`<p style=${{ color: 'var(--err)', fontSize: 12, marginTop: 10 }}>${err}</p>`}
      </${WgModal}>
    `;
  }

  // ── Peer row ─────────────────────────────────────────────────────────────────

  function PeerRow({ peer, onQr, onDelete, onRename, onToggle, toggling }) {
    const online = isOnline(peer);
    return html`
      <div class=${'wg-peer-row' + (peer.enabled ? '' : ' wg-disabled')}>
        <span class=${'dot ' + (online ? 'dot-ok' : 'dot-dim')} />
        <div>
          <div class="wg-peer-name">
            ${peer.name}
            ${peer.imported && html`<span class="wg-badge">imported</span>`}
            ${!peer.enabled && html`<span class="wg-badge">disabled</span>`}
          </div>
          <div class="wg-peer-meta">
            <span class="wg-peer-ip">${peer.allowed_ips}</span>
            <span>${formatHandshake(peer.last_handshake)}</span>
            ${peer.transfer_rx != null && html`<span>↓ ${formatBytes(peer.transfer_rx)}</span>`}
            ${peer.transfer_tx != null && html`<span>↑ ${formatBytes(peer.transfer_tx)}</span>`}
          </div>
        </div>
        <div class="wg-peer-actions">
          <button class="btn btn-ghost btn-sm"
            onClick=${() => onToggle(peer.name, !peer.enabled)}
            disabled=${toggling === peer.name}
            title=${peer.enabled ? 'Disable peer' : 'Enable peer'}>
            ${toggling === peer.name
              ? html`<span class="wg-spin" />`
              : peer.enabled ? 'Disable' : 'Enable'
            }
          </button>
          ${!peer.imported && html`
            <button class="btn btn-ghost btn-sm" onClick=${() => onQr(peer.name)} title="Show QR / Config">QR</button>
          `}
          <button class="btn btn-ghost btn-sm" onClick=${() => onRename(peer.name)} title="Rename">Rename</button>
          <button class="btn btn-danger btn-sm" onClick=${() => onDelete(peer.name)} title="Remove peer">Remove</button>
        </div>
      </div>
    `;
  }

  // ── Peer list ─────────────────────────────────────────────────────────────────

  function PeerList({ api }) {
    const { toast } = useToast();
    const [peers, setPeers]           = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [addOpen, setAddOpen]       = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [qrTarget, setQrTarget]     = useState(null);
    const [qrIsNew, setQrIsNew]       = useState(false);
    const [deleteTarget, setDelTarget] = useState(null);
    const [renameTarget, setRenameTarget] = useState(null);
    const [toggling, setToggling]     = useState(null);
    const timerRef = useRef(null);

    const fetchPeers = useCallback(async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const data = await api.get('peers');
        setPeers(data);
      } catch (e) {
        if (!silent) toast.err(e.message || 'Failed to load peers');
        if (peers === null) setPeers([]);
      } finally {
        if (!silent) setRefreshing(false);
      }
    }, [api]);

    // Initial load + 30s auto-refresh
    useEffect(() => {
      fetchPeers();
      timerRef.current = setInterval(() => fetchPeers(true), 30000);
      return () => clearInterval(timerRef.current);
    }, [fetchPeers]);

    const handleAdded = (name) => {
      setAddOpen(false);
      setQrTarget(name);
      setQrIsNew(true);
      fetchPeers(true);
      toast.ok('Peer "' + name + '" added');
    };

    const handleImportDone = () => {
      setImportOpen(false);
      fetchPeers(true);
      toast.ok('Peer imported');
    };

    const handleQrClose = () => {
      setQrTarget(null);
      setQrIsNew(false);
    };

    const handleDelete = async (name) => {
      try {
        await api.delete('peers/' + encodeURIComponent(name));
        setDelTarget(null);
        fetchPeers(true);
        toast.ok('Peer "' + name + '" removed');
      } catch (e) {
        toast.err(e.message || 'Failed to remove peer');
      }
    };

    const handleRename = async (oldName, newName) => {
      setRenameTarget(null);
      fetchPeers(true);
      toast.ok('Renamed to "' + newName + '"');
    };

    const handleToggle = async (name, enabled) => {
      setToggling(name);
      try {
        await api.post('peers/' + encodeURIComponent(name) + '/toggle', { enabled });
        fetchPeers(true);
        toast.ok(enabled ? 'Peer "' + name + '" enabled' : 'Peer "' + name + '" disabled');
      } catch (e) {
        toast.err(e.message || 'Toggle failed');
      } finally {
        setToggling(null);
      }
    };

    return html`
      <div class="card">
        <div class="wg-peers-head">
          <div class="card-title" style=${{ margin: 0 }}>VPN Peers</div>
          <div class="wg-peers-btns">
            <button class="btn btn-ghost btn-sm" onClick=${() => fetchPeers()} disabled=${refreshing} title="Refresh">
              ${refreshing ? html`<span class="wg-spin" />` : '⟳'} Refresh
            </button>
            <button class="btn btn-ghost btn-sm" onClick=${() => setImportOpen(true)}>Import Peer</button>
            <button class="btn btn-primary btn-sm" onClick=${() => setAddOpen(true)}>+ Add Peer</button>
          </div>
        </div>

        <div class="wg-peer-list">
          ${peers === null
            ? [0,1,2].map(i => html`
                <div key=${i} class="wg-peer-row" style=${{ pointerEvents: 'none' }}>
                  <span class="dot dot-dim" />
                  <div>
                    <div class="wg-skel" style=${{ width: 110, marginBottom: 8 }} />
                    <div class="wg-skel" style=${{ width: '65%' }} />
                  </div>
                  <div />
                </div>
              `)
            : peers.length === 0
              ? html`
                  <div class="empty">
                    <div class="empty-icon">🔒</div>
                    <div class="empty-title">No peers yet</div>
                    <div class="empty-desc">Add your first VPN peer to get started.</div>
                  </div>
                `
              : peers.map(peer => html`
                  <${PeerRow}
                    key=${peer.public_key}
                    peer=${peer}
                    onQr=${setQrTarget}
                    onDelete=${setDelTarget}
                    onRename=${setRenameTarget}
                    onToggle=${handleToggle}
                    toggling=${toggling}
                  />
                `)
          }
        </div>

        ${addOpen && html`
          <${AddModal} api=${api} onClose=${() => setAddOpen(false)} onAdded=${handleAdded} />
        `}

        ${importOpen && html`
          <${ImportModal} api=${api} onClose=${() => setImportOpen(false)} onDone=${handleImportDone} />
        `}

        ${qrTarget && html`
          <${QRModal} name=${qrTarget} api=${api} isNew=${qrIsNew} onClose=${handleQrClose} />
        `}

        ${renameTarget && html`
          <${RenameModal}
            name=${renameTarget}
            api=${api}
            onClose=${() => setRenameTarget(null)}
            onDone=${(newName) => handleRename(renameTarget, newName)}
          />
        `}

        ${deleteTarget && html`
          <${SdkConfirmModal}
            open=${true}
            title="Remove Peer"
            message=${'Remove peer "' + deleteTarget + '"? VPN access is revoked immediately.'}
            danger=${true}
            onClose=${() => setDelTarget(null)}
            onConfirm=${() => handleDelete(deleteTarget)}
          />
        `}
      </div>
    `;
  }

  // ── Client setup guide ───────────────────────────────────────────────────────

  const SETUP_STEPS = [
    {
      icon: '1',
      title: 'Install WireGuard',
      desc: html`Download the WireGuard app for your device:
        <span style=${{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
          <a class="wg-setup-link" href="https://apps.apple.com/app/wireguard/id1441195209" target="_blank" rel="noopener">iOS App Store</a>
          <a class="wg-setup-link" href="https://play.google.com/store/apps/details?id=com.wireguard.android" target="_blank" rel="noopener">Android Play Store</a>
          <a class="wg-setup-link" href="https://www.wireguard.com/install/" target="_blank" rel="noopener">Windows / macOS / Linux</a>
        </span>`,
    },
    {
      icon: '2',
      title: 'Add a peer',
      desc: html`Click <strong>+ Add Peer</strong>, give it a name (e.g. <em>phone-ios</em>), and submit. The server generates a keypair and assigns a VPN IP automatically.`,
    },
    {
      icon: '3',
      title: 'Scan the QR code',
      desc: html`A QR code appears immediately after adding. In your WireGuard app tap <strong>+</strong> → <em>Scan from QR code</em> and point your camera at it. On desktop, download the <code>.conf</code> file and import it instead.`,
    },
    {
      icon: '4',
      title: 'Connect',
      desc: html`Toggle the tunnel on in the WireGuard app. The peer dot here turns green once the handshake completes (within ~30 seconds).`,
    },
  ];

  function SetupGuide() {
    const [open, setOpen] = useState(false);

    return html`
      <div class="card wg-setup-card" style=${{ marginBottom: 16 }}>
        <button class="wg-setup-toggle" onClick=${() => setOpen(o => !o)}>
          <span style=${{ display:'flex', alignItems:'center', gap:8 }}>
            <span style=${{ fontSize:15 }}>📱</span>
            <span>How to connect a client device</span>
          </span>
          <span class=${'wg-setup-chevron' + (open ? ' wg-setup-chevron-open' : '')}>›</span>
        </button>
        ${open && html`
          <div class="wg-setup-steps">
            ${SETUP_STEPS.map((s, i) => html`
              <div key=${i} class="wg-setup-step">
                <div class="wg-setup-num">${s.icon}</div>
                <div>
                  <div class="wg-setup-step-title">${s.title}</div>
                  <div class="wg-setup-step-desc">${s.desc}</div>
                </div>
              </div>
            `)}
          </div>
        `}
      </div>
    `;
  }

  // ── Server card ───────────────────────────────────────────────────────────────

  function ServerCard({ api }) {
    const { data: info, loading: infoLoading }     = useApi(() => api.get('server/info'),   []);
    const { data: status, loading: statusLoading } = useApi(() => api.get('server/status'), []);
    const [copied, setCopied] = useState(false);

    const handleCopyKey = () => {
      if (info?.public_key) {
        copyText(info.public_key);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    };

    const handleExport = async () => {
      try {
        const resp = await api.raw('GET', 'server/config');
        if (!resp.ok) throw new Error('Failed to fetch config');
        triggerDownload(await resp.text(), 'wg0.conf');
      } catch (e) {
        alert(e.message || 'Export failed');
      }
    };

    const up = status?.up;
    const loading = infoLoading || statusLoading;

    const fields = [
      { key: 'endpoint',   label: 'Endpoint' },
      { key: 'address',    label: 'Interface IP' },
      { key: 'port',       label: 'Port' },
    ];

    return html`
      <div class="card" style=${{ marginBottom: 16 }}>
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div class="card-title" style=${{ margin: 0 }}>Server</div>
          ${loading
            ? html`<div class="wg-skel" style=${{ width: 72, height: 22 }} />`
            : html`
                <span class=${'wg-status-badge ' + (up ? 'wg-status-up' : 'wg-status-down')}>
                  ${up ? '● Online' : '○ Offline'}
                  ${status && html` · ${status.peers_online}/${status.peers_total} peers`}
                </span>
              `
          }
        </div>

        <div class="wg-server-grid">
          ${fields.map(({ key, label }) => html`
            <div key=${key}>
              <div class="wg-stat-label">${label}</div>
              <div class="wg-stat-val">
                ${loading
                  ? html`<div class="wg-skel" style=${{ width: '70%' }} />`
                  : html`${info?.[key] ?? '—'}`
                }
              </div>
            </div>
          `)}
          <div>
            <div class="wg-stat-label">Public Key</div>
            <div class="wg-stat-val" style=${{ alignItems: 'flex-start' }}>
              ${loading
                ? html`<div class="wg-skel" style=${{ width: '90%' }} />`
                : html`
                    <span style=${{ flex: 1, wordBreak: 'break-all' }}>${info?.public_key ?? '—'}</span>
                    ${info?.public_key && html`
                      <button class="wg-copy-btn" onClick=${handleCopyKey} title="Copy public key">
                        ${copied ? '✓' : '⎘'}
                      </button>
                    `}
                  `
              }
            </div>
          </div>
        </div>

        <div class="wg-server-footer">
          <button class="btn btn-ghost btn-sm" onClick=${handleExport} title="Download wg0.conf">
            Export Server Config
          </button>
        </div>
      </div>
    `;
  }

  // ── Root app ──────────────────────────────────────────────────────────────────

  function WireGuardApp({ api }) {
    useEffect(() => {
      injectStyles();
      return removeStyles;
    }, []);

    return html`
      <div class="page">
        <div class="page-header">
          <div>
            <h1 class="page-title">WireGuard VPN</h1>
            <p class="page-desc">Peer management & key distribution</p>
          </div>
        </div>
        <${ServerCard} api=${api} />
        <${SetupGuide} />
        <${PeerList} api=${api} />
      </div>
    `;
  }

  sdk.register('wireguard', WireGuardApp);
})();
