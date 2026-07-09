"""Schemas for user-scoped AI provider configurations."""

from __future__ import annotations

from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.base import BaseSchema, TimestampSchema

_URL_PATTERN = r"^https?://"


class UserProviderBase(BaseSchema):
    name: str = Field(..., min_length=1, max_length=128)
    base_url: str = Field(..., min_length=1, max_length=512)
    is_enabled: bool = False
    is_preset: bool = False

    @field_validator("base_url")
    @classmethod
    def _validate_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("base_url must start with http:// or https://")
        return v


class UserProviderCreate(UserProviderBase):
    """Create a custom provider (presets are seeded, not created via API)."""

    name: str = Field(..., min_length=1, max_length=128)
    base_url: str = Field(..., min_length=1, max_length=512)
    api_key: str = Field(default="", max_length=10_000)
    is_enabled: bool = False

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be empty")
        return v


class UserProviderUpdate(BaseSchema):
    """Patch an existing provider configuration."""

    name: str | None = Field(default=None, min_length=1, max_length=128)
    base_url: str | None = Field(default=None, min_length=1, max_length=512)
    api_key: str | None = Field(default=None, max_length=10_000)
    is_enabled: bool | None = None

    @field_validator("base_url")
    @classmethod
    def _validate_url_optional(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v.startswith(("http://", "https://")):
                raise ValueError("base_url must start with http:// or https://")
        return v


class UserProviderRead(UserProviderBase, TimestampSchema):
    id: UUID
    api_key: str = ""


class UserProviderList(BaseSchema):
    items: list[UserProviderRead]
    total: int
