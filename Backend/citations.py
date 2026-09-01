"""citations.py — never print a provision the project has not verified."""

# Every entry in 02 §15 that is not yet checked against the gazette.
UNVERIFIED = {
    "R12-13": "L-01", "R2m": "L-02", "R1sched": "L-03", "R7-nq": "L-04",
    "R5": "L-05", "R4sched": "L-06", "R7-card": "L-07", "R7-4-area": "L-08",
    "R8": "L-09", "R9": "L-10", "R7-2": "L-11", "S36": "L-12",
    "R6-10A": "L-13", "R5sched": "L-14", "R26a": "L-15",
}


def cite(key: str, descriptive: str) -> str:
    """Returns a pinpoint citation only where the provision is verified.

    Where it is not, returns the descriptive requirement plus the ledger
    reference. An inspector can act on 'the prohibited-qualifier provision in
    Rules 12-13'; nobody can defend 'Rule 12(6)' if the project has not read
    Rule 12(6).
    """
    ledger = UNVERIFIED.get(key)
    if ledger:
        return f"{descriptive} [{ledger} — unverified]"
    return descriptive
