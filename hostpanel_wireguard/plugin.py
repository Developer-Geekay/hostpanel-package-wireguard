import ipaddress
import logging
import os
import re
import subprocess
import tempfile
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from deps import get_current_user, require_admin
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
        "unit": "wg-quick@wg0",
        "label": "WireGuard VPN",
        "icon": "vpn_lock",
        "can_reload": False,
    },
}

router = APIRouter(prefix="/cpanelapi/wireguard", tags=["WireGuard"])

WG_CONF = "/etc/wireguard/wg0.conf"
PEERS_DIR = "/etc/wireguard/peers"
WG_BIN = "/usr/bin/wg"
SERVER_SUBNET = "10.8.0.0/24"
SERVER_IP = "10.8.0.1"


class PeerInfo(BaseModel):
    name: str
    public_key: str
    allowed_ips: str
    last_handshake: Optional[str] = None
    transfer_rx: Optional[int] = None
    transfer_tx: Optional[int] = None


class PeerCreateRequest(BaseModel):
    name: str
    allowed_ips: Optional[str] = None  # auto-assigned if not provided


class ServerInfo(BaseModel):
    public_key: str
    endpoint: str
    address: str
    port: int


def _run(cmd: List[str], input_data: str = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, input=input_data, capture_output=True, text=True, check=check
    )


def _read_conf() -> str:
    result = _run(["sudo", WG_BIN, "showconf", "wg0"], check=False)
    if result.returncode == 0:
        return result.stdout
    # wg interface may be down, read file directly
    try:
        result2 = subprocess.run(["sudo", "cat", WG_CONF], capture_output=True, text=True, check=True)
        return result2.stdout
    except Exception:
        return ""


def _write_conf(content: str):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".conf", delete=False) as f:
        f.write(content)
        tmp = f.name
    try:
        _run(["sudo", "cp", tmp, WG_CONF])
        _run(["sudo", "chmod", "600", WG_CONF])
    finally:
        os.unlink(tmp)


def _parse_peers(conf: str) -> List[dict]:
    peers = []
    current = {}
    name = None
    for line in conf.splitlines():
        line = line.strip()
        if line.startswith("# name:"):
            name = line.split(":", 1)[1].strip()
        elif line == "[Peer]":
            current = {}
            if name:
                current["name"] = name
            name = None
        elif "=" in line and current is not None:
            key, _, val = line.partition("=")
            current[key.strip()] = val.strip()
            if key.strip() == "AllowedIPs":
                peers.append(current)
                current = {}
    return peers


def _get_live_stats() -> dict:
    result = _run(["sudo", WG_BIN, "show", "wg0", "dump"], check=False)
    stats = {}
    if result.returncode != 0:
        return stats
    lines = result.stdout.strip().splitlines()
    for line in lines[1:]:  # skip server line
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
    network = ipaddress.ip_network(SERVER_SUBNET)
    used = set()
    used.add(ipaddress.ip_address(SERVER_IP))
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
    if result.returncode == 0:
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
    ip = result.stdout.strip() if result.returncode == 0 else "YOUR_SERVER_IP"
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
        raise HTTPException(status_code=503, detail="WireGuard not configured. No wg0.conf found.")
    address = SERVER_IP
    port = 51820
    for line in conf.splitlines():
        if line.strip().startswith("Address"):
            address = line.split("=", 1)[1].strip().split("/")[0]
        elif line.strip().startswith("ListenPort"):
            try:
                port = int(line.split("=", 1)[1].strip())
            except Exception:
                pass
    return ServerInfo(
        public_key=_get_server_pubkey(),
        endpoint=_get_server_endpoint(),
        address=address,
        port=port,
    )


