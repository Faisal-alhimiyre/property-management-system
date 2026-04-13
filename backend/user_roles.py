"""Helpers for users.roles (PostgreSQL text[]) + legacy users.role."""


def effective_roles(user: dict) -> list[str]:
    raw = user.get("roles")
    if isinstance(raw, list) and len(raw) > 0:
        return [
            str(x)
            for x in raw
            if x is not None and str(x).strip() not in ("", "pending")
        ]
    r = user.get("role")
    if r is not None and str(r).strip() not in ("", "pending"):
        return [str(r)]
    return []


def has_role(user: dict, name: str) -> bool:
    return name in effective_roles(user)
