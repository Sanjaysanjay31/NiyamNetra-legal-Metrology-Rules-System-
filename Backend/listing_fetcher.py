"""In listing_fetcher.py. Only CHK15 and CHK16 fetch anything."""
import ipaddress
import socket
from urllib.parse import urlparse

import httpx

ALLOWED_SCHEMES = {"https"}
BLOCKED_NETS = [
    ipaddress.ip_network(n) for n in (
        "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
        "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.168.0.0/16",
        "198.18.0.0/15", "224.0.0.0/4", "240.0.0.0/4",
        "::1/128", "fc00::/7", "fe80::/10",
    )
]


def resolve_and_validate(url: str) -> tuple[str, str]:
    """Resolve the hostname, reject private answers, and return the literal IP
    to connect to — so a DNS record that changes between the check and the
    connection cannot redirect the request inside the network."""
    parts = urlparse(url)
    if parts.scheme not in ALLOWED_SCHEMES:
        raise ValueError(f"Only https is permitted; got {parts.scheme!r}")
    if not parts.hostname:
        raise ValueError("No hostname in URL")

    infos = socket.getaddrinfo(parts.hostname, parts.port or 443, proto=socket.IPPROTO_TCP)
    ip = ipaddress.ip_address(infos[0][4][0])
    if any(ip in net for net in BLOCKED_NETS) or not ip.is_global:
        raise ValueError(f"Refusing to fetch {parts.hostname}: resolves to {ip}")
    return str(ip), parts.hostname


def fetch_listing(url: str, timeout: float = 10.0) -> str:
    ip, host = resolve_and_validate(url)
    target = url.replace(f"//{host}", f"//{ip}", 1)
    with httpx.Client(
        follow_redirects=False,            # a 302 to 169.254.169.254 is the attack
        timeout=timeout,
        headers={"Host": host, "User-Agent": "NiyamNetra/2.0"},
        verify=True,
    ) as c:
        r = c.get(target, extensions={"sni_hostname": host})
        r.raise_for_status()
        return r.text[:2_000_000]
