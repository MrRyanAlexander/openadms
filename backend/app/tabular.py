"""Reading a table out of whatever someone pasted.

The user has never heard the word delimiter and should never be asked about
one. They copy a block out of Excel, or out of a table in an email, or they
type a list of names, and they paste it into one box. This module works out
what they gave us.

Nothing here writes anything. It returns rows and what it thinks each column
is, so the caller can show that back as an editable table before a single row
is committed. Every guess it makes is visible and correctable, because some of
them will be wrong.

Sniffing order, which is ordered by what actually turns up:
  1. tabs anywhere            -> tab separated. This is what a copy out of
                                 Excel or an Outlook table puts on the
                                 clipboard, and it is the most common input.
  2. a consistent comma count -> comma separated
  3. commas, but ragged       -> one flat list, split on commas and newlines
  4. none of the above        -> one value per line
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from typing import Callable, Optional, Sequence

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE = re.compile(r"^\+?[\d\s().-]{7,}$")
_DIGITS = re.compile(r"^\d+$")
_MONEY = re.compile(r"^\$?-?[\d,]+(\.\d+)?$")


@dataclass
class Field_:
    """One column the caller is willing to receive.

    `words` are matched against a header cell. `looks_like` is only consulted
    where there is no header row at all, and gets one column's worth of values
    so it can judge the column rather than a single cell.
    """
    name: str
    words: Sequence[str] = ()
    looks_like: Optional[Callable[[list[str]], bool]] = None
    priority: int = 50


@dataclass
class Parsed:
    rows: list[dict[str, str]] = field(default_factory=list)
    columns: list[Optional[str]] = field(default_factory=list)
    header_row: Optional[list[str]] = None
    delimiter: str = "none"
    unmapped: list[str] = field(default_factory=list)
    source_lines: list[str] = field(default_factory=list)

    def describe(self) -> str:
        """Plain language, because row status codes help nobody."""
        shape = {
            "tab": "a table copied out of a spreadsheet or an email",
            "comma": "comma separated values",
            "list": "a plain list",
            "lines": "one entry per line",
        }.get(self.delimiter, "a list")
        named = [c for c in self.columns if c]
        head = f"Read {len(self.rows)} row{'' if len(self.rows) == 1 else 's'} from {shape}"
        if self.header_row:
            return f"{head}, using the first row as column headings."
        if named:
            return f"{head}. Columns were worked out from their contents: {', '.join(named)}."
        return f"{head}."


def _split_lines(text: str) -> list[str]:
    return [ln for ln in (l.strip("\r") for l in str(text or "").split("\n")) if ln.strip()]


def _rows_for(lines: list[str], delimiter: str) -> list[list[str]]:
    if delimiter == "tab":
        return [[c.strip() for c in ln.split("\t")] for ln in lines]
    if delimiter == "comma":
        reader = csv.reader(io.StringIO("\n".join(lines)))
        return [[c.strip() for c in row] for row in reader if any(c.strip() for c in row)]
    if delimiter == "list":
        out: list[list[str]] = []
        for ln in lines:
            out.extend([[part.strip()] for part in ln.split(",") if part.strip()])
        return out
    return [[ln.strip()] for ln in lines]


def _sniff_delimiter(lines: list[str]) -> str:
    if any("\t" in ln for ln in lines):
        return "tab"
    comma_counts = {ln.count(",") for ln in lines}
    if comma_counts == {0}:
        return "lines"
    if len(comma_counts) == 1:
        return "comma"
    return "list"


def _header_match(cell: str, fields: Sequence[Field_]) -> Optional[str]:
    token = re.sub(r"[^a-z0-9]+", " ", cell.lower()).strip()
    if not token:
        return None
    best: Optional[tuple[int, str]] = None
    for f in fields:
        for word in f.words:
            if token == word:
                return f.name
            if word in token.split() or token in word:
                if best is None or f.priority < best[0]:
                    best = (f.priority, f.name)
    return best[1] if best else None


def _looks_like_header(first: list[str], fields: Sequence[Field_]) -> bool:
    if not first:
        return False
    matched = sum(1 for cell in first if _header_match(cell, fields))
    return matched >= max(1, (len(first) + 1) // 2)


def parse(text: str, fields: Sequence[Field_]) -> Parsed:
    lines = _split_lines(text)
    if not lines:
        return Parsed()

    delimiter = _sniff_delimiter(lines)
    grid = _rows_for(lines, delimiter)
    if not grid:
        return Parsed(delimiter=delimiter)

    width = max(len(r) for r in grid)
    grid = [r + [""] * (width - len(r)) for r in grid]

    header_row: Optional[list[str]] = None
    columns: list[Optional[str]] = [None] * width

    if _looks_like_header(grid[0], fields):
        header_row = grid[0]
        grid = grid[1:]
        columns = [_header_match(cell, fields) for cell in header_row]
    else:
        # No header, so judge each column by what is in it. A column is only
        # claimed once: two columns of digits are not both the employee ID.
        taken: set[str] = set()
        by_priority = sorted(fields, key=lambda f: f.priority)
        for index in range(width):
            values = [r[index] for r in grid if r[index]]
            if not values:
                continue
            for f in by_priority:
                if f.name in taken or f.looks_like is None:
                    continue
                if f.looks_like(values):
                    columns[index] = f.name
                    taken.add(f.name)
                    break

    rows: list[dict[str, str]] = []
    source_lines: list[str] = []
    for r in grid:
        if not any(c.strip() for c in r):
            continue
        row: dict[str, str] = {}
        for index, name in enumerate(columns):
            if name and r[index].strip():
                row[name] = r[index].strip()
        rows.append(row)
        source_lines.append(" ".join(c for c in r if c).strip())

    unmapped = [header_row[i] for i, c in enumerate(columns)
                if c is None and header_row and header_row[i].strip()] if header_row else []

    return Parsed(rows=rows, columns=columns, header_row=header_row,
                  delimiter=delimiter, unmapped=unmapped, source_lines=source_lines)


# ---------------------------------------------------------------------------
# Column shapes, shared by the callers
# ---------------------------------------------------------------------------
def mostly(values: list[str], test: Callable[[str], bool], share: float = 0.7) -> bool:
    if not values:
        return False
    hits = sum(1 for v in values if test(v))
    return hits / len(values) >= share


def is_email(values: list[str]) -> bool:
    return mostly(values, lambda v: bool(_EMAIL.match(v)))


def is_phone(values: list[str]) -> bool:
    return mostly(values, lambda v: bool(_PHONE.match(v)) and sum(c.isdigit() for c in v) >= 7)


def is_id(values: list[str]) -> bool:
    """A badge number: all digits, or digits with a short prefix like TW-4471."""
    return mostly(values, lambda v: bool(_DIGITS.match(v))
                  or bool(re.match(r"^[A-Za-z]{1,4}[-_ ]?\d{2,}$", v)))


def is_money(values: list[str]) -> bool:
    return mostly(values, lambda v: bool(_MONEY.match(v)))


def is_name(values: list[str]) -> bool:
    def one(v: str) -> bool:
        if _EMAIL.match(v) or _DIGITS.match(v):
            return False
        return 1 <= len(v.split()) <= 4 and any(c.isalpha() for c in v)
    return mostly(values, one)


def is_sentence(values: list[str]) -> bool:
    """A description: several words, and longer than a name."""
    return mostly(values, lambda v: len(v.split()) >= 3 and any(c.isalpha() for c in v))


def to_number(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    text = str(value).replace("$", "").replace(",", "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None
