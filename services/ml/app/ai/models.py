"""Which AI tool models are installed, and loading them (once, on first use) into ONNX Runtime."""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from .. import config

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModelInfo:
    tool: str      # remove_background | erase | upscale
    name: str      # shown in /ai/capabilities
    file: str      # inside config.AI_MODELS_DIR (scripts/fetch_models.py writes it)


MODELS: dict[str, ModelInfo] = {
    "remove_background": ModelInfo("remove_background", "birefnet-lite", "birefnet-lite.onnx"),
    "erase": ModelInfo("erase", "lama", "lama.onnx"),
    "upscale": ModelInfo("upscale", "realesr-general-x4v3", "realesr-general-x4v3.onnx"),
}


class ModelRegistry:
    """Finds model files and keeps one ONNX Runtime session per tool."""

    def __init__(self, models_dir: Optional[Path] = None, threads: int = config.AI_ORT_THREADS):
        self.models_dir = Path(models_dir or config.AI_MODELS_DIR)
        self.threads = threads
        self._sessions: dict[str, Any] = {}
        self._locks = {tool: threading.Lock() for tool in MODELS}  # loading LaMa (~20 s) must not block the others

    def path(self, tool: str) -> Path:
        return self.models_dir / MODELS[tool].file

    def available(self, tool: str) -> bool:
        p = self.path(tool)
        return p.is_file() and p.stat().st_size > 0 and _ort_installed()

    def reason(self, tool: str) -> Optional[str]:
        if not _ort_installed():
            return "onnxruntime is not installed on the server"
        if not self.available(tool):
            return "Model not installed (run scripts/fetch_models.py)"
        return None

    def session(self, tool: str):
        """The tool's InferenceSession, created on first use. Raises FileNotFoundError if absent."""
        with self._locks[tool]:
            if tool not in self._sessions:
                if not self.available(tool):
                    raise FileNotFoundError(self.path(tool))
                import onnxruntime as ort

                opts = ort.SessionOptions()
                opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                # No memory arena: with it, BiRefNet keeps its ~6 GB peak after every request (and
                # grew to ~12 GB over two runs); without it memory goes back to ~350 MB, same speed.
                opts.enable_cpu_mem_arena = False
                if self.threads > 0:
                    opts.intra_op_num_threads = self.threads
                self._sessions[tool] = ort.InferenceSession(
                    str(self.path(tool)), sess_options=opts, providers=["CPUExecutionProvider"])
            return self._sessions[tool]

    def preload(self) -> None:
        """Load every installed model now (startup, background thread) so the first request is fast."""
        for tool in MODELS:
            if self.available(tool):
                try:
                    started = time.perf_counter()
                    self.session(tool)
                    log.info("AI model for %s loaded in %.1f s", tool, time.perf_counter() - started)
                except Exception:
                    log.exception("Could not load the AI model for %s", tool)


def _ort_installed() -> bool:
    try:
        import onnxruntime  # noqa: F401
    except ImportError:
        return False
    return True
