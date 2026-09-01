"""bcrypt via passlib. See requirements.txt for why bcrypt is pinned <4.1."""
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# bcrypt truncates at 72 bytes and silently ignores the rest.
MAX_PASSWORD_BYTES = 72


def hash_password(plain: str) -> str:
    if len(plain.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("Password exceeds 72 bytes; bcrypt would silently truncate it.")
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except ValueError:
        # Malformed stored hash. Fail closed, do not raise into the request.
        return False
