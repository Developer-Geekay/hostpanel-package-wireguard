import ipaddress
import json
import logging
import os
import subprocess
import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from deps import require_admin
from auth import User

logger = logging.getLogger(__name__)

PLUGIN_MANIFEST = {
    "nav_route": "wireguard",
    "nav_label": "WireGuard",
    "nav_icon": "vpn_lock",
    "nav_section": "my_space",
    "admin_only": True,
    "service": {
        "name": "wireguard",
        "unit": "hostpanel-wireguard",
        "label": "WireGuard VPN",
        "icon": "vpn_lock",
        "can_reload": False,
    },
}

router = APIRouter(prefix="/cpanelapi/wireguard", tags=["WireGuard"])

WG_CONF    = "/etc/wireguard/wg0.conf"
PEERS_DIR  = "/etc/wireguard/peers"
PEERS_META = "/opt/hostpanel/plugins/wireguard/peers.json"
WG_BIN     = "/opt/hostpanel/plugins/wireguard/wg"

# Cache public IP — avoid external call on every /server/info request
_endpoint_cache: dict = {"ip": None, "ts": 0.0}
_ENDPOINT_TTL = 300  # 5 minutes


# ── Models ────────────────────────────────────────────────────────────────────

class PeerInfo(BaseModel):
    name: str
    public_key: str
    allowed_ips: str
    enabled: bool = True
    imported: bool = False
    last_handshake: Optional[str] = None
    transfer_rx: Optional[int] = None
    transfer_tx: Optional[int] = None


class PeerCreateRequest(BaseModel):
    name: str
    allowed_ips: Optional[str] = None


class PeerImportRequest(BaseModel):
    name: str
    public_key: str
    allowed_ips: Optional[str] = None


class PeerRenameRequest(BaseModel):
    new_name: str


class PeerToggleRequest(BaseModel):
    enabled: bool


class ServerInfo(BaseModel):
    public_key: str
    endpoint: str
    address: str
    port: int


class ServerStatus(BaseModel):
    up: bool
    peers_online: int
    peers_total: int
    ip_forward: bool


# ── Internal helpers ──────────────────────────────────────────────────────────

def _run(cmd, input_data=None, check=True):
    return subprocess.run(cmd, input=input_data, capture_output=True, text=True, check=check)


def _read_conf() -> str:
    r = _run(["sudo", "cat", WG_CONF], check=False)
    return r.stdout if r.returncode == 0 else ""


def _write_conf(content: str):
    _run(["sudo", "tee", WG_CONF], input_data=content)
    _run(["sudo", "chmod", "600", WG_CONF])


def _load_meta() -> dict:
    """Load peer metadata. Migrates old {pubkey: name_string} format to new {pubkey: {...}} format."""
    try:
        if os.path.exists(PEERS_META):
            with open(PEERS_META) as f:
                raw = json.load(f)
            migrated = {}
            for k, v in raw.items():
                if isinstance(v, str):
                    migrated[k] = {"name": v, "allowed_ips": None, "enabled": True, "imported": False}
                else:
                    migrated[k] = v
            return migrated
    except Exception:
        pass
    return {}


def _save_meta(meta: dict):
    os.makedirs(os.path.dirname(PEERS_META), exist_ok=True)
    with open(PEERS_META, "w") as f:
        json.dump(meta, f, indent=2)


def _get_server_network() -> tuple:
    try:
        r = subprocess.run(["ip", "-4", "addr", "show", "wg0"], capture_output=True, text=True)
        for line in r.stdout.splitlines():
            if line.strip().startswith("inet "):
                cidr = line.strip().split()[1]
                iface = ipaddress.ip_interface(cidr)
                return str(iface.ip), str(iface.network)
    except Exception:
        pass
    return "10.8.0.1", "10.8.0.0/24"


def _parse_peers_from_conf(conf: str) -> List[dict]:
    """Parse active (non-commented) [Peer] blocks. Each dict has all key=value pairs."""
    peers = []
    current = None
    for line in conf.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            if current and "PublicKey" in current:
                peers.append(current)
                current = None
            continue
        if stripped == "[Peer]":
            if current and "PublicKey" in current:
                peers.append(current)
            current = {}
        elif stripped.startswith("["):
            if current and "PublicKey" in current:
                peers.append(current)
            current = None
        elif current is not None and "=" in stripped:
            key, _, val = stripped.partition("=")
            current[key.strip()] = val.strip()
    if current and "PublicKey" in current:
        peers.append(current)
    return peers


