from . import fixed_window, hierarchical, metadata_aware, passage_native, semantic
from .base import Chunk, SourceRow

STRATEGIES = {
    fixed_window.STRATEGY: fixed_window,
    passage_native.STRATEGY: passage_native,
    metadata_aware.STRATEGY: metadata_aware,
    hierarchical.STRATEGY: hierarchical,
    semantic.STRATEGY: semantic,
}

__all__ = ["Chunk", "SourceRow", "STRATEGIES"]
