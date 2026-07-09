"""User-scoped AI provider configurations.

Each row stores one AI provider the user has configured, including
preset providers (Google Gemini, GitHub Models, etc.) and custom ones.
API keys are stored as plain text; production deployments should
encrypt them at rest via a database-level encryption extension.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.user import User


class UserProvider(Base, TimestampMixin):
    """An AI provider configuration scoped to one user."""

    __tablename__ = "user_providers"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_providers_user_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    api_key: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_preset: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user: Mapped[User] = relationship("User", lazy="joined")

    def __repr__(self) -> str:
        kind = "preset" if self.is_preset else "custom"
        return (
            f"<UserProvider({kind} name={self.name} "
            f"enabled={self.is_enabled})>"
        )
