"""Shared CPython/browser package: shared oxygen, criteria and resistance engine."""

__version__ = "0.1.0a0"


def runtime_info() -> dict[str, str]:
    """Report the actual runtime; this is not a numerical validation result."""
    import platform

    import numpy

    return {
        "package": __version__,
        "python": platform.python_version(),
        "numpy": numpy.__version__,
        "implementation_stage": "T02R",
    }
