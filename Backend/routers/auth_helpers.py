"""routers/auth_helpers.py — the install_id is issued by the server, once. See Backend.md §3.4."""
import secrets
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from models import User


def bind_install(db: Session, user: User) -> str:
    """First login on a device binds it. A rebind is an audited admin action."""
    if user.install_id:
        return user.install_id
    user.install_id = secrets.token_hex(32)          # 32 bytes, server-generated
    user.install_bound_at = datetime.now(timezone.utc)
    db.commit()
    return user.install_id
