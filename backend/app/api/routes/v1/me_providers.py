"""User-scoped AI provider configuration settings.

Routes are nested under ``/me/providers`` because they're always
operating on the current user — there's no cross-user view of these.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, UserProviderSvc
from app.schemas.user_provider import (
    UserProviderCreate,
    UserProviderList,
    UserProviderRead,
    UserProviderUpdate,
)

router = APIRouter()


@router.get("", response_model=UserProviderList)
async def list_providers(
    service: UserProviderSvc, user: CurrentUser
) -> Any:
    """List the current user's AI provider configurations."""
    # Ensure presets are seeded on first access
    await service.upsert_presets(user_id=user.id)
    items, total = await service.list_for_user(user_id=user.id)
    return UserProviderList(
        items=[UserProviderRead.model_validate(p) for p in items],
        total=total,
    )


@router.post(
    "",
    response_model=UserProviderRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_provider(
    data: UserProviderCreate,
    service: UserProviderSvc,
    user: CurrentUser,
) -> Any:
    """Create a custom provider configuration."""
    db_provider = await service.create_custom(user_id=user.id, data=data)
    return UserProviderRead.model_validate(db_provider)


@router.patch(
    "/{provider_id}",
    response_model=UserProviderRead,
)
async def update_provider(
    provider_id: UUID,
    data: UserProviderUpdate,
    service: UserProviderSvc,
    user: CurrentUser,
) -> Any:
    """Patch an existing provider (preset or custom)."""
    db_provider = await service.update(
        user_id=user.id, provider_id=provider_id, data=data
    )
    return UserProviderRead.model_validate(db_provider)


@router.delete(
    "/{provider_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_provider(
    provider_id: UUID,
    service: UserProviderSvc,
    user: CurrentUser,
) -> None:
    """Delete a custom provider. Preset providers cannot be deleted."""
    await service.delete(user_id=user.id, provider_id=provider_id)
    return None
