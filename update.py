"""Convenience launcher for the game-data scraper so you can run `python update.py` from the repo root.

Resolves the scraper path relative to this file (not the current directory) and forwards any extra args to main.py.
"""

import runpy
import sys
from pathlib import Path

SCRAPER = Path(__file__).resolve().parent / "scripts" / "data-scraper" / "main.py"

if __name__ == "__main__":
    if not SCRAPER.exists():
        sys.exit(f"Could not find scraper at {SCRAPER}")

    sys.argv = [str(SCRAPER), *sys.argv[1:]]
    runpy.run_path(str(SCRAPER), run_name="__main__")
