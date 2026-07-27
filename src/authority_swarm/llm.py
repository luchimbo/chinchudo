from litellm import completion

from authority_swarm.config import get_settings


def chat(system: str, user: str, temperature: float = 0.3, model: str | None = None, max_tokens: int | None = None) -> str:
    settings = get_settings()
    provider = settings.active_llm_provider
    is_local = provider == "local"
    api_key = (settings.llm_local_api_key or settings.llm_api_key or "ollama") if is_local else settings.openrouter_api_key
    if not api_key:
        raise RuntimeError(f"Falta API key para el proveedor {provider}")

    selected_model = (settings.llm_local_model or settings.llm_model) if is_local else (model or settings.openrouter_model)
    if is_local and not selected_model.startswith("openai/"):
        selected_model = f"openai/{selected_model}"

    kwargs = {"max_tokens": max_tokens} if max_tokens else {}
    if is_local:
        kwargs["api_base"] = (settings.llm_local_base_url or settings.llm_base_url).rstrip("/")
    response = completion(
        model=selected_model,
        api_key=api_key,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        **kwargs,
    )
    return response.choices[0].message.content or ""
