"""Shared failures for CLI entry points and imported recovery helpers."""


class AutomationError(RuntimeError):
    """A safe failure that must not trigger another game attempt."""
