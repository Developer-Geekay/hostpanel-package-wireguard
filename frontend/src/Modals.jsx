import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

// ── Shared portal wrapper ──────────────────────────────────────────────────────
// Renders into document.body so the overlay sits above PackageShell's container.
// Uses host CSS classes: .modal-overlay .modal .modal-header .modal-title
//                        .modal-close .modal-body .modal-footer

function ModalPortal({ title, width = 380, onClose, children, footer }) {
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return createPortal(
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal animate-fade-in" style={{ width }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── Add Peer ───────────────────────────────────────────────────────────────────

export function AddModal({ api, onClose, onSuccess, onError }) {
  const [name, setName]       = useState('');
  const [ip, setIp]           = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const body = { name: name.trim() };
      if (ip.trim()) body.allowed_ips = ip.trim();
      await api.post('peers', body);
      onSuccess();
    } catch (err) {
      onError(err.message || 'Failed to add peer');
      setLoading(false);
    }
  };

  return (
    <ModalPortal
      title="Add Peer"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline btn-md" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-md"
            onClick={submit}
            disabled={loading || !name.trim()}
          >
            {loading ? <><span className="wg-spin" />{' '}Adding…</> : 'Add Peer'}
          </button>
        </>
      }
    >
      {/* host globals.css styles input[type="text"] and label globally */}
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Peer name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="e.g. laptop, phone-ios"
          autoFocus
        />
      </div>
      <div className="field">
        <label>Allowed IPs <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional — auto-assigned if blank)</span></label>
        <input
          type="text"
          value={ip}
          onChange={e => setIp(e.target.value)}
          placeholder="10.66.66.x/32"
        />
      </div>
    </ModalPortal>
  );
}

// ── Delete Peer ────────────────────────────────────────────────────────────────

export function DeleteModal({ name, api, onClose, onSuccess, onError }) {
  const [loading, setLoading] = useState(false);

  const confirm = async () => {
    setLoading(true);
    try {
      await api.delete('peers/' + encodeURIComponent(name));
      onSuccess();
    } catch (err) {
      onError(err.message || 'Failed to remove peer');
      setLoading(false);
    }
  };

  return (
    <ModalPortal
      title="Remove Peer"
      width={360}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline btn-md" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-danger btn-md" onClick={confirm} disabled={loading}>
            {loading ? <><span className="wg-spin" />{' '}Removing…</> : 'Remove'}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.6 }}>
        Remove peer <strong style={{ color: 'var(--text)' }}>{name}</strong>?
        {' '}This will revoke VPN access immediately.
      </p>
    </ModalPortal>
  );
}

// ── QR / Config Sheet ──────────────────────────────────────────────────────────

export function QRSheet({ name, api, onClose, onError }) {
  const [tab, setTab]         = useState('qr');
  const [loading, setLoading] = useState(true);
  const [qrUrl, setQrUrl]     = useState(null);
  const [config, setConfig]   = useState('');

  useEffect(() => {
    Promise.all([
      api.raw('GET', 'peers/' + encodeURIComponent(name) + '/config'),
      api.raw('GET', 'peers/' + encodeURIComponent(name) + '/qr'),
    ]).then(async ([confRes, qrRes]) => {
      if (confRes.ok) { const d = await confRes.json(); setConfig(d.config || ''); }
      if (qrRes.ok)   { setQrUrl(URL.createObjectURL(await qrRes.blob())); }
    }).catch(() => onError('Could not load peer config'))
      .finally(() => setLoading(false));
  }, [name]);  // eslint-disable-line react-hooks/exhaustive-deps

  const dlLink = tab === 'qr' && qrUrl
    ? <a className="btn btn-ghost btn-sm" href={qrUrl} download={name + '.png'}>Download PNG</a>
    : tab === 'conf' && config
    ? <a className="btn btn-ghost btn-sm" href={URL.createObjectURL(new Blob([config], { type: 'text/plain' }))} download={name + '.conf'}>Download .conf</a>
    : null;

  return (
    <ModalPortal title={`${name} — Config`} width={400} onClose={onClose}>
      <div className="wg-tab-row">
        <button className={`wg-tab${tab === 'qr'   ? ' wg-tab-active' : ''}`} onClick={() => setTab('qr')}>QR Code</button>
        <button className={`wg-tab${tab === 'conf' ? ' wg-tab-active' : ''}`} onClick={() => setTab('conf')}>Config File</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <span className="wg-spin" />
        </div>
      ) : tab === 'qr' ? (
        qrUrl
          ? <img className="wg-qr-img" src={qrUrl} alt={`WireGuard QR for ${name}`} />
          : <p style={{ color: 'var(--text-3)', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>
              QR unavailable — install the <code>qrcode</code> library on the server.
            </p>
      ) : (
        <pre className="wg-conf-pre">{config || '# Config not available'}</pre>
      )}

      {dlLink && <div className="wg-dl-row">{dlLink}</div>}
    </ModalPortal>
  );
}
