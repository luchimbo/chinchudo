"""Tests del helper de reintentos con backoff exponencial."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from _retry import retry_call, RetryExhausted


class TestRetryCall:
    def test_success_on_first_try(self):
        calls = []
        result = retry_call(lambda: calls.append(1) or "ok", attempts=3)
        assert result == "ok"
        assert len(calls) == 1

    def test_retries_and_succeeds(self):
        calls = []
        def fn():
            calls.append(1)
            if len(calls) < 3:
                raise ValueError("aún no")
            return "listo"
        result = retry_call(fn, attempts=5, base=0.01)
        assert result == "listo"
        assert len(calls) == 3

    def test_exhausts_all_attempts(self):
        calls = []
        def fn():
            calls.append(1)
            raise RuntimeError("siempre falla")
        try:
            retry_call(fn, attempts=3, base=0.01)
            assert False, "debería haber lanzado RetryExhausted"
        except RetryExhausted as exc:
            assert exc.last_exc is not None
            assert "siempre falla" in str(exc.last_exc)
        assert len(calls) == 3

    def test_on_retry_callback(self):
        retries = []
        def fn():
            raise ValueError("falla")
        try:
            retry_call(fn, attempts=3, base=0.01, on_retry=lambda a, e: retries.append(a))
        except RetryExhausted:
            pass
        assert retries == [1, 2]  # 2 callbacks antes del último intento

    def test_max_delay_respected(self):
        delays = []
        original_sleep = time.sleep
        def fake_sleep(t):
            delays.append(t)
        time.sleep = fake_sleep
        try:
            def fn():
                raise ValueError()
            try:
                retry_call(fn, attempts=5, base=1.0, max_delay=3.0, jitter=0.0)
            except RetryExhausted:
                pass
        finally:
            time.sleep = original_sleep
        # Ningún delay debe superar max_delay (sin jitter)
        for d in delays:
            assert d <= 3.0 + 0.01  # pequeño margen por floats

    def test_single_attempt_no_sleep(self):
        """Con attempts=1 no debería dormir nada."""
        slept = []
        original_sleep = time.sleep
        time.sleep = lambda t: slept.append(t)
        try:
            try:
                retry_call(lambda: (_ for _ in ()).throw(ValueError()), attempts=1)
            except RetryExhausted:
                pass
        finally:
            time.sleep = original_sleep
        assert len(slept) == 0