def _remove_peer_block(conf: str, pubkey: str) -> str:
    """Return conf with the [Peer] block matching pubkey removed."""
    lines = conf.splitlines(keepends=True)
    n = len(lines)
    peer_start = None

    for i, line in enumerate(lines):
        if line.strip() != "[Peer]":
            continue
        j = i + 1
        while j < n:
            s = lines[j].strip()
            if not s or s.startswith("["):
                break
            if s.startswith("PublicKey") and "=" in s and s.split("=", 1)[1].strip() == pubkey:
                peer_start = i
                break
            j += 1
        if peer_start is not None:
            break

    if peer_start is None:
        return conf

    peer_end = peer_start + 1
    while peer_end < n:
        if lines[peer_end].strip().startswith("["):
            break
        peer_end += 1
    # Trim trailing blank lines so we don't accumulate empty lines
    while peer_end > peer_start + 1 and not lines[peer_end - 1].strip():
        peer_end -= 1

    return "".join(lines[:peer_start] + lines[peer_end:])


def _get_live_stats() -> dict:
    result = _run(["sudo", WG_BIN, "show", "wg0", "dump"], check=False)
    stats = {}
    if result.returncode != 0:
        return stats
    for line in result.stdout.strip().splitlines()[1:]:  # skip interface line
        parts = line.split("\t")
        if len(parts) >= 7:
            pubkey = parts[0]
            stats[pubkey] = {
                "last_handshake": parts[4] if parts[4] != "0" else None,
                "transfer_rx": int(parts[5]),
                "transfer_tx": int(parts[6]),
            }
    return stats


def _next_free_ip(conf: str, meta: dict) -> str:
    server_ip, subnet = _get_server_network()
    network = ipaddress.ip_network(subnet)
    used = {ipaddress.ip_address(server_ip)}
    # IPs from active peers in conf
    for p in _parse_peers_from_conf(conf):
        try:
            used.add(ipaddress.ip_interface(p["AllowedIPs"]).ip)
        except Exception:
            pass
    # IPs from disabled peers stored only in meta
    for info in meta.values():
        if isinstance(info, dict) and not info.get("enabled", True):
            try:
                used.add(ipaddress.ip_interface(info["allowed_ips"]).ip)
            except Exception:
                pass
    for host in network.hosts():
        if host not in used:
            return str(host)
    raise HTTPException(status_code=400, detail="No free IPs in VPN subnet")


def _get_server_pubkey() -> str:
    result = _run(["sudo", WG_BIN, "show", "wg0", "public-key"], check=False)
    if result.returncode == 0 and result.stdout.strip():
        return result.stdout.strip()
    conf = _read_conf()
    for line in conf.splitlines():
        if line.strip().startswith("PrivateKey"):
            privkey = line.split("=", 1)[1].strip()
            res = _run([WG_BIN, "pubkey"], input_data=privkey + "\n", check=False)
            if res.returncode == 0:
                return res.stdout.strip()
    return ""


def _get_server_endpoint() -> str:
    global _endpoint_cache
    now = time.time()
    if _endpoint_cache["ip"] and (now - _endpoint_cache["ts"]) < _ENDPOINT_TTL:
        ip = _endpoint_cache["ip"]
    else:
        result = _run(["curl", "-s", "--max-time", "3", "https://api.ipify.org"], check=False)
        ip = result.stdout.strip() if result.returncode == 0 and result.stdout.strip() else "YOUR_SERVER_IP"
        _endpoint_cache = {"ip": ip, "ts": now}
    conf = _read_conf()
    port = 51820
    for line in conf.splitlines():
        if line.strip().startswith("ListenPort"):
            try:
                port = int(line.split("=", 1)[1].strip())
            except Exception:
                pass
    return f"{ip}:{port}"


def _peer_name(info) -> str:
    if isinstance(info, dict):
        return info.get("name", "")
    return str(info)


def _find_pubkey_by_name(meta: dict, name: str) -> Optional[str]:
    return next((k for k, v in meta.items() if _peer_name(v) == name), None)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/server/info", response_model=ServerInfo)
async def get_server_info(_: User = Depends(require_admin)):
    conf = _read_conf()
    if not conf:
        raise HTTPException(status_code=503, detail="WireGuard not configured.")
    server_ip, _ = _get_server_network()
    port = 51820
    for line in conf.splitlines():
        if line.strip().startswith("ListenPort"):
            try:
                port = int(line.split("=", 1)[1].strip())
            except Exception:
                pass
    return ServerInfo(
        public_key=_get_server_pubkey(),
        endpoint=_get_server_endpoint(),
        address=server_ip,
        port=port,
    )


