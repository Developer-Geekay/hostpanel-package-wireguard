import logging
import os
import subprocess

logger = logging.getLogger(__name__)

WG_BIN       = "/opt/hostpanel/plugins/wireguard/wg"
WG_QUICK     = "/opt/hostpanel/plugins/wireguard/wg-quick"
WG_CONF      = "/etc/wireguard/wg0.conf"
PEERS_DIR    = "/etc/wireguard/peers"
WIREGUARD_DIR = "/opt/hostpanel/plugins/wireguard"
SERVICE_NAME = "hostpanel-wireguard"
SERVICE_DST  = f"/etc/systemd/system/{SERVICE_NAME}.service"


def on_install():
    """Bootstrap WireGuard: create config dirs, generate initial wg0.conf if absent,
    install service. Binaries (wg, wg-quick) arrive via the zip's bin/ directory."""
    logger.info("WireGuard on_install: initialising")

    # Create /etc/wireguard with restricted permissions
    subprocess.run(["sudo", "mkdir", "-p", "/etc/wireguard"], capture_output=True)
    subprocess.run(["sudo", "mkdir", "-p", PEERS_DIR], capture_output=True)
    subprocess.run(["sudo", "chmod", "700", "/etc/wireguard"], capture_output=True)
    subprocess.run(["sudo", "chmod", "700", PEERS_DIR], capture_output=True)

    # Generate initial wg0.conf only on first install
    if not os.path.exists(WG_CONF):
        priv = subprocess.run([WG_BIN, "genkey"], capture_output=True, text=True)
        privkey = priv.stdout.strip()
        conf = (
            "[Interface]\n"
            "Address = 10.8.0.1/24\n"
            "ListenPort = 51820\n"
            f"PrivateKey = {privkey}\n"
            "PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; "
            "iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE\n"
            "PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; "
            "iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE\n"
        )
        subprocess.run(["sudo", "tee", WG_CONF], input=conf, text=True, capture_output=True)
        subprocess.run(["sudo", "chmod", "600", WG_CONF], capture_output=True)
        logger.info("WireGuard on_install: generated initial wg0.conf with new key pair")

    # WIREGUARD_DIR is created by the package manager (os.makedirs) running as
    # the panel user, so it already has correct ownership — no sudo needed here.
    os.makedirs(WIREGUARD_DIR, exist_ok=True)

    # Install service file (package manager installs it from service/, this is a fallback)
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
        else:
            logger.warning(f"Service file not found at {svc_src}")

    subprocess.run(["sudo", "systemctl", "daemon-reload"], capture_output=True)
    subprocess.run(["sudo", "systemctl", "enable", SERVICE_NAME], capture_output=True)
    subprocess.run(["sudo", "systemctl", "start", SERVICE_NAME], capture_output=True)
    logger.info("WireGuard on_install: service enabled and started")


def pre_uninstall(force: bool = False):
    """Stop and remove WireGuard service and plugin data. VPN config at
    /etc/wireguard/ is preserved so it can be restored on reinstall."""
    logger.info(f"WireGuard pre_uninstall: force={force}")

    subprocess.run(["sudo", "systemctl", "stop", SERVICE_NAME], capture_output=True)
    subprocess.run(["sudo", "systemctl", "disable", SERVICE_NAME], capture_output=True)
    subprocess.run(["sudo", "rm", "-f", SERVICE_DST], capture_output=True)
    subprocess.run(["sudo", "systemctl", "daemon-reload"], capture_output=True)
    logger.info("WireGuard pre_uninstall: service stopped and removed")

    # Remove plugin data directory
    if os.path.isdir(WIREGUARD_DIR):
        subprocess.run(["sudo", "rm", "-rf", WIREGUARD_DIR], capture_output=True)
        logger.info(f"WireGuard pre_uninstall: removed {WIREGUARD_DIR}")

    # Remove plugin sudoers last — all cleanup above still needs those permissions
    subprocess.run(["sudo", "rm", "-f", "/etc/sudoers.d/hostpanel-wireguard"], capture_output=True)
    logger.info("WireGuard pre_uninstall: complete")


def on_startup():
    """Called at server startup. Ensures the WireGuard service is running."""
    result = subprocess.run(
        ["sudo", "systemctl", "is-active", SERVICE_NAME],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        logger.info(f"WireGuard on_startup: service not active ({result.stdout.strip()}), starting...")
        subprocess.run(["sudo", "systemctl", "start", SERVICE_NAME], capture_output=True)
    else:
        logger.info("WireGuard on_startup: service is active")
