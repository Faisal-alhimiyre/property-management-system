"""Shared password strength rules for Walajna (production)."""

from __future__ import annotations

import re

PASSWORD_MIN_LENGTH = 8
PASSWORD_SPECIAL_RE = re.compile(r"[!@#$%^&*()_+\-=\[\]{}|;:,.<>?/\\~`]")

PASSWORD_RULES_MESSAGE = (
    f"Password must be at least {PASSWORD_MIN_LENGTH} characters and include "
    "uppercase, lowercase, a number, and a special character."
)


def validate_password_strength(password: str) -> str:
    """Return the password if strong enough; otherwise raise ValueError."""
    value = str(password or "")
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError(PASSWORD_RULES_MESSAGE)
    if not re.search(r"[A-Z]", value):
        raise ValueError(PASSWORD_RULES_MESSAGE)
    if not re.search(r"[a-z]", value):
        raise ValueError(PASSWORD_RULES_MESSAGE)
    if not re.search(r"\d", value):
        raise ValueError(PASSWORD_RULES_MESSAGE)
    if not PASSWORD_SPECIAL_RE.search(value):
        raise ValueError(PASSWORD_RULES_MESSAGE)
    return value
