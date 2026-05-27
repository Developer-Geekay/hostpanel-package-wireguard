import { useState, useEffect, useCallback } from 'react';
import { formatBytes, formatHandshake, isOnline } from './utils';
import { AddModal, DeleteModal, QRSheet } from './Modals';

// ── PeerRow ────────────────────────────────────────────────────────────────────
// Uses .dot .dot-ok .dot-dim from host globals.css
// Uses .btn .btn-ghost .btn-danger .btn-sm from host components.css

function PeerRow({ peer, onQr, onDelete }) {
  return (
    <div className="wg-peer-row">
      <span className={`dot ${isOnline(peer) ? 'dot-ok' : 'dot-dim'}`} />
      <div>
        <div className="wg-peer-name">{peer.name}</div>
        <div className="wg-peer-meta">
          <span className="wg-peer-ip">{peer.allowed_ips}</span>
          <span>{formatHandshake(peer.last_handshake)}</span>
          <span>↓ {formatBytes(peer.transfer_rx)}</span>
          <span>↑ {formatBytes(peer.transfer_tx)}</span>
        </div>
      </div>
      <div className="wg-peer-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => onQr(peer.name)}>QR</button>
        <button className="btn btn-danger btn-sm" onClick={() => onDelete(peer.name)}>Remove</button>
      </div>
    </div>
  );
}

// ── Skeleton loading state ─────────────────────────────────────────────────────

function PeerSkeleton() {
  return (
    <>
      {[0, 1, 2].map(i => (
        <div key={i} className="wg-peer-row" style={{ pointerEvents: 'none' }}>
          <span className="dot dot-dim" />
          <div>
            <div className="wg-skel" style={{ width: 120, marginBottom: 8 }} />
            <div className="wg-skel" style={{ width: '70%' }} />
          </div>
          <div />
        </div>
      ))}
    </>
  );
}

// ── PeerList ───────────────────────────────────────────────────────────────────
// Uses .card .card-title .empty .empty-icon .empty-title .empty-desc from host

export default function PeerList({ api, toast }) {
  const [peers,        setPeers]        = useState(null);   // null = loading
  const [addOpen,      setAddOpen]      = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [qrTarget,     setQrTarget]     = useState(null);

  const refresh = useCallback(async () => {
    try {
      setPeers(await api.get('peers'));
    } catch (err) {
      toast(err.message || 'Failed to load peers', 'err');
      setPeers([]);
    }
  }, [api, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="card">
      <div className="wg-peers-head">
        <div className="card-title" style={{ margin: 0 }}>VPN Peers</div>
        <button className="btn btn-primary btn-md" onClick={() => setAddOpen(true)}>
          + Add Peer
        </button>
      </div>

      <div className="wg-peer-list">
        {peers === null ? (
          <PeerSkeleton />
        ) : peers.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🔒</div>
            <div className="empty-title">No peers yet</div>
            <div className="empty-desc">Add your first VPN peer to get started.</div>
          </div>
        ) : (
          peers.map(peer => (
            <PeerRow
              key={peer.name}
              peer={peer}
              onQr={setQrTarget}
              onDelete={setDeleteTarget}
            />
          ))
        )}
      </div>

      {addOpen && (
        <AddModal
          api={api}
          onClose={() => setAddOpen(false)}
          onSuccess={() => { setAddOpen(false); refresh(); toast('Peer added'); }}
          onError={msg => toast(msg, 'err')}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          name={deleteTarget}
          api={api}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => { setDeleteTarget(null); refresh(); toast(`Peer "${deleteTarget}" removed`); }}
          onError={msg => toast(msg, 'err')}
        />
      )}

      {qrTarget && (
        <QRSheet
          name={qrTarget}
          api={api}
          onClose={() => setQrTarget(null)}
          onError={msg => toast(msg, 'err')}
        />
      )}
    </div>
  );
}