@router.get("/peers", response_model=List[PeerInfo])
async def list_peers(_: User = Depends(require_admin)):
    conf = _read_conf()
    parsed = _parse_peers(conf)
    stats = _get_live_stats()
    result = []
    for p in parsed:
        pubkey = p.get("PublicKey", "")
        s = stats.get(pubkey, {})
        result.append(PeerInfo(
            name=p.get("name", pubkey[:8]),
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

    # Check name uniqueness
    existing = _parse_peers(conf)
    if any(p.get("name") == request.name for p in existing):
        raise HTTPException(status_code=409, detail=f"Peer '{request.name}' already exists")

    # Generate keypair
    priv_res = _run([WG_BIN, "genkey"])
    privkey = priv_res.stdout.strip()
    pub_res = _run([WG_BIN, "pubkey"], input_data=privkey + "\n")
    pubkey = pub_res.stdout.strip()

    # Persist private key for client config generation
    os.makedirs(PEERS_DIR, mode=0o700, exist_ok=True)
    key_file = os.path.join(PEERS_DIR, f"{request.name}.key")
    with tempfile.NamedTemporaryFile(mode="w", delete=False) as f:
        f.write(privkey + "\n")
        tmp = f.name
    _run(["sudo", "cp", tmp, key_file])
    _run(["sudo", "chmod", "600", key_file])
    os.unlink(tmp)

    allowed_ips = request.allowed_ips or f"{_next_free_ip(conf)}/32"

    # Append peer block to conf
    peer_block = f"\n# name: {request.name}\n[Peer]\nPublicKey = {pubkey}\nAllowedIPs = {allowed_ips}\n"
    new_conf = conf + peer_block
    _write_conf(new_conf)

    # Apply live without restart if wg0 is up
    _run(["sudo", WG_BIN, "set", "wg0", "peer", pubkey, "allowed-ips", allowed_ips], check=False)

    return {"name": request.name, "public_key": pubkey, "allowed_ips": allowed_ips}


@router.delete("/peers/{name}")
async def remove_peer(name: str, _: User = Depends(require_admin)):
    conf = _read_conf()
    peers = _parse_peers(conf)
    target = next((p for p in peers if p.get("name") == name), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Peer '{name}' not found")

    pubkey = target.get("PublicKey", "")

    # Remove peer block from conf (name comment + [Peer] block)
    new_lines = []
    skip = False
    skip_next_comment = False
    lines = conf.splitlines(keepends=True)
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line == f"# name: {name}":
            skip_next_comment = True
            i += 1
            continue
        if skip_next_comment and line == "[Peer]":
            skip = True
            skip_next_comment = False
            i += 1
            continue
        if skip:
            if line == "" or line.startswith("["):
                skip = False
                if line == "":
                    i += 1
                    continue
            else:
                i += 1
                continue
        new_lines.append(lines[i])
        i += 1

    _write_conf("".join(new_lines))

    # Remove live
    if pubkey:
        _run(["sudo", WG_BIN, "set", "wg0", "peer", pubkey, "remove"], check=False)

    # Remove stored key
    key_file = os.path.join(PEERS_DIR, f"{name}.key")
    _run(["sudo", "rm", "-f", key_file], check=False)

    return {"message": f"Peer '{name}' removed"}


@router.get("/peers/{name}/config")
async def get_peer_config(name: str, _: User = Depends(require_admin)):
    conf = _read_conf()
    peers = _parse_peers(conf)
    target = next((p for p in peers if p.get("name") == name), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Peer '{name}' not found")

    key_file = os.path.join(PEERS_DIR, f"{name}.key")
    privkey_res = subprocess.run(["sudo", "cat", key_file], capture_output=True, text=True)
    if privkey_res.returncode != 0:
        raise HTTPException(status_code=404, detail="Private key not found for this peer")
    privkey = privkey_res.stdout.strip()

    server_pubkey = _get_server_pubkey()
    endpoint = _get_server_endpoint()
    allowed_ips = target.get("AllowedIPs", "0.0.0.0/0")
    peer_ip = allowed_ips.split("/")[0]

    client_conf = (
        f"[Interface]\n"
        f"PrivateKey = {privkey}\n"
        f"Address = {peer_ip}/32\n"
        f"DNS = 1.1.1.1\n\n"
        f"[Peer]\n"
        f"PublicKey = {server_pubkey}\n"
        f"Endpoint = {endpoint}\n"
        f"AllowedIPs = 0.0.0.0/0\n"
        f"PersistentKeepalive = 25\n"
    )
    return {"name": name, "config": client_conf}


@router.get("/peers/{name}/qr")
async def get_peer_qr(name: str, _: User = Depends(require_admin)):
    config_resp = await get_peer_config(name, _)
    client_conf = config_resp["config"]

    try:
        import qrcode
        import io
        qr = qrcode.make(client_conf)
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        buf.seek(0)
        return Response(content=buf.read(), media_type="image/png")
    except ImportError:
        raise HTTPException(status_code=501, detail="qrcode library not installed")
