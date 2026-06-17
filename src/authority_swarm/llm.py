from litellm import completion

from authority_swarm.config import get_settings


def chat(system: str, user: str, temperature: float = 0.3, model: str | None = None, max_tokens: int | None = None) -> str:
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise RuntimeError("Falta OPENROUTER_API_KEY en .env")

    kwargs = {"max_tokens": max_tokens} if max_tokens else {}
    response = completion(
        model=model or settings.openrouter_model,
        api_key=settings.openrouter_api_key,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        **kwargs,
    )
    return response.choices[0].message.content or ""
