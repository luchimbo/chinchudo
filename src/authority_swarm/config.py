from functools import lru_cache
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path.cwd()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    openrouter_model: str = Field(default="openrouter/anthropic/claude-3.5-haiku", alias="OPENROUTER_MODEL")
    openrouter_models: str = Field(default="", alias="OPENROUTER_MODELS")
    llm_provider: str = Field(default="schedule", alias="LLM_PROVIDER")
    llm_base_url: str = Field(default="", alias="LLM_BASE_URL")
    llm_model: str = Field(default="", alias="LLM_MODEL")
    llm_api_key: str = Field(default="", alias="LLM_API_KEY")
    llm_local_base_url: str = Field(default="", alias="LLM_LOCAL_BASE_URL")
    llm_local_model: str = Field(default="", alias="LLM_LOCAL_MODEL")
    llm_local_api_key: str = Field(default="", alias="LLM_LOCAL_API_KEY")
    llm_schedule_timezone: str = Field(default="America/Argentina/Buenos_Aires", alias="LLM_SCHEDULE_TIMEZONE")
    llm_local_start: str = Field(default="09:30", alias="LLM_LOCAL_START")
    llm_local_end: str = Field(default="17:30", alias="LLM_LOCAL_END")
    serper_api_key: str = Field(default="", alias="SERPER_API_KEY")
    brand_person: str = Field(default="Guillermo Rodriguez", alias="BRAND_PERSON")
    brands: str = Field(default="PCMidi", alias="BRANDS")

    @property
    def brand_list(self) -> list[str]:
        return [brand.strip() for brand in self.brands.split(",") if brand.strip()]

    @property
    def model_list(self) -> list[str]:
        models = [model.strip() for model in self.openrouter_models.split(",") if model.strip()]
        return models or [self.openrouter_model]

    @property
    def active_llm_provider(self) -> str:
        configured = self.llm_provider.strip().lower()
        if configured in {"local", "openrouter"}:
            return configured
        try:
            now = datetime.now(ZoneInfo(self.llm_schedule_timezone))
        except Exception:
            now = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires"))
        current = now.hour * 60 + now.minute
        start = _parse_schedule_time(self.llm_local_start, 9 * 60 + 30)
        end = _parse_schedule_time(self.llm_local_end, 17 * 60 + 30)
        return "local" if (start <= current < end if start <= end else current >= start or current < end) else "openrouter"


def _parse_schedule_time(value: str, fallback: int) -> int:
    try:
        hours, minutes = map(int, value.split(":"))
        if 0 <= hours <= 23 and 0 <= minutes <= 59:
            return hours * 60 + minutes
    except ValueError:
        pass
    return fallback


@lru_cache
def get_settings() -> Settings:
    load_dotenv()
    return Settings()


def ensure_dirs() -> None:
    for path in [
        ROOT / "docs" / "pcmidi",
        ROOT / "docs" / "pcmidi" / "products",
        ROOT / "docs" / "pcmidi" / "categories",
        ROOT / "data",
        ROOT / "outputs" / "landing_pages",
        ROOT / "outputs" / "landing_reports",
    ]:
        path.mkdir(parents=True, exist_ok=True)
