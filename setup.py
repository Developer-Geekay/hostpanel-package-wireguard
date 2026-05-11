from setuptools import setup, find_packages

setup(
    name="hostpanel-wireguard",
    version="1.0.0",
    packages=find_packages(),
    install_requires=["fastapi", "pydantic", "qrcode[pil]"],
    entry_points={
        "hostpanel.modules": ["wireguard = hostpanel_wireguard.plugin"],
    },
)
