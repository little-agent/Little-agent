"""Regression tests for _apply_profile_override LITTLE_HOME guard (issue #22502).

When LITTLE_HOME is set to the little root (e.g. systemd hardcodes
LITTLE_HOME=/root/.little), _apply_profile_override must still read
active_profile and update LITTLE_HOME to the profile directory.

When LITTLE_HOME is already a profile directory (.../profiles/<name>),
_apply_profile_override must trust it and return without re-reading
active_profile (child-process inheritance contract).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest


def _run_apply_profile_override(
    tmp_path, monkeypatch, *, little_home: str | None, active_profile: str | None,
    argv: list[str] | None = None,
):
    """Run _apply_profile_override in isolation.

    Returns the value of os.environ["LITTLE_HOME"] after the call,
    or None if unset.
    """
    little_root = tmp_path / ".little"
    little_root.mkdir(parents=True, exist_ok=True)

    if active_profile is not None:
        (little_root / "active_profile").write_text(active_profile)

    if active_profile and active_profile != "default":
        (little_root / "profiles" / active_profile).mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    if little_home is not None:
        monkeypatch.setenv("LITTLE_HOME", little_home)
    else:
        monkeypatch.delenv("LITTLE_HOME", raising=False)

    monkeypatch.setattr(sys, "argv", argv or ["little", "gateway", "start"])

    from little_cli.main import _apply_profile_override
    _apply_profile_override()

    return os.environ.get("LITTLE_HOME")


class TestApplyProfileOverrideLittleHomeGuard:
    """Regression guard for issue #22502.

    Verifies that LITTLE_HOME pointing to the little root does NOT suppress
    the active_profile check, while LITTLE_HOME already pointing to a
    profile directory IS trusted as-is.
    """

    def test_little_home_at_root_with_active_profile_is_redirected(
        self, tmp_path, monkeypatch
    ):
        """LITTLE_HOME=/root/.little + active_profile=coder must redirect
        LITTLE_HOME to .../profiles/coder.

        Bug scenario from #22502: systemd sets LITTLE_HOME to the little root
        and the user switches to a profile via `little profile use`.
        Before the fix, the guard returned early and active_profile was ignored.
        """
        little_root = tmp_path / ".little"
        little_root.mkdir(parents=True, exist_ok=True)

        result = _run_apply_profile_override(
            tmp_path,
            monkeypatch,
            little_home=str(little_root),
            active_profile="coder",
        )

        assert result is not None, "LITTLE_HOME must be set after profile redirect"
        assert "profiles" in result, (
            f"Expected LITTLE_HOME to point into profiles/ dir, got: {result!r}"
        )
        assert result.endswith("coder"), (
            f"Expected LITTLE_HOME to end with 'coder', got: {result!r}"
        )

    def test_little_home_already_profile_dir_is_trusted(self, tmp_path, monkeypatch):
        """LITTLE_HOME=.../profiles/coder must not be overridden even when
        active_profile says something different.

        Preserves the child-process inheritance contract: a subprocess spawned
        with LITTLE_HOME already set to a specific profile must stay in that
        profile.
        """
        little_root = tmp_path / ".little"
        profile_dir = little_root / "profiles" / "coder"
        profile_dir.mkdir(parents=True, exist_ok=True)

        (little_root / "active_profile").write_text("other")

        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        monkeypatch.setenv("LITTLE_HOME", str(profile_dir))
        monkeypatch.setattr(sys, "argv", ["little", "gateway", "start"])

        from little_cli.main import _apply_profile_override
        _apply_profile_override()

        assert os.environ.get("LITTLE_HOME") == str(profile_dir), (
            "LITTLE_HOME must remain unchanged when already pointing to a profile dir"
        )

    def test_little_home_unset_reads_active_profile(self, tmp_path, monkeypatch):
        """Classic case: LITTLE_HOME unset + active_profile=coder must set
        LITTLE_HOME to the profile directory (existing behaviour must not regress).
        """
        result = _run_apply_profile_override(
            tmp_path,
            monkeypatch,
            little_home=None,
            active_profile="coder",
        )

        assert result is not None
        assert "coder" in result

    def test_little_home_unset_default_profile_no_redirect(self, tmp_path, monkeypatch):
        """active_profile=default must not redirect LITTLE_HOME."""
        little_root = tmp_path / ".little"
        little_root.mkdir(parents=True, exist_ok=True)

        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        monkeypatch.delenv("LITTLE_HOME", raising=False)
        monkeypatch.setattr(sys, "argv", ["little", "gateway", "start"])
        (little_root / "active_profile").write_text("default")

        from little_cli.main import _apply_profile_override
        _apply_profile_override()

        assert os.environ.get("LITTLE_HOME") is None
