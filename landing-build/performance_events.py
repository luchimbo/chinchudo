"""Content-free timings shared by nested Blog generation operations."""
from contextvars import ContextVar
from functools import wraps
import json
import os
import sys
import time
import uuid

_operation = ContextVar("blog_performance_operation", default=None)


def timed_stage(stage):
    def decorate(work):
        @wraps(work)
        def measured(*args, **kwargs):
            token = None
            if _operation.get() is None:
                operation_id = os.environ.get("BLOG_OPERATION_ID") or os.environ.get("BLOG_PREPARATION_ATTEMPT_ID") or str(uuid.uuid4())
                token = _operation.set(operation_id)
            started = time.perf_counter()
            ok = False
            try:
                result = work(*args, **kwargs)
                ok = True
                return result
            finally:
                # Do not serialize arguments, results, errors, client data or keys.
                print(json.dumps({"event": "performance", "operation": "blog", "operationId": _operation.get(), "stage": stage,
                                  "durationMs": round((time.perf_counter() - started) * 1000), "ok": ok}), file=sys.stderr, flush=True)
                if token is not None:
                    _operation.reset(token)
        return measured
    return decorate
