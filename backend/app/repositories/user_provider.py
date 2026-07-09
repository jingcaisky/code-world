"""Data access for user-scoped AI provider configurations (PostgreSQL async)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.user_provider import UserProvider


async def get_by_id(db: AsyncSession, provider_id: UUID) -> UserProvider | None:
    result = await db.execute(
        select(UserProvider).where(UserProvider.id == provider_id)
    )
    return result.scalar_one_or_none()


async def get_by_name(
    db: AsyncSession, *, user_id: UUID, name: str
) -> UserProvider | None:
    result = await db.execute(
        select(UserProvider).where(
            UserProvider.user_id == user_id,
            UserProvider.name == name,
        )
    )
    return result.scalar_one_or_none()


async def list_for_user(
    db: AsyncSession, *, user_id: UUID
) -> tuple[list[UserProvider], int]:
    stmt = (
        select(UserProvider)
        .where(UserProvider.user_id == user_id)
        .order_by(UserProvider.is_preset.desc(), UserProvider.created_at.asc())
    )
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()
    items = list((await db.execute(stmt)).scalars())
    return items, total


async def create(
    db: AsyncSession,
    *,
    user_id: UUID,
    name: str,
    base_url: str,
    api_key: str = "",
    is_enabled: bool = False,
    is_preset: bool = False,
) -> UserProvider:
    provider = UserProvider(
        user_id=user_id,
        name=name,
        base_url=base_url,
        api_key=api_key,
        is_enabled=is_enabled,
        is_preset=is_preset,
    )
    db.add(provider)
    await db.flush()
    await db.refresh(provider)
    return provider


async def update(
    db: AsyncSession,
    *,
    db_provider: UserProvider,
    update_data: dict[str, Any],
) -> UserProvider:
    for field, value in update_data.items():
        setattr(db_provider, field, value)
    await db.flush()
    await db.refresh(db_provider)
    return db_provider


async def delete(db: AsyncSession, *, db_provider: UserProvider) -> None:
    await db.delete(db_provider)
    await db.flush()
