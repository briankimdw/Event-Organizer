"""Background worker: analyse every photo that doesn't have an embedding yet.

    python -m app.worker            # keep running, check every 30 seconds
    python -m app.worker --once     # process what's waiting, then exit
"""
from __future__ import annotations

import argparse
import logging
import time

from . import config
from .siglip import SigLIP, to_pgvector
from .store import Store

log = logging.getLogger("ml.worker")

# Photos that failed this session (e.g. unreadable file) are skipped instead of retried forever.
_failed: set[str] = set()


def run_once(engine: SigLIP, store: Store, batch_size: int = config.BATCH_SIZE) -> int:
    """Analyse one batch of waiting photos. Returns how many were saved."""
    pending = [p for p in store.pending_photos(batch_size + len(_failed)) if p["photo_id"] not in _failed][:batch_size]
    if not pending:
        return 0

    images, ready = [], []
    for photo in pending:
        try:
            images.append(store.download(photo["display_path"]))
            ready.append(photo)
        except Exception as exc:  # missing or unreadable file
            log.warning("skipping %s: %s", photo["photo_id"], exc)
            _failed.add(photo["photo_id"])

    saved = 0
    for photo, (embedding, tags) in zip(ready, engine.analyze(images) if images else []):
        try:
            store.save(photo["photo_id"], to_pgvector(embedding), tags, engine.model_id)
            saved += 1
            log.info("photo %s -> %s", photo["photo_id"], ", ".join(tags) or "(no tags)")
        except Exception as exc:
            log.warning("could not save %s: %s", photo["photo_id"], exc)
            _failed.add(photo["photo_id"])
    return saved


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyse new photos with SigLIP.")
    parser.add_argument("--once", action="store_true", help="process what's waiting, then exit")
    parser.add_argument("--interval", type=int, default=30, help="seconds between checks")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    store = Store()
    log.info("loading %s ...", config.MODEL_ID)
    engine = SigLIP()
    log.info("ready on %s", engine.device)

    while True:
        total = 0
        while (n := run_once(engine, store)) > 0:  # drain the backlog
            total += n
        if total:
            log.info("analysed %d photo(s)", total)
        if args.once:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
