"""Safe text matching for searches."""

ESCAPE = "\\"


def contains(term: str) -> str:
    """A LIKE pattern matching `term` anywhere, with %, _ and \\ taken literally (use with escape=ESCAPE)."""
    escaped = term.lower().replace(ESCAPE, ESCAPE * 2).replace("%", r"\%").replace("_", r"\_")
    return f"%{escaped}%"


def search_stems(q: str) -> list[str]:
    """Words of a search with simple plural endings trimmed ("mugs" → "mug", "boxes" → "box"), so substring
    matching also finds the singular. At most 8 words."""
    stems = []
    for word in q.lower().split()[:8]:
        if len(word) > 4 and word.endswith("es"):
            word = word[:-2]
        elif len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
            word = word[:-1]
        stems.append(word)
    return stems
