"""Business logic for user-scoped AI provider configurations.

Supports two types of providers:
  - **Preset** providers (Google Gemini, GitHub Models, etc.) — seeded on
    first login, users can enable/disable and update API keys/URLs.
  - **Custom** providers — user-defined, fully editable, deletable.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AlreadyExistsError, BadRequestError, NotFoundError
from app.db.models.user_provider import UserProvider
from app.repositories import user_provider_repo
from app.schemas.user_provider import UserProviderCreate, UserProviderUpdate

# Preset providers with official API URLs seeded for every new user.
PRESET_PROVIDERS: list[dict[str, str]] = [
    {"name": "Google Gemini", "base_url": "https://generativelanguage.googleapis.com/v1beta"},
    {"name": "GitHub Models", "base_url": "https://models.inference.ai.azure.com"},
    {"name": "NVIDIA NIM", "base_url": "https://integrate.api.nvidia.com/v1"},
    {"name": "ModelScope", "base_url": "https://api.modelscope.cn/v1"},
    {"name": "Cohere", "base_url": "https://api.cohere.ai/v1"},
    {"name": "Agnes AI", "base_url": "https://api.agnesai.com/v1"},
]


class UserProviderService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_for_user(self, *, user_id: UUID) -> tuple[list[UserProvider], int]:
        """List all providers for a user, seeding presets on first access."""
        items, total = await user_provider_repo.list_for_user(self.db, user_id=user_id)
        if total == 0:
            # First access: seed preset providers
            items = await self._seed_presets(user_id=user_id)
            total = len(items)
        return items, total

    async def _seed_presets(self, *, user_id: UUID) -> list[UserProvider]:
        """Create preset provider rows for a new user."""
        items: list[UserProvider] = []
        for preset in PRESET_PROVIDERS:
            provider = await user_provider_repo.create(
                self.db,
                user_id=user_id,
                name=preset["name"],
                base_url=preset["base_url"],
                api_key="",
                is_enabled=False,
                is_preset=True,
            )
            items.append(provider)
        return items

    async def upsert_presets(self, *, user_id: UUID) -> list[UserProvider]:
        """Ensure all preset providers exist for this user.
        Called on every list to merge any new presets added in app updates.
        """
        existing, _ = await user_provider_repo.list_for_user(self.db, user_id=user_id)
        existing_names = {p.name for p in existing}

        new_presets: list[UserProvider] = []
        for preset in PRESET_PROVIDERS:
            if preset["name"] not in existing_names:
                provider = await user_provider_repo.create(
                    self.db,
                    user_id=user_id,
                    name=preset["name"],
                    base_url=preset["base_url"],
                    api_key="",
                    is_enabled=False,
                    is_preset=True,
                )
                new_presets.append(provider)

        all_items = existing + new_presets
        return all_items

    async def create_custom(
        self, *, user_id: UUID, data: UserProviderCreate
    ) -> UserProvider:
        """Create a user-defined custom provider."""
        existing = await user_provider_repo.get_by_name(
            self.db, user_id=user_id, name=data.name
        )
        if existing is not None:
            raise AlreadyExistsError(
                message="A provider with this name already exists",
                details={"name": data.name},
            )
        try:
            return await user_provider_repo.create(
                self.db,
                user_id=user_id,
                name=data.name,
                base_url=data.base_url,
                api_key=data.api_key,
                is_enabled=data.is_enabled,
                is_preset=False,
            )
        except IntegrityError as exc:
            raise AlreadyExistsError(
                message="A provider with this name already exists",
                details={"name": data.name},
            ) from exc

    async def update(
        self, *, user_id: UUID, provider_id: UUID, data: UserProviderUpdate
    ) -> UserProvider:
        """Update an existing provider configuration."""
        db_provider = await self._get_owned(user_id=user_id, provider_id=provider_id)
        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            return db_provider

        if "name" in update_data and update_data["name"] != db_provider.name:
            collision = await user_provider_repo.get_by_name(
                self.db, user_id=user_id, name=update_data["name"]
            )
            if collision is not None and collision.id != db_provider.id:
                raise AlreadyExistsError(
                    message="A provider with this name already exists",
                    details={"name": update_data["name"]},
                )

        return await user_provider_repo.update(
            self.db, db_provider=db_provider, update_data=update_data
        )

    async def delete(self, *, user_id: UUID, provider_id: UUID) -> None:
        """Delete a custom provider. Preset providers cannot be deleted."""
        db_provider = await self._get_owned(user_id=user_id, provider_id=provider_id)
        if db_provider.is_preset:
            raise BadRequestError(
                message="Preset providers cannot be deleted. Disable them instead.",
                details={"provider_id": str(provider_id)},
            )
        await user_provider_repo.delete(self.db, db_provider=db_provider)

    async def _get_owned(
        self, *, user_id: UUID, provider_id: UUID
    ) -> UserProvider:
        db_provider = await user_provider_repo.get_by_id(self.db, provider_id)
        if db_provider is None or db_provider.user_id != user_id:
            raise NotFoundError(
                message="Provider not found",
                details={"provider_id": str(provider_id)},
            )
        return db_provider
