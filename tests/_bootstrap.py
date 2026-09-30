"""Expose backend modules to standalone tests and preview scripts."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
