"""Resolve LITTLE_HOME for standalone skill scripts.

Skill scripts may run outside the Little process (e.g. system Python,
nix env, CI) where ``little_constants`` is not importable.  This module
provides the same ``get_little_home()`` and ``display_little_home()``
contracts as ``little_constants`` without requiring it on ``sys.path``.

When ``little_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``little_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``LITTLE_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from little_constants import display_little_home as display_little_home
    from little_constants import get_little_home as get_little_home
except (ModuleNotFoundError, ImportError):

    def get_little_home() -> Path:
        """Return the Little home directory (default: ~/.little).

        Mirrors ``little_constants.get_little_home()``."""
        val = os.environ.get("LITTLE_HOME", "").strip()
        return Path(val) if val else Path.home() / ".little"

    def display_little_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``little_constants.display_little_home()``."""
        home = get_little_home()
        try:
            return "~/" + str(home.relative_to(Path.home()))
        except ValueError:
            return str(home)
