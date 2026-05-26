import ipaddress
import json
import logging
import os
import subprocess
import tempfile
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


class PeerInfo(BaseModel):
    name: str
    public_key: str
    allowed_ips: str
    last_handshake: Optional[str] = None
    transfer_rx: Optional[int] = None
    transfer_tx: Optional[int] = None


class PeerCreateRequest(BaseModel):
    name: str
    allowed_ips: Optional[str] = None


class ServerInfo(BaseModel):
    public_key: str
    endpoint: str
    address: str
    port: int


def _run(cmd: List[str], input_data: str = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, input=input_data, capture_output=True, text=True, check=check)


def _read_conf() -> str:
    """Read wg0.conf. Copies to a temp file since /etc/wireguard/ is root-only."""
    tmp = tempfile.mktemp(suffix=".conf")
    try:
        r = _run(["sudo", "cp", WG_CONF, tmp], check=False)
        if r.returncode != 0:
            return ""
        _run(["sudo", "chmod", "644", tmp])
        with open(tmp) as f:
            return f.read()
    except Exception:
        return ""
    finally:
        try:
            os.unlink(tmp)
        except Exception:
            pass


def _write_conf(content: str):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".conf", delete=False) as f:
        f.write(content)
        tmp = f.name
    try:
        _run(["sudo", "cp", tmp, WG_CONF])
        _run(["sudo", "chmod", "600", WG_CONF])
    finally:
        os.unlink(tmp)


def _load_meta() -> dict:
    """Load peer name/key metadata from PEERS_META json."""
    try:
        if os.path.exists(PEERS_META):
            with open(PEERS_META) as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_meta(meta: dict):
    os.makedirs(os.path.dirname(PEERS_META), exist_ok=True)
    with open(PEERS_META, "w") as f:
        json.dump(meta, f, indent=2)


def _get_server_network() -> tuple:
    """Return (server_ip, subnet_cidr) from wg0 interface address."""
    try:
        result = subprocess.run(["ip", "-4", "addr", "show", "wg0"], capture_output=True, text=True)
        for line in result.stdout.splitlines():
            if line.strip().startswith("inet "):
                cidr = line.strip().split()[1]
                iface = ipaddress.ip_interface(cidr)
                return str(iface.ip), str(iface.network)
    except Exception:
        pass
    return "10.8.0.1", "10.8.0.0/24"


def _parse_peers_from_conf(conf: str) -> List[dict]:
    """Parse [Peer] blocks from wg0.conf text."""
    peers = []
    current: Optional[dict] = None
    for line in conf.splitlines():
        line = line.strip()
        if line == "[Peer]":
            current = {}
        elif current is not None and "=" in line:
            key, _, val = line.partition("=")
            current[key.strip()] = val.strip()
            if key.strip() == "AllowedIPs":
                peers.append(current)
                current = None
    return peers


def _get_live_stats() -> dict:
    result = _run(["sudo", WG_BIN, "show", "wg0", "dump"], check=False)
    stats = {}
    if result.returncode != 0:
        return stats
    for line in result.stdout.strip().splitlines()[1:]:
        parts = line.split("\t")
        if len(parts) >= 6:
            pubkey = parts[0]
            stats[pubkey] = {
                "last_handshake": parts[4] if parts[4] != "0" else None,
                "transfer_rx": int(parts[5]),
                "transfer_tx": int(parts[6]) if len(parts) > 6 else 0,
            }
    return stats


def _next_free_ip(conf: str) -> str:
    server_ip, subnet = _get_server_network()
    network = ipaddress.ip_network(subnet)
    used = {ipaddress.ip_address(server_ip)}
    for line in conf.splitlines():
        if line.strip().startswith("AllowedIPs"):
            _, _, cidr = line.partition("=")
            try:
                used.add(ipaddress.ip_interface(cidr.strip()).ip)
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
    result = _run(["curl", "-s", "--max-time", "3", "https://api.ipify.org"], check=False)
    ip = result.stdout.strip() if result.returncode == 0 and result.stdout.strip() else "YOUR_SERVER_IP"
    conf = _read_conf()
    port = 51820
    for line in conf.splitlines():
        if line.strip().startswith("ListenPort"):
            try:
                port = int(line.split("=", 1)[1].strip())
            except Exception:
                pass
    return f"{ip}:{port}"


@router.get("/server/info", response_model=ServerInfo)
async def get_server_info(_: User = Depends(require_admin)):
    conf = _read_conf()
    if not conf:
        raise HTTPException(status_code=503, detail="WireGuard interface wg0 not found.")
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


@router.get("/peers", response_model=List[PeerInfo])
async def list_peers(_: User = Depends(require_admin)):
    conf = _read_conf()
    parsed = _parse_peers_from_conf(conf)
    stats = _get_live_stats()
    meta = _load_meta()  # pubkey → name
    result = []
    for p in parsed:
        pubkey = p.get("PublicKey", "")
        s = stats.get(pubkey, {})
        result.append(PeerInfo(
            name=meta.get(pubkey, pubkey[:8] if pubkey else "unknown"),
            public_key=pubkey,
            allowed_ips=p.get("AllowedIPs", ""),
            last_handshake=s.get("last_handshake"),
            transfer_rx=s.get("transfer_rx"),
            transfer_tx=s.get("transfer_tx"),
        ))
    return result


