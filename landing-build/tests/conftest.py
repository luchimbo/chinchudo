import pytest


@pytest.fixture(autouse=True)
def _no_local_llm_by_default(monkeypatch):
    # load_env() copies the machine's .env (which may say LLM_PROVIDER=local) into os.environ.
    # Tests talk to OpenRouter mocks unless they opt into the local LLM themselves.
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
