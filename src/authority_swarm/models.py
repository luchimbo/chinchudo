from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator


class OpportunityIntent(StrEnum):
    technical_problem = "technical_problem"
    commercial_question = "commercial_question"
    tool_search = "tool_search"
    competitor_comparison = "competitor_comparison"
    educational_content = "educational_content"


class Opportunity(BaseModel):
    source: str
    url: str = ""
    platform: str = ""
    community: str = ""
    author: str = ""
    result_type: str = ""
    geo_scope: str = "unknown"

    @field_validator("source", "url", "platform", "community", "author", "result_type", "geo_scope", "title", "original_text", "question_or_problem", "rationale", mode="before")
    @classmethod
    def _coerce_none_to_empty(cls, v: str | None) -> str:
        return v or ""

    title: str
    original_text: str = ""
    question_or_problem: str
    intent: OpportunityIntent = OpportunityIntent.educational_content
    priority: int = Field(default=3, ge=1, le=5)
    rationale: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Draft(BaseModel):
    opportunity_id: int
    title: str
    content_type: str
    markdown: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DraftReview(BaseModel):
    draft_id: int
    verdict: str
    risk_level: str
    issues: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class OpportunityCuration(BaseModel):
    opportunity_id: int
    decision: str
    score: int = Field(ge=1, le=10)
    reason: str
    suggested_angle: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("decision", "reason", "suggested_angle", mode="before")
    @classmethod
    def _coerce_none_to_empty(cls, v: str | None) -> str:
        return v or ""


class ContentPlanItem(BaseModel):
    opportunity_id: int
    priority: int = Field(ge=1, le=5)
    channel: str
    action: str
    title: str
    angle: str
    rationale: str

    @field_validator("channel", "action", "title", "angle", "rationale", mode="before")
    @classmethod
    def _coerce_none_to_empty(cls, v: str | None) -> str:
        return v or ""


class ContentPlan(BaseModel):
    title: str
    summary: str
    items: list[ContentPlanItem] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("title", "summary", mode="before")
    @classmethod
    def _coerce_none_to_empty(cls, v: str | None) -> str:
        return v or ""


class DistributionOpportunity(BaseModel):
    source: str = ""
    url: str = ""
    platform: str = ""
    target_type: str = ""
    brand: str = ""
    topic: str = ""
    action_type: str = ""
    priority: int = Field(default=3, ge=1, le=5)
    authority_score: int = Field(default=5, ge=1, le=10)
    risk_level: str = "medium"
    pitch: str = ""
    rationale: str = ""
    status: str = "new"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("source", "url", "platform", "target_type", "brand", "topic", "action_type", "risk_level", "pitch", "rationale", "status", mode="before")
    @classmethod
    def _coerce_none_to_empty(cls, v: str | None) -> str:
        return v or ""


class LandingResearchItem(BaseModel):
    topic: str
    source: str = ""
    url: str = ""
    platform: str = ""
    title: str = ""
    snippet: str = ""
    need: str = ""
    intent: str = ""
    geo_scope: str = "unknown"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("topic", "source", "url", "platform", "title", "snippet", "need", "intent", "geo_scope", mode="before")
    @classmethod
    def _coerce_none_to_empty(cls, v: str | None) -> str:
        return v or ""


class LandingPage(BaseModel):
    topic: str
    title: str
    slug: str
    markdown: str
    cta_url: str = "https://www.pcmidi.com.ar/"
    status: str = "draft"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("topic", "title", "slug", "markdown", "cta_url", "status", mode="before")
    @classmethod
    def _coerce_none_to_empty(cls, v: str | None) -> str:
        return v or ""


class LandingReview(BaseModel):
    landing_id: int
    verdict: str
    risk_level: str
    issues: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuditResult(BaseModel):
    question: str
    model: str
    answer: str
    mentions_brands: list[str]
    mentions_person: bool
    mentions_competitors: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
