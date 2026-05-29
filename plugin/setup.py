from setuptools import setup, find_packages

setup(
    name="hostpanel-wireguard",
    version="1.2.1",
    packages=find_packages(),
    install_requires=["fastapi", "pydantic", "qrcode[pil]"],
    entry_points={
        "hostpanel.modules": [
            "wireguard = hostpanel_wireguard.plugin"
        ],
        "hostpanel.lifecycle": [
            "hostpanel-wireguard = hostpanel_wireguard.lifecycle:pre_uninstall"
        ],
        "hostpanel.setup": [
            "hostpanel-wireguard = hostpanel_wireguard.lifecycle:on_install"
        ],
        "hostpanel.hooks.on_startup": [
            "hostpanel-wireguard = hostpanel_wireguard.lifecycle:on_startup"
        ],
    },
)
