"""Helper de reintentos con backoff exponencial y jitter.

Uso:

    from _retry import retry_call, RetryExhausted

    result = retry_call(
        fn=lambda: do_something(),
        attempts=int(os.environ.get("RETRY_ATTEMPTS", "6")),
        base=float(os.environ.get("RETRY_BASE_DELAY", "1.5")),
        max_delay=float(os.environ.get("RETRY_MAX_DELAY", "30.0")),
        on_retry=lambda attempt, exc: log.warning("reintento", attempt=attempt, error=str(exc)),
    )
"""

import random
import time
from typing import Callable, TypeVar

T = TypeVar("T")


class RetryExhausted(RuntimeError):
    """Se lanzaron todos los intentos sin éxito."""

    def __init__(self, attempts: int, last_exc: BaseException | None = None):
        super().__init__(f"Fallaron {attempts} intentos. Último error: {last_exc}")
        self.last_exc = last_exc


def retry_call(
    fn: Callable[[], T],
    attempts: int = 6,
    base: float = 1.5,
    max_delay: float = 30.0,
    jitter: float = 0.5,
    on_retry: Callable[[int, BaseException], None] | None = None,
) -> T:
    """
    Llama fn() hasta `attempts` veces con backoff exponencial + jitter.
    Lanza RetryExhausted si todos los intentos fallan.

    Delay entre intentos: min(base * 2^attempt + random(0, jitter), max_delay)
    """
    last_exc: BaseException | None = None
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if attempt == attempts - 1:
                break
            delay = min(base * (2 ** attempt) + random.uniform(0, jitter), max_delay)
            if on_retry:
                on_retry(attempt + 1, exc)
            time.sleep(delay)
    raise RetryExhausted(attempts, last_exc)
