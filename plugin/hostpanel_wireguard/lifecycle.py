import logging
import os
import subprocess

logger = logging.getLogger(__name__)

WG_BIN        = "/opt/hostpanel/plugins/wireguard/wg"
WG_QUICK      = "/opt/hostpanel/plugins/wireguard/wg-quick"
WG_CONF       = "/etc/wireguard/wg0.conf"
PEERS_DIR     = "/etc/wireguard/peers"
WIREGUARD_DIR = "/opt/hostpanel/plugins/wireguard"
SERVICE_NAME  = "hostpanel-wireguard"
SERVICE_DST   = f"/etc/systemd/system/{SERVICE_NAME}.service"
SYSCTL_FILE   = "/etc/sysctl.d/99-wireguard.conf"


def _get_outbound_iface() -> str:
    """Detect the default outbound network interface (e.g. eth0, ens3, enp1s0)."""
    r = subprocess.run(["ip", "route", "show", "default"], capture_output=True, text=True)
    parts = r.stdout.split()
    try:
        return parts[parts.index("dev") + 1]
    except (ValueError, IndexError):
        return "eth0"


def _enable_ip_forward():
    """Enable IPv4 forwarding immediately and persist across reboots."""
    subprocess.run(["sudo", "sysctl", "-w", "net.ipv4.ip_forward=1"], capture_output=True)
    subprocess.run(
        ["sudo", "tee", SYSCTL_FILE],
        input="net.ipv4.ip_forward=1\n", text=True, capture_output=True,
    )


def on_install():
    """Bootstrap WireGuard: create config dirs, generate initial wg0.conf if absent,
    install service. Binaries (wg, wg-quick) arrive via the zip's bin/ directory."""
    logger.info("WireGuard on_install: initialising")

    subprocess.run(["sudo", "mkdir", "-p", "/etc/wireguard"], capture_output=True)
    subprocess.run(["sudo", "mkdir", "-p", PEERS_DIR], capture_output=True)
    subprocess.run(["sudo", "chmod", "700", "/etc/wireguard"], capture_output=True)
    subprocess.run(["sudo", "chmod", "700", PEERS_DIR], capture_output=True)

    _enable_ip_forward()

    # /etc/wireguard is root-owned 700 — use sudo cat to check existence
    existing_conf = subprocess.run(["sudo", "cat", WG_CONF], capture_output=True, text=True)
    conf_present = existing_conf.returncode == 0

    # If conf exists but uses old 10.8.0.x subnet, remove it so it's regenerated
    if conf_present and "10.8.0." in existing_conf.stdout:
        subprocess.run(["sudo", "rm", "-f", WG_CONF], capture_output=True)
        conf_present = False
        logger.info("WireGuard on_install: removed old 10.8.0.x conf, will regenerate with 10.66.66.x")

    # Generate initial wg0.conf only on first install (or after migration above)
    if not conf_present:
        iface = _get_outbound_iface()
        priv = subprocess.run([WG_BIN, "genkey"], capture_output=True, text=True)
        privkey = priv.stdout.strip()
        conf = (
            "[Interface]\n"
            "Address = 10.66.66.1/24\n"
            "ListenPort = 51820\n"
            f"PrivateKey = {privkey}\n"
            f"PostUp = sysctl -w net.ipv4.ip_forward=1; "
            f"iptables -A FORWARD -i wg0 -j ACCEPT; "
            f"iptables -t nat -A POSTROUTING -o {iface} -j MASQUERADE\n"
            f"PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; "
            f"iptables -t nat -D POSTROUTING -o {iface} -j MASQUERADE\n"
        )
        subprocess.run(["sudo", "tee", WG_CONF], input=conf, text=True, capture_output=True)
        subprocess.run(["sudo", "chmod", "600", WG_CONF], capture_output=True)
        logger.info(f"WireGuard on_install: generated wg0.conf (iface={iface})")

    os.makedirs(WIREGUARD_DIR, exist_ok=True)

    if not os.path.exists(SERVICE_DST):
        svc_src = os.path.join(WIREGUARD_DIR, "service", f"{SERVICE_NAME}.service")
        if os.path.exists(svc_src):
            try:
                with open(svc_src) as f:
                    content = f.read()
                subprocess.run(["sudo", "tee", SERVICE_DST], input=content, text=True, capture_output=True)
                subprocess.run(["sudo", "chmod", "644", SERVICE_DST], capture_output=True)
                logger.info(f"Installed service file -> {SERVICE_DST}")
            except Exception as e:
                logger.warning(f"Could not install service file: {e}")

    subprocess.run(["sudo", "systemctl", "daemon-reload"], capture_output=True)
    subprocess.run(["sudo", "systemctl", "enable", SERVICE_NAME], capture_output=True)
    subprocess.run(["sudo", "systemctl", "start", SERVICE_NAME], capture_output=True)
    logger.info("WireGuard on_install: service enabled and started")

    _sync_peers_to_conf()


def pre_uninstall(force: bool = False):
    logger.info(f"WireGuard pre_uninstall: force={force}")
    subprocess.run(["sudo", "systemctl", "stop", SERVICE_NAME], capture_output=True)
    subprocess.run(["sudo", "systemctl", "disable", SERVICE_NAME], capture_output=True)
    subprocess.run(["sudo", "rm", "-f", SERVICE_DST], capture_output=True)
    subprocess.run(["sudo", "systemctl", "daemon-reload"], capture_output=True)
    if os.path.isdir(WIREGUARD_DIR):
        subprocess.run(["sudo", "rm", "-rf", WIREGUARD_DIR], capture_output=True)
    subprocess.run(["sudo", "rm", "-f", "/etc/sudoers.d/hostpanel-wireguard"], capture_output=True)
    logger.info("WireGuard pre_uninstall: complete")


def _sync_peers_to_conf():
    """Restore enabled DB peers missing from wg0.conf, then restart the service."""
    try:
        from hostpanel_wireguard.plugin import _sync_conf_from_db
        added = _sync_conf_from_db()
        if added:
            logger.info(f"WireGuard lifecycle: re-added {added} peer(s) from DB to conf")
    except Exception as e:
        logger.warning(f"WireGuard lifecycle: peer sync failed: {e}")


def on_startup():
    """Ensure IP forwarding is on and WireGuard service is running."""
    _enable_ip_forward()
    result = subprocess.run(
        ["sudo", "systemctl", "is-active", SERVICE_NAME],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        logger.info(f"WireGuard on_startup: service not active, starting...")
        subprocess.run(["sudo", "systemctl", "start", SERVICE_NAME], capture_output=True)
    else:
        logger.info("WireGuard on_startup: service is active")
    _sync_peers_to_conf()