@router.post("/peers")
async def add_peer(request: PeerCreateRequest, _: User = Depends(require_admin)):
    conf = _read_conf()
    if not conf:
        raise HTTPException(status_code=503, detail="WireGuard not configured")

    meta = _load_meta()
    if request.name in meta.values():
        raise HTTPException(status_code=409, detail=f"Peer '{request.name}' already exists")

    priv_res = _run([WG_BIN, "genkey"])
    privkey = priv_res.stdout.strip()
    pub_res = _run([WG_BIN, "pubkey"], input_data=privkey + "\n")
    pubkey = pub_res.stdout.strip()

    # Store private key
    _run(["sudo", "mkdir", "-p", PEERS_DIR])
    _run(["sudo", "chmod", "700", PEERS_DIR])
    key_file = os.path.join(PEERS_DIR, f"{request.name}.key")
    with tempfile.NamedTemporaryFile(mode="w", delete=False) as f:
        f.write(privkey + "\n")
        tmp = f.name
    _run(["sudo", "cp", tmp, key_file])
    _run(["sudo", "chmod", "600", key_file])
    os.unlink(tmp)

    allowed_ips = request.allowed_ips or f"{_next_free_ip(conf)}/32"

    # Append to wg0.conf
    peer_block = f"\n[Peer]\nPublicKey = {pubkey}\nAllowedIPs = {allowed_ips}\n"
    _write_conf(conf + peer_block)

    # Apply live
    _run(["sudo", WG_BIN, "set", "wg0", "peer", pubkey, "allowed-ips", allowed_ips], check=False)

    # Save name mapping
    meta[pubkey] = request.name
    _save_meta(meta)

    return {"name": request.name, "public_key": pubkey, "allowed_ips": allowed_ips}


@router.delete("/peers/{name}")
async def remove_peer(name: str, _: User = Depends(require_admin)):
    meta = _load_meta()
    pubkey = next((k for k, v in meta.items() if v == name), None)
    if not pubkey:
        # Fall back: check conf directly
        conf = _read_conf()
        for p in _parse_peers_from_conf(conf):
            if p.get("PublicKey", "")[:8] == name:
                pubkey = p["PublicKey"]
                break
    if not pubkey:
        raise HTTPException(status_code=404, detail=f"Peer '{name}' not found")

    # Remove from wg0.conf
    conf = _read_conf()
    new_lines = []
    skip = False
    for line in conf.splitlines(keepends=True):
        stripped = line.strip()
        if stripped == "[Peer]":
            # peek ahead to check if this is the target peer
            skip = False
            new_lines.append(("PEER_MARKER", line))
            continue
        if new_lines and new_lines[-1][0] == "PEER_MARKER":
            if stripped.startswith("PublicKey") and stripped.split("=", 1)[1].strip() == pubkey:
                new_lines.pop()  # remove the [Peer] line we buffered
                skip = True
                continue
            else:
                new_lines[-1] = ("", new_lines[-1][1])
        if skip:
            if stripped == "" or (stripped.startswith("[") and stripped != "[Peer]"):
                skip = False
            else:
                continue
        new_lines.append(("", line))

    _write_conf("".join(l for _, l in new_lines))

    _run(["sudo", WG_BIN, "set", "wg0", "peer", pubkey, "remove"], check=False)

    key_file = os.path.join(PEERS_DIR, f"{name}.key")
    _run(["sudo", "rm", "-f", key_file], check=False)

    meta.pop(pubkey, None)
    _save_meta(meta)

    return {"message": f"Peer '{name}' removed"}


@router.get("/peers/{name}/config")
async def get_peer_config(name: str, _: User = Depends(require_admin)):
    meta = _load_meta()
    pubkey = next((k for k, v in meta.items() if v == name), None)
    if not pubkey:
        raise HTTPException(status_code=404, detail=f"Peer '{name}' not found")

    key_file = os.path.join(PEERS_DIR, f"{name}.key")
    tmp_key = tempfile.mktemp(suffix=".key")
    try:
        r = _run(["sudo", "cp", key_file, tmp_key], check=False)
        if r.returncode != 0:
            raise HTTPException(status_code=404, detail="Private key not found for this peer")
        _run(["sudo", "chmod", "644", tmp_key])
        with open(tmp_key) as f:
            privkey = f.read().strip()
    finally:
        try:
            os.unlink(tmp_key)
        except Exception:
            pass

    conf = _read_conf()
    allowed_ips = "0.0.0.0/0"
    for p in _parse_peers_from_conf(conf):
        if p.get("PublicKey") == pubkey:
            allowed_ips = p.get("AllowedIPs", "0.0.0.0/0")
            break
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
        import qrcode
        import io
        qr = qrcode.make(config_resp["config"])
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        buf.seek(0)
        return Response(content=buf.read(), media_type="image/png")
    except ImportError:
        raise HTTPException(status_code=501, detail="qrcode library not installed")
