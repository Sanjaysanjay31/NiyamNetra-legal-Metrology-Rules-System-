"""rbac.py — identity and authorisation dependencies."""
from fastapi import Depends, HTTPException, Path, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from jwt_handler import ACCESS, TokenError, decode_token
from models import Inspection, Scan, User

bearer = HTTPBearer(auto_error=False)

UNAUTHORIZED = HTTPException(
    status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)
FORBIDDEN = HTTPException(status.HTTP_403_FORBIDDEN, detail="Not permitted")


def get_current_user(
    request: Request,
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if cred is None:
        raise UNAUTHORIZED
    try:
        claims = decode_token(cred.credentials, expect=ACCESS)
    except TokenError:
        raise UNAUTHORIZED

    user = db.get(User, int(claims["sub"]))
    if user is None or not user.is_active:
        raise UNAUTHORIZED

    # C7 — a token minted for one install is not valid from another.
    tok_install = claims.get("install_id")
    if user.install_id and tok_install != user.install_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Device not recognised")

    request.state.user_id = user.id      # for the audit middleware
    return user


def require_role(*allowed: str):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise FORBIDDEN
        return user
    return dep


require_admin = require_role("admin")
require_inspector = require_role("inspector", "admin")


# ---------------------------------------------------------------------------
# Ownership. Read this before changing it.
#
# WRONG — what v1.x shipped:
#
#     def require_owner_or_admin(user_id: int, user: User = Depends(...)):
#         if user.role != "admin" and user.id != user_id:
#             raise FORBIDDEN
#
# `user_id` has no Path() marker, so FastAPI binds it to a *query* parameter.
# The caller supplies it. `?user_id=<my own id>` satisfies the check while the
# path still addresses somebody else's record. The dependency was also never
# attached to any route, so it protected nothing even when it was correct.
#
# RIGHT — resolve the owner from the row the path names, in the database.
# ---------------------------------------------------------------------------
def owned_inspection(
    inspection_id: int = Path(..., ge=1),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Inspection:
    insp = db.get(Inspection, inspection_id)
    if insp is None:
        # 404 for a row you may not see, so the endpoint is not an existence oracle.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    if user.role != "admin" and insp.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    return insp


def owned_scan(
    scan_id: int = Path(..., ge=1),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Scan:
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Scan not found")
    insp = db.get(Inspection, scan.inspection_id)
    if user.role != "admin" and (insp is None or insp.user_id != user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Scan not found")
    return scan
