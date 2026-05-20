"""Pydantic request/response schemas for the HTTP API."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    thread_id: str = Field(..., description="Stable conversation id from the client.")
    message: str = Field(..., min_length=1)


class ResumeRequest(BaseModel):
    thread_id: str
    answer: str = Field(..., min_length=1)


class AgentEventOut(BaseModel):
    agent: str
    summary: str
    detail: dict


class SourceOut(BaseModel):
    title: str
    url: str
    snippet: str = ""


class ChatResponse(BaseModel):
    status: Literal["complete", "needs_clarification"]
    thread_id: str
    answer: str | None = None
    clarification_question: str | None = None
    agent_trail: list[AgentEventOut] = Field(default_factory=list)
    # Research evidence collected this turn — surfaced as clickable cards in the UI.
    sources: list[SourceOut] = Field(default_factory=list)
    confidence_score: float | None = None
    research_attempts: int | None = None
    validation_result: str | None = None
    company_focus: str | None = None


class MessageOut(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ThreadHistoryResponse(BaseModel):
    thread_id: str
    messages: list[MessageOut]
    company_focus: str | None = None
