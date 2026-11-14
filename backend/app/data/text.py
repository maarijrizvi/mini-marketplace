"""Safe text matching for searches."""

ESCAPE = "\\"


def contains(term: str) -> str:
    """A LIKE pattern matching `term` anywhere, with %, _ and \\ taken literally (use with escape=ESCAPE)."""
    escaped = term.lower().replace(ESCAPE, ESCAPE * 2).replace("%", r"\%").replace("_", r"\_")
    return f"%{escaped}%"
