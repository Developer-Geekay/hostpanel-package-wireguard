import { useState, useEffect } from 'react';

const FIELDS = [
  { key: 'endpoint',   label: 'Endpoint' },
  { key: 'address',    label: 'Interface IP' },
  { key: 'port',       label: 'Port' },
  { key: 'public_key', label: 'Public Key' },
];

export default function ServerCard({ api }) {
  const [info, setInfo] = useState(null);
  const [err,  setErr]  = useState(false);

  useEffect(() => {
    api.get('server/info').then(setInfo).catch(() => setErr(true));
  }, [api]);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">Server</div>
      <div className="wg-info-grid">
        {FIELDS.map(({ key, label }) => (
          <div key={key}>
            <div className="wg-info-key">{label}</div>
            {err ? (
              <div className="wg-info-val" style={{ color: 'var(--text-3)' }}>Unavailable</div>
            ) : info ? (
              <div className="wg-info-val">{String(info[key] ?? '-')}</div>
            ) : (
              <div className="wg-skel" style={{ width: key === 'public_key' ? '90%' : '55%' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
