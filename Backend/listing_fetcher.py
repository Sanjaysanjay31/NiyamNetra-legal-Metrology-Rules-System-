"""In listing_fetcher.py. Only CHK15 and CHK16 fetch anything."""
import ipaddress
import socket
from urllib.parse import urlparse, urlunparse

import httpx

ALLOWED_SCHEMES = {"https"}
ALLOWED_HOSTS = {
    "amazon.in", "www.amazon.in",
    "flipkart.com", "www.flipkart.com",
    "jiomart.com", "www.jiomart.com",
    "bigbasket.com", "www.bigbasket.com",
    "meesho.com", "www.meesho.com",
    "nykaa.com", "www.nykaa.com",
    "blinkit.com", "www.blinkit.com",
    "zepto.com", "www.zepto.com",
    "swiggy.com", "www.swiggy.com",
}
BLOCKED_NETS = [
    ipaddress.ip_network(n) for n in (
        "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
        "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.168.0.0/16",
        "198.18.0.0/15", "224.0.0.0/4", "240.0.0.0/4",
        "::1/128", "fc00::/7", "fe80::/10",
    )
]


def resolve_and_validate(url: str) -> tuple[str, str]:
    """Validate scheme + allow-listed host, resolve and reject private answers.

    Returns (ip, hostname). The ip is validated but NOT connected to directly
    (see fetch_listing): connecting to an IP literal breaks TLS cert SAN
    validation, so we fetch the original hostname URL instead. Accepted
    trade-off: a DNS-rebinding window remains between resolve and connect;
    redirects are disabled and 3xx is rejected to narrow it.
    """
    parts = urlparse(url)
    if parts.scheme not in ALLOWED_SCHEMES:
        raise ValueError(f"Only https is permitted; got {parts.scheme!r}")
    if not parts.hostname:
        raise ValueError("No hostname in URL")
    host = parts.hostname.lower()
    if host not in ALLOWED_HOSTS:
        raise ValueError(f"Host not allowed: {parts.hostname!r}")

    infos = socket.getaddrinfo(parts.hostname, parts.port or 443, proto=socket.IPPROTO_TCP)
    ip = ipaddress.ip_address(infos[0][4][0])
    if any(ip in net for net in BLOCKED_NETS) or not ip.is_global:
        raise ValueError(f"Refusing to fetch {parts.hostname}: resolves to {ip}")
    return str(ip), parts.hostname


def _rebuild_url(parts) -> str:
    """Rebuild a URL from parsed parts using urlparse/urlunparse so ports,
    userinfo and IPv6 brackets are preserved correctly (never naive replace).

    Userinfo is STRIPPED: credentials in a listing URL must never be forwarded
    to the remote host (credential leak + SSRF bypass vector).
    """
    netloc = parts.hostname or ""
    # Bracket IPv6 literals.
    if ":" in netloc and not netloc.startswith("["):
        # hostname already strips brackets; re-add for literal IPs.
        try:
            ipaddress.ip_address(parts.hostname or "")
            netloc = f"[{netloc}]"
        except ValueError:
            pass
    if parts.port:
        # Strip any existing port confusion: netloc currently has no port.
        netloc = f"{netloc}:{parts.port}"
    return urlunparse((parts.scheme, netloc, parts.path or "/", parts.params, parts.query, parts.fragment))


def fetch_listing(url: str, timeout: float = 10.0) -> str:
    # Validate (scheme, allow-list, DNS) first; then fetch the ORIGINAL
    # hostname URL so TLS cert SAN validation matches. Documented trade-off:
    # DNS could rebind between the check and the connect; mitigated by
    # follow_redirects=False + explicit 3xx rejection + allow-listed hosts.
    # Size-capped streaming: read at most 2 MB so a hostile page cannot OOM
    # the worker; userinfo stripped in _rebuild_url so creds never forward.
    resolve_and_validate(url)
    parts = urlparse(url)
    # Normalise via urlunparse (handles ports/userinfo/IPv6) rather than
    # naive string replacement of the host.
    target = _rebuild_url(parts)
    with httpx.Client(
        follow_redirects=False,            # a 302 to 169.254.169.254 is the attack
        timeout=timeout,
        headers={"User-Agent": "NiyamNetra/2.0"},
        verify=True,
    ) as c:
        with c.stream("GET", target) as r:
            if 300 <= r.status_code < 400:
                raise ValueError(f"Refusing redirect ({r.status_code}) from {parts.hostname}")
            r.raise_for_status()
            chunks: list[bytes] = []
            total = 0
            for chunk in r.iter_bytes(chunk_size=65536):
                if not chunk:
                    continue
                total += len(chunk)
                if total > 2_000_000:
                    # Truncate at the cap; listing checks parse declarations,
                    # which live in the head of the page.
                    need = 2_000_000 - (total - len(chunk))
                    if need > 0:
                        chunks.append(chunk[:need])
                    break
                chunks.append(chunk)
            raw = b"".join(chunks)
    # Decode defensively; charset may lie.
    try:
        return raw.decode(r.encoding or "utf-8", errors="replace")[:2_000_000]
    except Exception:
        return raw.decode("utf-8", errors="replace")[:2_000_000]
