"""Stable launcher for the website; implementation lives in backend/."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / 'backend'))
from backend import server as implementation

if __name__ == '__main__':
    implementation.main()
else:
    # Preserve imports and monkeypatching used by existing preview tools.
    sys.modules[__name__] = implementation
