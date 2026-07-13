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
  const { html, useState, useEffect, useCallback, useRef, useMemo } = sdk;
  const { SdkConfirmModal } = sdk.components;
  const { useApi, useToast } = sdk.hooks;

  // ── Styles ──────────────────────────────────────────────────────────────────

  const STYLE_ID = 'wg-plugin-styles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      .wg-copy-btn { background: none; border: none; cursor: pointer; color: var(--text-3); padding: 2px 4px; border-radius: 3px; font-size: 10px; line-height: 1; }
      .wg-copy-btn:hover { color: var(--accent); background: var(--accent-dim); }
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

  // formats epoch handshake time
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
            <div class="tab-bar" style=${{ padding: 0, marginBottom: 12 }}>
              <button class=${'tab' + (tab === 'qr'   ? ' active' : '')} onClick=${() => setTab('qr')}>QR Code</button>
              <button class=${'tab' + (tab === 'conf' ? ' active' : '')} onClick=${() => setTab('conf')}>Config File</button>
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
          <input type="text" class="input" value=${newName} onInput=${e => setNewName(e.target.value)}
            onKeyDown=${e => e.key === 'Enter' && submit()} autoFocus />
        </div>
        ${err && html`<p style=${{ color: 'var(--err)', fontSize: 12, marginTop: 10 }}>${err}</p>`}
      </${WgModal}>
    `;
  }

  // ── Sidebar creation forms ────────────────────────────────────────────────────

  function CreatePeerPanel({ api, onAdded, onImportDone }) {
    const [createTab, setCreateTab] = useState('add');

    // Add form state
    const [name, setName] = useState('');
    const [ip, setIp]     = useState('');
    const [addBusy, setAddBusy] = useState(false);
    const [addErr, setAddErr]   = useState('');

    // Import form state
    const [importName, setImportName] = useState('');
    const [importPubkey, setImportPubkey] = useState('');
    const [importIp, setImportIp]     = useState('');
    const [importBusy, setImportBusy] = useState(false);
    const [importErr, setImportErr]   = useState('');

    const handleAddSubmit = async (e) => {
      e.preventDefault();
      if (!name.trim()) return;
      setAddBusy(true); setAddErr('');
      try {
        const body = { name: name.trim() };
        if (ip.trim()) body.allowed_ips = ip.trim();
        await api.post('peers', body);
        onAdded(name.trim());
        setName(''); setIp('');
      } catch (err) {
        setAddErr(err.message || 'Failed to add peer');
      } finally {
        setAddBusy(false);
      }
    };

    const handleImportSubmit = async (e) => {
      e.preventDefault();
      if (!importName.trim() || !importPubkey.trim()) return;
      setImportBusy(true); setImportErr('');
      try {
        const body = { name: importName.trim(), public_key: importPubkey.trim() };
        if (importIp.trim()) body.allowed_ips = importIp.trim();
        await api.post('peers/import', body);
        onImportDone(importName.trim());
        setImportName(''); setImportPubkey(''); setImportIp('');
      } catch (err) {
        setImportErr(err.message || 'Failed to import peer');
      } finally {
        setImportBusy(false);
      }
    };

    return html`
      <div class="split-left" style=${{ width: 320, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span class="section-label">Create Peer</span>
        
        <div class="tab-bar" style=${{ padding: 0, marginBottom: 12 }}>
          <div class=${'tab ' + (createTab === 'add' ? 'active' : '')} onClick=${() => setCreateTab('add')}>Add New</div>
          <div class=${'tab ' + (createTab === 'import' ? 'active' : '')} onClick=${() => setCreateTab('import')}>Import Key</div>
        </div>

        ${createTab === 'add' ? html`
          <form onSubmit=${handleAddSubmit} style=${{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div class="field">
              <label>Peer name</label>
              <input type="text" class="input" value=${name} onInput=${e => setName(e.target.value)} placeholder="e.g. phone-ios" required />
            </div>
            <div class="field">
              <label>VPN IP Address <span style=${{ textTransform: 'lowercase', opacity: 0.7 }}>(optional)</span></label>
              <input type="text" class="input" value=${ip} onInput=${e => setIp(e.target.value)} placeholder="e.g. 10.8.0.2/32" />
            </div>
            ${addErr && html`<p style=${{ color: 'var(--err)', fontSize: 12, marginTop: 4 }}>${addErr}</p>`}
            <button type="submit" class="btn btn-primary btn-sm" disabled=${addBusy || !name.trim()}>
              ${addBusy ? 'Adding Peer…' : 'Add Peer'}
            </button>
          </form>
        ` : html`
          <form onSubmit=${handleImportSubmit} style=${{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div class="field">
              <label>Peer name</label>
              <input type="text" class="input" value=${importName} onInput=${e => setImportName(e.target.value)} placeholder="e.g. router" required />
            </div>
            <div class="field">
              <label>Public Key</label>
              <textarea class="input" value=${importPubkey} onInput=${e => setImportPubkey(e.target.value)} placeholder="wg public key (base64)" required style=${{ height: 60, fontFamily: 'var(--font-mono)', fontSize: 11 }} />
            </div>
            <div class="field">
              <label>VPN IP Address <span style=${{ textTransform: 'lowercase', opacity: 0.7 }}>(optional)</span></label>
              <input type="text" class="input" value=${importIp} onInput=${e => setImportIp(e.target.value)} placeholder="e.g. 10.8.0.3/32" />
            </div>
            ${importErr && html`<p style=${{ color: 'var(--err)', fontSize: 12, marginTop: 4 }}>${importErr}</p>`}
            <button type="submit" class="btn btn-primary btn-sm" disabled=${importBusy || !importName.trim() || !importPubkey.trim()}>
              ${importBusy ? 'Importing…' : 'Import Peer'}
            </button>
          </form>
        `}
      </div>
    `;
  }

  // ── Peer list table ───────────────────────────────────────────────────────────

  function PeerListTable({ api, peers, refreshing, fetchPeers, toggling, setToggling, onShowConfig }) {
    const toast = useToast();
    const [deleteTarget, setDelTarget] = useState(null);
    const [renameTarget, setRenameTarget] = useState(null);

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

    const handleRename = async (newName) => {
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
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div class="card-title" style=${{ margin: 0 }}>VPN Peers</div>
          <button class="btn btn-ghost btn-sm" onClick=${() => fetchPeers()} disabled=${refreshing} title="Refresh">
            ${refreshing ? html`<span class="wg-spin" />` : '⟳'} Refresh
          </button>
        </div>

        <div class="table-wrap">
          <table style=${{ tableLayout: 'fixed', width: '100%', minWidth: '960px' }}>
            <thead>
              <tr>
                <th style=${{ width: 60, textAlign: 'center' }}>Status</th>
                <th>Name</th>
                <th style=${{ width: 130 }}>VPN IP</th>
                <th style=${{ width: 110 }}>Last Active</th>
                <th style=${{ width: 95 }}>Received</th>
                <th style=${{ width: 95 }}>Sent</th>
                <th style=${{ width: 260, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${peers === null
                ? [0,1,2].map(i => html`
                    <tr key=${i}>
                      <td style=${{ textAlign: 'center' }}><span class="dot dot-dim" /></td>
                      <td><div class="wg-skel" style=${{ width: 100 }} /></td>
                      <td><div class="wg-skel" style=${{ width: 80 }} /></td>
                      <td><div class="wg-skel" style=${{ width: 60 }} /></td>
                      <td><div class="wg-skel" style=${{ width: 50 }} /></td>
                      <td><div class="wg-skel" style=${{ width: 50 }} /></td>
                      <td></td>
                    </tr>
                  `)
                : peers.length === 0
                  ? html`
                      <tr>
                        <td colSpan="7">
                          <div class="empty">
                            <div class="empty-icon">🔒</div>
                            <div class="empty-title">No peers yet</div>
                            <div class="empty-desc">Create your first VPN peer in the left sidebar to connect a device.</div>
                          </div>
                        </td>
                      </tr>
                    `
                  : peers.map(peer => {
                      const online = isOnline(peer);
                      return html`
                        <tr key=${peer.public_key} style=${{ opacity: peer.enabled ? 1 : 0.55 }}>
                          <td style=${{ textAlign: 'center' }}>
                            <span class=${'dot ' + (online ? 'dot-ok' : 'dot-dim')} style=${{ display: 'inline-block', margin: '0 auto' }} />
                          </td>
                          <td>
                            <div style=${{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style=${{ fontWeight: 500, color: 'var(--text)' }}>${peer.name}</span>
                              ${peer.imported && html`<span class="chip chip-gray" style=${{ padding: '0 6px', fontSize: 10 }}>imported</span>`}
                              ${!peer.enabled && html`<span class="chip chip-red" style=${{ padding: '0 6px', fontSize: 10 }}>disabled</span>`}
                            </div>
                          </td>
                          <td class="mono" style=${{ color: 'var(--accent)', fontSize: 12.5 }}>${peer.allowed_ips}</td>
                          <td style=${{ color: 'var(--text-2)', fontSize: 12 }}>${formatHandshake(peer.last_handshake)}</td>
                          <td class="mono" style=${{ color: 'var(--text-2)', fontSize: 12 }}>${peer.transfer_rx != null ? formatBytes(peer.transfer_rx) : '—'}</td>
                          <td class="mono" style=${{ color: 'var(--text-2)', fontSize: 12 }}>${peer.transfer_tx != null ? formatBytes(peer.transfer_tx) : '—'}</td>
                          <td style=${{ textAlign: 'right' }}>
                            <div style=${{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button class="btn btn-ghost btn-xs"
                                onClick=${() => handleToggle(peer.name, !peer.enabled)}
                                disabled=${toggling === peer.name}
                              >
                                ${toggling === peer.name ? '…' : peer.enabled ? 'Disable' : 'Enable'}
                              </button>
                              ${!peer.imported && html`
                                <button class="btn btn-ghost btn-xs" onClick=${() => onShowConfig(peer.name)}>Config</button>
                              `}
                              <button class="btn btn-ghost btn-xs" onClick=${() => setRenameTarget(peer.name)}>Rename</button>
                              <button class="btn btn-danger btn-xs" onClick=${() => setDelTarget(peer.name)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      `;
                    })
              }
            </tbody>
          </table>
        </div>

        ${renameTarget && html`
          <${RenameModal}
            name=${renameTarget}
            api=${api}
            onClose=${() => setRenameTarget(null)}
            onDone=${handleRename}
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
      desc: html`Use the left sidebar panel to add a peer name. The server will auto-assign its VPN IP address.`,
    },
    {
      icon: '3',
      title: 'Scan the QR code / Import Config',
      desc: html`An interactive config popup will appear immediately. In your WireGuard app, scan the QR code using your camera, or import/download the generated <code>.conf</code> file.`,
    },
    {
      icon: '4',
      title: 'Connect',
      desc: html`Toggle the tunnel on. The peer status turns green once the handshake completes (within ~30 seconds).`,
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
    const { data: status, loading: statusLoading, refetch: refetchStatus } = useApi(() => api.get('server/status'), []);
    const [copied,  setCopied]  = useState(false);
    const [fixing,  setFixing]  = useState(false);
    const [syncing, setSyncing] = useState(false);
    const toast = useToast();

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
        toast.err(e.message || 'Export failed');
      }
    };

    const handleFixRouting = async () => {
      setFixing(true);
      try {
        const r = await api.post('server/fix-routing', {});
        toast.ok('Routing fixed — IP forwarding enabled, nginx reloaded on iface ' + r.outbound_iface);
        refetchStatus();
      } catch (e) {
        toast.err(e.message || 'Fix failed');
      } finally {
        setFixing(false);
      }
    };

    const handleSync = async () => {
      setSyncing(true);
      try {
        const r = await api.post('server/sync-peers', {});
        if (r.re_added > 0) {
          toast.ok(`Conf restored — ${r.re_added} peer(s) re-added to wg0.conf`);
        } else {
          toast.ok('All peers already present in conf — nothing to restore');
        }
        refetchStatus();
      } catch (e) {
        toast.err(e.message || 'Sync failed');
      } finally {
        setSyncing(false);
      }
    };

    const up = status?.up;
    const ipFwd = status?.ip_forward;
    const loading = infoLoading || statusLoading;

    return html`
      <div>
        <div class="stat-grid-4" style=${{ marginBottom: 16 }}>
          <!-- Status Card -->
          <div class="stat-card" style=${{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div class="stat-label">Status</div>
            <div class="stat-value" style=${{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 18, marginBottom: 0 }}>
              <span class=${'dot ' + (up ? 'dot-ok' : 'dot-dim')} style=${{ flexShrink: 0 }} />
              <span style=${{ textTransform: 'capitalize' }}>${loading ? 'Loading…' : up ? 'online' : 'offline'}</span>
            </div>
            <div class="stat-sub">
              ${status ? status.peers_online + ' / ' + status.peers_total + ' peers active' : '—'}
            </div>
          </div>

          <!-- Endpoint Card -->
          <div class="stat-card" style=${{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div class="stat-label">Endpoint</div>
            <div class="stat-value" style=${{ fontSize: 16, fontFamily: 'var(--font-mono)', marginBottom: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ${loading ? '—' : info?.endpoint ?? '—'}
            </div>
            <div class="stat-sub">
              Port ${info?.port ?? '—'}
            </div>
          </div>

          <!-- Interface IP Card -->
          <div class="stat-card" style=${{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div class="stat-label">Interface IP</div>
            <div class="stat-value" style=${{ fontSize: 16, fontFamily: 'var(--font-mono)', marginBottom: 0 }}>
              ${loading ? '—' : info?.address ?? '—'}
            </div>
            <div class="stat-sub">
              IPv4 Tunnel
            </div>
          </div>

          <!-- Public Key Card -->
          <div class="stat-card" style=${{ display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
            <div class="stat-label" style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Public Key</span>
              ${info?.public_key && html`
                <button class="wg-copy-btn" onClick=${handleCopyKey} title="Copy public key">
                  ${copied ? '✓' : '⎘'}
                </button>
              `}
            </div>
            <div class="stat-value mono" style=${{ fontSize: 12, wordBreak: 'break-all', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 0 }} title=${info?.public_key}>
              ${loading ? '—' : info?.public_key ?? '—'}
            </div>
            <div class="stat-sub">
              Server identity
            </div>
          </div>
        </div>

        ${!loading && up && ipFwd === false && html`
          <div class="inline-alert alert-amber animate-fade-in" style=${{ marginBottom: 16 }}>
            <span style=${{ flex: 1 }}>⚠ IP forwarding is disabled — peers cannot route internet traffic through this VPN.</span>
            <button class="btn btn-success btn-xs" style=${{ flexShrink: 0 }}
              onClick=${handleFixRouting} disabled=${fixing}>
              ${fixing ? html`<span class="wg-spin" /> Fixing…` : 'Fix Now'}
            </button>
          </div>
        `}

        <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
          <button class="btn btn-ghost btn-sm" onClick=${handleSync} disabled=${syncing} title="Re-add peers from DB into wg0.conf">
            ${syncing ? 'Syncing Conf…' : 'Sync Peers to Conf'}
          </button>
          <button class="btn btn-ghost btn-sm" onClick=${handleExport} title="Download wg0.conf">
            Export Server Config
          </button>
        </div>
      </div>
    `;
  }

  // ── Root app ──────────────────────────────────────────────────────────────────

  function WireGuardApp({ api }) {
    const toast = useToast();
    const [peers, setPeers]           = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [toggling, setToggling]     = useState(null);
    const [selectedPeerName, setSelectedPeerName] = useState(null);
    const [addingNew, setAddingNew] = useState(false);
    const [search, setSearch] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [renameTarget, setRenameTarget] = useState(null);
    const [formName, setFormName] = useState('');
    const [formIp, setFormIp] = useState('');
    const [formBusy, setFormBusy] = useState(false);
    const [formErr, setFormErr] = useState('');

    const [qrTarget, setQrTarget] = useState(null);
    const [qrIsNew, setQrIsNew]   = useState(false);

    const { data: status, loading: statusLoading, refetch: refetchStatus } = useApi(() => api.get('server/status'), []);
    const { data: info } = useApi(() => api.get('server/info'), []);

    const selectedPeer = useMemo(() => {
      return (peers || []).find(p => p.name === selectedPeerName) || null;
    }, [peers, selectedPeerName]);

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

    useEffect(() => {
      fetchPeers();
      const interval = setInterval(() => fetchPeers(true), 30000);
      return () => clearInterval(interval);
    }, [fetchPeers]);

    useEffect(() => {
      injectStyles();
      return removeStyles;
    }, []);

    const handleAddSubmit = async (e) => {
      e.preventDefault();
      if (!formName.trim()) return;
      setFormBusy(true); setFormErr('');
      try {
        const body = { name: formName.trim() };
        if (formIp.trim()) body.allowed_ips = formIp.trim();
        await api.post('peers', body);
        setQrTarget(formName.trim()); setQrIsNew(true);
        setAddingNew(false); setFormName(''); setFormIp('');
        fetchPeers(true);
        toast.ok('Peer "' + formName.trim() + '" added');
      } catch (err) {
        setFormErr(err.message || 'Failed to add peer');
      } finally {
        setFormBusy(false);
      }
    };

    const handleDelete = async (name) => {
      try {
        await api.delete('peers/' + encodeURIComponent(name));
        setDeleteTarget(null); setSelectedPeerName(null);
        fetchPeers(true);
        toast.ok('Peer "' + name + '" removed');
      } catch (e) { toast.err(e.message || 'Failed to remove peer'); }
    };

    const handleRename = async (newName) => {
      setRenameTarget(null); fetchPeers(true);
      toast.ok('Renamed to "' + newName + '"');
    };

    const handleToggle = async (name, enabled) => {
      setToggling(name);
      try {
        await api.post('peers/' + encodeURIComponent(name) + '/toggle', { enabled });
        fetchPeers(true);
        toast.ok(enabled ? 'Peer "' + name + '" enabled' : 'Peer "' + name + '" disabled');
      } catch (e) { toast.err(e.message || 'Toggle failed'); }
      finally { setToggling(null); }
    };

    const up = status?.up;
    const filteredPeers = (peers || []).filter(p =>
      !search.trim() || p.name.toLowerCase().includes(search.toLowerCase())
    );

    const getPeerDot = (peer) => {
      if (!peer.enabled) return { color: '#6b7280', shadow: 'none', label: 'disabled', chipClass: 'chip-gray' };
      const online = isOnline(peer);
      const idle = peer.last_handshake && peer.last_handshake !== '0' && !online;
      if (online) return { color: '#22c55e', shadow: '0 0 6px #22c55e88', label: 'active', chipClass: 'chip-green' };
      if (idle) return { color: '#f59e0b', shadow: '0 0 6px #f59e0b44', label: 'idle', chipClass: 'chip-amber' };
      return { color: '#6b7280', shadow: 'none', label: 'never', chipClass: 'chip-gray' };
    };

    return html`
      <div class="page" style=${{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', padding: '24px' }}>
        
        <div class="page-header" style=${{ flexShrink: 0, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 class="page-title">WireGuard VPN</h1>
            <p class="page-desc">${info?.interface || 'wg0'} · ${info?.address || '—'} · ${(peers || []).length} peers</p>
          </div>
          <div style=${{ display: 'flex', gap: 8 }}>
            <button class="btn btn-primary btn-sm" onClick=${() => { setAddingNew(true); setSelectedPeerName(null); }}>
              + Add Peer
            </button>
          </div>
        </div>

        <!-- Interface Status Bar -->
        <div class="card" style=${{ padding: '10px 16px', marginBottom: 14, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style=${{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style=${{ width: 7, height: 7, borderRadius: '50%', background: up ? '#22c55e' : '#6b7280', boxShadow: up ? '0 0 6px #22c55e88' : 'none' }}></div>
            <span class="mono" style=${{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>${info?.interface || 'wg0'}</span>
            <span style=${{ fontSize: 12, color: 'var(--text-3)' }}>${statusLoading ? '…' : up ? 'running' : 'offline'}</span>
          </div>
          <div style=${{ color: 'var(--border)', userSelect: 'none' }}>|</div>
          <div style=${{ fontSize: 12, color: 'var(--text-3)' }}>Port <span class="mono" style=${{ color: 'var(--text-2)' }}>${info?.port || '—'}</span></div>
          <div style=${{ color: 'var(--border)', userSelect: 'none' }}>|</div>
          <div style=${{ fontSize: 12, color: 'var(--text-3)' }}>Subnet <span class="mono" style=${{ color: 'var(--text-2)' }}>${info?.address || '—'}</span></div>
          <div style=${{ color: 'var(--border)', userSelect: 'none' }}>|</div>
          <div style=${{ fontSize: 12, color: 'var(--text-3)' }}>
            ↑ ${formatBytes((peers || []).reduce((a, p) => a + (p.transfer_tx || 0), 0))}
            &nbsp;↓ ${formatBytes((peers || []).reduce((a, p) => a + (p.transfer_rx || 0), 0))}
          </div>
          <div style=${{ marginLeft: 'auto' }}>
            <button class="btn btn-ghost btn-xs" onClick=${() => fetchPeers()} disabled=${refreshing}>
              ${refreshing ? '…' : '⟳'} Refresh
            </button>
          </div>
        </div>

        <div class="split-view" style=${{ flex: 1, minHeight: 0 }}>
          
          <!-- Left Panel: Peer List -->
          <div class="split-left" style=${{ width: 270, display: 'flex', flexDirection: 'column' }}>
            <div style=${{ padding: '0 12px 8px' }}>
              <input
                class="search-input"
                type="text"
                placeholder="Search peers…"
                value=${search}
                onInput=${e => setSearch(e.target.value)}
                style=${{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div class="split-scroll" style=${{ flex: 1, overflowY: 'auto' }}>
              ${peers === null
                ? html`<div style=${{ color: 'var(--text-3)', padding: 20, textAlign: 'center', fontSize: 12.5 }}>Loading…</div>`
                : filteredPeers.length === 0
                ? html`
                    <div class="empty" style=${{ padding: '32px 16px' }}>
                      <div class="empty-icon">🔒</div>
                      <div class="empty-title">No peers</div>
                      <div class="empty-desc" style=${{ fontSize: 11 }}>Click "+ Add Peer" to connect a device.</div>
                    </div>`
                : filteredPeers.map(peer => {
                    const dot = getPeerDot(peer);
                    const isSelected = selectedPeerName === peer.name;
                    return html`
                      <div
                        key=${peer.name}
                        class=${'list-item ' + (isSelected ? 'sel' : '')}
                        onClick=${() => { setSelectedPeerName(peer.name); setAddingNew(false); }}
                        style=${{ opacity: peer.enabled ? 1 : 0.6 }}
                      >
                        <div style=${{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                          <div style=${{
                            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                            background: dot.color, boxShadow: dot.shadow,
                          }}></div>
                          <div style=${{ flex: 1, minWidth: 0 }}>
                            <div class="li-name" style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${peer.name}</div>
                            <div class="li-sub" style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              ${peer.allowed_ips || '—'} · ${formatHandshake(peer.last_handshake)}
                            </div>
                          </div>
                          <span class=${'chip ' + dot.chipClass} style=${{ fontSize: 10 }}>${dot.label}</span>
                        </div>
                      </div>`;
                  })}
            </div>
          </div>

          <!-- Right Panel -->
          <div class="split-right" style=${{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            ${addingNew ? html`
              <div class="animate-fade-in" style=${{ flex: 1, overflow: 'auto', padding: 24 }}>
                <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div>
                    <div style=${{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>New Peer</div>
                    <div style=${{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Key pair auto-generated on the server</div>
                  </div>
                  <button class="btn btn-ghost btn-sm" onClick=${() => setAddingNew(false)}>✕</button>
                </div>
                <form onSubmit=${handleAddSubmit} style=${{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480 }}>
                  <div>
                    <label style=${{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Peer Name</label>
                    <input class="search-input" style=${{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. phone-ios" value=${formName} onInput=${e => setFormName(e.target.value)} required />
                  </div>
                  <div>
                    <label style=${{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Assigned IP (optional)</label>
                    <input class="search-input" style=${{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. 10.8.0.2/32 — leave empty for auto" value=${formIp} onInput=${e => setFormIp(e.target.value)} />
                  </div>
                  ${formErr && html`<div style=${{ color: 'var(--err)', fontSize: 12 }}>${formErr}</div>`}
                  <div style=${{ display: 'flex', gap: 10 }}>
                    <button type="submit" class="btn btn-primary btn-sm" disabled=${formBusy || !formName.trim()}>
                      ${formBusy ? 'Adding…' : 'Add Peer'}
                    </button>
                    <button type="button" class="btn btn-outline btn-sm" onClick=${() => setAddingNew(false)}>Cancel</button>
                  </div>
                </form>
              </div>

            ` : selectedPeer ? html`
              <div class="animate-fade-in" style=${{ flex: 1, overflow: 'auto', padding: 24 }}>
                ${(() => {
                  const dot = getPeerDot(selectedPeer);
                  return html`
                    <div style=${{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
                      <div>
                        <div style=${{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style=${{ width: 8, height: 8, borderRadius: '50%', background: dot.color, boxShadow: dot.shadow }}></div>
                          <span style=${{ fontSize: 17, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.4px' }}>${selectedPeer.name}</span>
                          <span class=${'chip ' + dot.chipClass}>${dot.label}</span>
                        </div>
                        <div style=${{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, marginLeft: 18 }}>
                          ${selectedPeer.allowed_ips || '—'} · Last handshake: ${formatHandshake(selectedPeer.last_handshake)}
                        </div>
                      </div>
                      <div style=${{ display: 'flex', gap: 6 }}>
                        ${!selectedPeer.imported && html`
                          <button class="btn btn-outline btn-sm" onClick=${() => { setQrTarget(selectedPeer.name); setQrIsNew(false); }}>
                            🔲 Show QR
                          </button>`}
                        <button class="btn btn-danger btn-sm" onClick=${() => setDeleteTarget(selectedPeer.name)}>🗑 Revoke</button>
                      </div>
                    </div>`;
                })()}

                <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  <div class="stat-card">
                    <div class="stat-label">Transfer ↑</div>
                    <div class="stat-value">${formatBytes(selectedPeer.transfer_tx)}</div>
                    <div class="stat-sub">uploaded</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Transfer ↓</div>
                    <div class="stat-value">${formatBytes(selectedPeer.transfer_rx)}</div>
                    <div class="stat-sub">downloaded</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Last Handshake</div>
                    <div class="stat-value" style=${{ fontSize: 18 }}>${formatHandshake(selectedPeer.last_handshake)}</div>
                    <div class="stat-sub">${isOnline(selectedPeer) ? 'active now' : 'idle'}</div>
                  </div>
                </div>

                <div class="card" style=${{ padding: 16, marginBottom: 14 }}>
                  <div style=${{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>Peer Details</div>
                  <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    ${[
                      ['Public Key', selectedPeer.public_key || '—', true],
                      ['Endpoint', selectedPeer.endpoint || 'n/a', true],
                      ['Allowed IPs', selectedPeer.allowed_ips || '—', true],
                      ['Keepalive', selectedPeer.persistent_keepalive ? selectedPeer.persistent_keepalive + 's' : 'off', false],
                      ['Type', selectedPeer.imported ? 'Imported' : 'Server-generated', false],
                      ['Enabled', selectedPeer.enabled ? 'Yes' : 'No', false],
                    ].map(([k, v, mono], i) => html`
                      <div key=${k} style=${{ display: 'flex', justifyContent: 'space-between', padding: '8px ' + (i % 2 === 1 ? '0 8px 24px' : '0'), borderBottom: i < 4 ? '1px solid var(--border)' : 'none', gap: 8 }}>
                        <span style=${{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>${k}</span>
                        <span style=${{ fontSize: 12, color: 'var(--text-2)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>${v}</span>
                      </div>`)}
                  </div>
                </div>

                <div style=${{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    class="btn btn-outline btn-sm"
                    onClick=${() => handleToggle(selectedPeer.name, !selectedPeer.enabled)}
                    disabled=${toggling === selectedPeer.name}
                  >${toggling === selectedPeer.name ? '…' : selectedPeer.enabled ? '⏸ Disable' : '▶ Enable'}</button>
                  <button class="btn btn-ghost btn-sm" onClick=${() => setRenameTarget(selectedPeer.name)}>✎ Rename</button>
                </div>
              </div>

            ` : html`
              <div class="animate-fade-in" style=${{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
                <${ServerCard} api=${api} />
                <${SetupGuide} />
              </div>`}
          </div>
        </div>

        ${qrTarget && html`
          <${QRModal} name=${qrTarget} api=${api} isNew=${qrIsNew} onClose=${() => { setQrTarget(null); setQrIsNew(false); }} />
        `}
        ${deleteTarget && html`
          <${SdkConfirmModal}
            open=${true}
            title="Revoke Peer"
            message=${'Remove peer "' + deleteTarget + '"? VPN access is revoked immediately.'}
            danger=${true}
            onClose=${() => setDeleteTarget(null)}
            onConfirm=${() => handleDelete(deleteTarget)}
          />`}
        ${renameTarget && html`
          <${RenameModal}
            name=${renameTarget}
            api=${api}
            onClose=${() => setRenameTarget(null)}
            onDone=${handleRename}
          />`}
      </div>
    `;
  }

  sdk.register('wireguard', WireGuardApp);
})();