def _ip_forward_enabled() -> bool:
    try:
        r = subprocess.run(["cat", "/proc/sys/net/ipv4/ip_forward"], capture_output=True, text=True)
        return r.stdout.strip() == "1"
    except Exception:
        return False


def _get_outbound_iface() -> str:
    r = subprocess.run(["ip", "route", "show", "default"], capture_output=True, text=True)
    parts = r.stdout.split()
    try:
        return parts[parts.index("dev") + 1]
    except (ValueError, IndexError):
        return "eth0"


@router.get("/server/status", response_model=ServerStatus)
async def get_server_status(_: User = Depends(require_admin)):
    up = subprocess.run(["ip", "link", "show", "wg0"], capture_output=True).returncode == 0
    ip_fwd = _ip_forward_enabled()
    meta = _load_meta()
    if not up:
        return ServerStatus(up=False, peers_online=0, peers_total=len(meta), ip_forward=ip_fwd)
    stats = _get_live_stats()
    now = time.time()
    peers = _parse_peers_from_conf(_read_conf())
    online = sum(
        1 for p in peers
        if stats.get(p.get("PublicKey", ""), {}).get("last_handshake")
        and (now - int(stats[p["PublicKey"]]["last_handshake"])) < 180
    )
    return ServerStatus(up=True, peers_online=online, peers_total=len(meta), ip_forward=ip_fwd)


@router.post("/server/fix-routing")
async def fix_routing(_: User = Depends(require_admin)):
    """Enable IP forwarding and update PostUp/PostDown to use the correct outbound interface."""
    iface = _get_outbound_iface()

    # Enable IP forwarding immediately and persist
    subprocess.run(["sudo", "sysctl", "-w", "net.ipv4.ip_forward=1"], capture_output=True)
    subprocess.run(
        ["sudo", "tee", "/etc/sysctl.d/99-wireguard.conf"],
        input="net.ipv4.ip_forward=1\n", text=True, capture_output=True,
    )

    # Rewrite PostUp/PostDown in wg0.conf with correct interface + sysctl
    conf = _read_conf()
    new_lines = []
    for line in conf.splitlines(keepends=True):
        s = line.strip()
        if s.startswith("PostUp"):
            line = (
                f"PostUp = sysctl -w net.ipv4.ip_forward=1; "
                f"iptables -A FORWARD -i wg0 -j ACCEPT; "
                f"iptables -t nat -A POSTROUTING -o {iface} -j MASQUERADE\n"
            )
        elif s.startswith("PostDown"):
            line = (
                f"PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; "
                f"iptables -t nat -D POSTROUTING -o {iface} -j MASQUERADE\n"
            )
        new_lines.append(line)
    _write_conf("".join(new_lines))

    # Restart service so new PostUp/PostDown take effect
    subprocess.run(["sudo", "systemctl", "restart", "hostpanel-wireguard"], capture_output=True)

    return {
        "outbound_iface": iface,
        "ip_forward_enabled": True,
        "conf_updated": True,
        "service_restarted": True,
    }


@router.get("/server/config")
async def export_server_config(_: User = Depends(require_admin)):
    conf = _read_conf()
    if not conf:
        raise HTTPException(status_code=404, detail="No wg0.conf found.")
    return Response(
        content=conf,
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=wg0.conf"},
    )


@router.get("/peers", response_model=List[PeerInfo])
async def list_peers(_: User = Depends(require_admin)):
    conf = _read_conf()
    active_peers = _parse_peers_from_conf(conf)
    stats = _get_live_stats()
    meta = _load_meta()

    result = []
    active_pubkeys = set()

    for p in active_peers:
        pubkey = p.get("PublicKey", "")
        active_pubkeys.add(pubkey)
        s = stats.get(pubkey, {})
        info = meta.get(pubkey, {})
        result.append(PeerInfo(
            name=_peer_name(info) or pubkey[:8],
            public_key=pubkey,
            allowed_ips=p.get("AllowedIPs", ""),
            enabled=True,
            imported=info.get("imported", False) if isinstance(info, dict) else False,
            last_handshake=s.get("last_handshake"),
            transfer_rx=s.get("transfer_rx"),
            transfer_tx=s.get("transfer_tx"),
        ))

    # Include disabled peers (in meta but not in conf)
    for pubkey, info in meta.items():
        if pubkey in active_pubkeys or not isinstance(info, dict):
            continue
        if info.get("enabled", True):
            continue
        result.append(PeerInfo(
            name=info.get("name", pubkey[:8]),
            public_key=pubkey,
            allowed_ips=info.get("allowed_ips", ""),
            enabled=False,
            imported=info.get("imported", False),
        ))

    return result


