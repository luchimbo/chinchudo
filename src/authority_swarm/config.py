from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path.cwd()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    openrouter_model: str = Field(default="openrouter/anthropic/claude-3.5-haiku", alias="OPENROUTER_MODEL")
    openrouter_models: str = Field(default="", alias="OPENROUTER_MODELS")
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
