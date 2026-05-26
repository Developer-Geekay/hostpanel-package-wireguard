import logging
import os
import pwd
import subprocess
import tempfile

logger = logging.getLogger(__name__)

WG_BIN       = "/opt/hostpanel/plugins/wireguard/wg"
WG_QUICK     = "/opt/hostpanel/plugins/wireguard/wg-quick"
WG_CONF      = "/etc/wireguard/wg0.conf"
PEERS_DIR    = "/etc/wireguard/peers"
WIREGUARD_DIR = "/opt/hostpanel/plugins/wireguard"
SERVICE_NAME = "hostpanel-wireguard"
SERVICE_DST  = f"/etc/systemd/system/{SERVICE_NAME}.service"


def _panel_user() -> str:
    return pwd.getpwuid(os.getuid()).pw_name


def on_install():
    """Bootstrap WireGuard: create config dirs, generate initial wg0.conf if absent,
    install service. Binaries (wg, wg-quick) arrive via the zip's bin/ directory."""
    logger.info("WireGuard on_install: initialising")
    panel_user = _panel_user()

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
        with tempfile.NamedTemporaryFile(mode="w", suffix=".conf", delete=False) as f:
            f.write(conf)
            tmp = f.name
        try:
            subprocess.run(["sudo", "cp", tmp, WG_CONF], capture_output=True)
            subprocess.run(["sudo", "chmod", "600", WG_CONF], capture_output=True)
            logger.info("WireGuard on_install: generated initial wg0.conf with new key pair")
        finally:
            os.unlink(tmp)

    # Create metadata dir owned by panel user so plugin can write without sudo
    subprocess.run(["sudo", "mkdir", "-p", WIREGUARD_DIR], capture_output=True)
    subprocess.run(["sudo", "chown", f"{panel_user}:{panel_user}", WIREGUARD_DIR], capture_output=True)

    # Install service file if package manager upload path didn't do it already
    if not os.path.exists(SERVICE_DST):
        try:
            import importlib.resources as pkg_res
            svc_src = pkg_res.files("hostpanel_wireguard").joinpath(f"{SERVICE_NAME}.service")
            with pkg_res.as_file(svc_src) as p:
                subprocess.run(["sudo", "cp", str(p), SERVICE_DST], capture_output=True)
                subprocess.run(["sudo", "chmod", "644", SERVICE_DST], capture_output=True)
                logger.info(f"Installed service file → {SERVICE_DST}")
        except Exception as e:
            logger.warning(f"Could not install bundled service file: {e}")

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