@router.post("/peers")
async def add_peer(request: PeerCreateRequest, _: User = Depends(require_admin)):
    conf = _read_conf()
    if not conf:
        raise HTTPException(status_code=503, detail="WireGuard not configured")
    meta = _load_meta()
    if _find_pubkey_by_name(meta, request.name):
        raise HTTPException(status_code=409, detail=f"Peer '{request.name}' already exists")

    priv_res = _run([WG_BIN, "genkey"])
    privkey = priv_res.stdout.strip()
    pubkey = _run([WG_BIN, "pubkey"], input_data=privkey + "\n").stdout.strip()

    _run(["sudo", "mkdir", "-p", PEERS_DIR])
    _run(["sudo", "chmod", "700", PEERS_DIR])
    key_file = os.path.join(PEERS_DIR, f"{request.name}.key")
    _run(["sudo", "tee", key_file], input_data=privkey + "\n")
    _run(["sudo", "chmod", "600", key_file])

    allowed_ips = request.allowed_ips or f"{_next_free_ip(conf, meta)}/32"
    peer_block = f"\n[Peer]\nPublicKey = {pubkey}\nAllowedIPs = {allowed_ips}\n"
    _write_conf(conf + peer_block)
    _run(["sudo", WG_BIN, "set", "wg0", "peer", pubkey, "allowed-ips", allowed_ips], check=False)

    meta[pubkey] = {"name": request.name, "allowed_ips": allowed_ips, "enabled": True, "imported": False}
    _save_meta(meta)

    return {"name": request.name, "public_key": pubkey, "allowed_ips": allowed_ips}


@router.post("/peers/import")
async def import_peer(request: PeerImportRequest, _: User = Depends(require_admin)):
    """Register a peer using a client-provided public key (no private key stored server-side)."""
    conf = _read_conf()
    if not conf:
        raise HTTPException(status_code=503, detail="WireGuard not configured")
    meta = _load_meta()
    if _find_pubkey_by_name(meta, request.name):
        raise HTTPException(status_code=409, detail=f"Peer '{request.name}' already exists")
    if request.public_key in meta:
        raise HTTPException(status_code=409, detail="This public key is already registered")

    allowed_ips = request.allowed_ips or f"{_next_free_ip(conf, meta)}/32"
    peer_block = f"\n[Peer]\nPublicKey = {request.public_key}\nAllowedIPs = {allowed_ips}\n"
    _write_conf(conf + peer_block)
    _run(["sudo", WG_BIN, "set", "wg0", "peer", request.public_key, "allowed-ips", allowed_ips], check=False)

    meta[request.public_key] = {
        "name": request.name,
        "allowed_ips": allowed_ips,
        "enabled": True,
        "imported": True,
    }
    _save_meta(meta)
    return {"name": request.name, "public_key": request.public_key, "allowed_ips": allowed_ips}


@router.delete("/peers/{name}")
async def remove_peer(name: str, _: User = Depends(require_admin)):
    meta = _load_meta()
    pubkey = _find_pubkey_by_name(meta, name)
    if not pubkey:
        conf = _read_conf()
        for p in _parse_peers_from_conf(conf):
            if p.get("PublicKey", "")[:8] == name:
                pubkey = p["PublicKey"]
                break
    if not pubkey:
        raise HTTPException(status_code=404, detail=f"Peer '{name}' not found")

    conf = _read_conf()
    _write_conf(_remove_peer_block(conf, pubkey))
    _run(["sudo", WG_BIN, "set", "wg0", "peer", pubkey, "remove"], check=False)
    _run(["sudo", "rm", "-f", os.path.join(PEERS_DIR, f"{name}.key")], check=False)

    meta.pop(pubkey, None)
    _save_meta(meta)
    return {"message": f"Peer '{name}' removed"}


