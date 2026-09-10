"""Splitting a person's name into parts.

The database stores first, middle and last, and derives full_name from them.
Almost every real input arrives as one string: a crew list pasted out of Excel,
a name typed into a form, a row copied out of an email. So the split lives in
one place, is used by every path that accepts a whole name, and is always shown
to the user rather than applied silently, because it will sometimes be wrong.

The original string is kept by callers that import in bulk, so a bad split is
recoverable without asking anyone to retype anything.
"""
from __future__ import annotations

from typing import Optional

# Particles that belong to the surname rather than standing on their own.
_SURNAME_PARTICLES = {
    "de", "del", "dela", "della", "der", "di", "du", "la", "le", "van", "von",
    "bin", "ibn", "al", "st", "st.", "santa", "san", "mac", "mc", "o'",
}

# Suffixes that are not a surname, however last they appear.
_SUFFIXES = {"jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v", "md", "phd", "dds"}


def split_name(raw: Optional[str]) -> dict[str, Optional[str]]:
    """Return first, middle and last for a whole name.

    "Last, First" is honoured, because that is how half of all exported lists
    are written. A single token becomes the last name, since one-word names are
    surnames far more often than they are given names in a crew list.
    """
    text = " ".join(str(raw or "").split())
    if not text:
        return {"first_name": None, "middle_name": None, "last_name": None}

    # "Ortega, Luis Miguel" -> "Luis Miguel Ortega"
    if "," in text:
        surname, _, rest = text.partition(",")
        rest = rest.strip()
        surname = surname.strip()
        if surname and rest:
            text = f"{rest} {surname}"

    parts = text.split()

    suffix = ""
    if len(parts) > 1 and parts[-1].lower().strip(".,") in _SUFFIXES:
        suffix = parts.pop()

    if len(parts) == 1:
        last = parts[0]
        return {"first_name": None, "middle_name": None,
                "last_name": f"{last} {suffix}".strip()}

    first = parts[0]
    rest = parts[1:]

    # By default only the final token is the surname and anything between is a
    # middle name. A surname particle moves the boundary left, so "de la Cruz"
    # survives intact instead of becoming a middle name of "de la".
    cut = len(rest) - 1
    for i, token in enumerate(rest):
        if token.lower().strip(".,") in _SURNAME_PARTICLES:
            cut = i
            break
    middle_tokens = rest[:cut]
    last_tokens = rest[cut:]

    last = " ".join(last_tokens).strip()
    if suffix:
        last = f"{last} {suffix}".strip()

    return {
        "first_name": first,
        "middle_name": " ".join(middle_tokens) or None,
        "last_name": last or None,
    }


def apply_name(payload: dict) -> dict:
    """Fill the name parts from a whole name when the parts were not given.

    Explicit parts always win: a caller that knows the split should never have
    it second-guessed.
    """
    whole = payload.pop("full_name", None)
    has_parts = any(payload.get(k) for k in ("first_name", "middle_name", "last_name"))
    if whole and not has_parts:
        payload.update({k: v for k, v in split_name(whole).items() if v})
    return payload