@router.post("/peers/{name}/rename")
async def rename_peer(name: str, request: PeerRenameRequest, _: User = Depends(require_admin)):
    meta = _load_meta()
    pubkey = _find_pubkey_by_name(meta, name)
    if not pubkey:
        raise HTTPException(status_code=404, detail=f"Peer '{name}' not found")
    new_name = request.new_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if _find_pubkey_by_name(meta, new_name) and _find_pubkey_by_name(meta, new_name) != pubkey:
        raise HTTPException(status_code=409, detail=f"Peer '{new_name}' already exists")

    old_key = os.path.join(PEERS_DIR, f"{name}.key")
    new_key = os.path.join(PEERS_DIR, f"{new_name}.key")
    _run(["sudo", "mv", old_key, new_key], check=False)

    info = meta[pubkey]
    if isinstance(info, dict):
        info["name"] = new_name
    else:
        info = {"name": new_name, "allowed_ips": None, "enabled": True, "imported": False}
    meta[pubkey] = info
    _save_meta(meta)
    return {"name": new_name}


@router.post("/peers/{name}/toggle")
async def toggle_peer(name: str, request: PeerToggleRequest, _: User = Depends(require_admin)):
    meta = _load_meta()
    pubkey = _find_pubkey_by_name(meta, name)
    if not pubkey:
        raise HTTPException(status_code=404, detail=f"Peer '{name}' not found")

    info = meta[pubkey]
    if not isinstance(info, dict):
        info = {"name": info, "allowed_ips": None, "enabled": True, "imported": False}

    conf = _read_conf()
    peer_in_conf = next((p for p in _parse_peers_from_conf(conf) if p.get("PublicKey") == pubkey), None)
    allowed_ips = info.get("allowed_ips") or (peer_in_conf.get("AllowedIPs") if peer_in_conf else None)

    if request.enabled:
        if not allowed_ips:
            raise HTTPException(status_code=400, detail="Cannot re-enable: AllowedIPs unknown")
        peer_block = f"\n[Peer]\nPublicKey = {pubkey}\nAllowedIPs = {allowed_ips}\n"
        _write_conf(conf + peer_block)
        _run(["sudo", WG_BIN, "set", "wg0", "peer", pubkey, "allowed-ips", allowed_ips], check=False)
        info["enabled"] = True
    else:
        if peer_in_conf:
            info["allowed_ips"] = peer_in_conf.get("AllowedIPs", allowed_ips)
        _write_conf(_remove_peer_block(conf, pubkey))
        _run(["sudo", WG_BIN, "set", "wg0", "peer", pubkey, "remove"], check=False)
        info["enabled"] = False

    meta[pubkey] = info
    _save_meta(meta)
    return {"name": name, "enabled": request.enabled}


@router.get("/peers/{name}/config")
async def get_peer_config(name: str, _: User = Depends(require_admin)):
    meta = _load_meta()
    pubkey = _find_pubkey_by_name(meta, name)
    if not pubkey:
        raise HTTPException(status_code=404, detail=f"Peer '{name}' not found")

    info = meta.get(pubkey, {})
    if isinstance(info, dict) and info.get("imported"):
        raise HTTPException(status_code=404, detail="No config available — this peer uses a client-generated key")

    key_file = os.path.join(PEERS_DIR, f"{name}.key")
    r = _run(["sudo", "cat", key_file], check=False)
    if r.returncode != 0:
        raise HTTPException(status_code=404, detail="Private key not found for this peer")
    privkey = r.stdout.strip()

    conf = _read_conf()
    peer_in_conf = next((p for p in _parse_peers_from_conf(conf) if p.get("PublicKey") == pubkey), None)
    allowed_ips = (
        (peer_in_conf.get("AllowedIPs") if peer_in_conf else None)
        or (info.get("allowed_ips") if isinstance(info, dict) else None)
        or "0.0.0.0/0"
    )
    peer_ip = allowed_ips.split("/")[0]

    client_conf = (
        f"[Interface]\n"
        f"PrivateKey = {privkey}\n"
        f"Address = {peer_ip}/32\n"
        f"DNS = 1.1.1.1\n\n"
        f"[Peer]\n"
        f"PublicKey = {_get_server_pubkey()}\n"
        f"Endpoint = {_get_server_endpoint()}\n"
        f"AllowedIPs = 0.0.0.0/0\n"
        f"PersistentKeepalive = 25\n"
    )
    return {"name": name, "config": client_conf}


@router.get("/peers/{name}/qr")
async def get_peer_qr(name: str, _: User = Depends(require_admin)):
    config_resp = await get_peer_config(name, _)
    try:
        import io
        import qrcode
        qr = qrcode.make(config_resp["config"])
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        buf.seek(0)
        return Response(content=buf.read(), media_type="image/png")
    except ImportError:
        raise HTTPException(status_code=501, detail="qrcode library not installed on server")
