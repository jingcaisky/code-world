"""Tests for user provider API routes."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user, get_user_provider_service
from app.api.deps import get_db_session
from app.api.deps import get_redis
from app.core.config import settings
from app.core.exceptions import AlreadyExistsError, BadRequestError, NotFoundError
from app.main import app


class MockUser:
    """Mock user for testing."""

    def __init__(self, id=None):
        self.id = id or uuid4()


class MockProvider:
    """Mock provider for testing."""

    def __init__(
        self,
        id=None,
        user_id=None,
        name="Google Gemini",
        base_url="https://generativelanguage.googleapis.com/v1beta",
        api_key="",
        is_enabled=False,
        is_preset=True,
        created_at=None,
        updated_at=None,
    ):
        from datetime import UTC, datetime
        self.id = id or uuid4()
        self.user_id = user_id or uuid4()
        self.name = name
        self.base_url = base_url
        self.api_key = api_key
        self.is_enabled = is_enabled
        self.is_preset = is_preset
        self.created_at = created_at or datetime.now(UTC)
        self.updated_at = updated_at


ServiceMock = AsyncMock


@pytest.fixture
def mock_user() -> MockUser:
    return MockUser()


@pytest.fixture
def mock_provider_service(mock_user: MockUser) -> MagicMock:
    service = MagicMock()
    service.list_for_user = ServiceMock(
        return_value=(
            [
                MockProvider(
                    id=uuid4(),
                    user_id=mock_user.id,
                    name="Google Gemini",
                    base_url="https://generativelanguage.googleapis.com/v1beta",
                    is_preset=True,
                ),
                MockProvider(
                    id=uuid4(),
                    user_id=mock_user.id,
                    name="GitHub Models",
                    base_url="https://models.inference.ai.azure.com",
                    is_preset=True,
                ),
            ],
            2,
        )
    )
    service.upsert_presets = ServiceMock()
    service.create_custom = ServiceMock(
        return_value=MockProvider(
            id=uuid4(),
            user_id=mock_user.id,
            name="My Custom LLM",
            base_url="https://custom.example.com/v1",
            is_preset=False,
        )
    )
    service.update = ServiceMock(
        return_value=MockProvider(
            id=uuid4(),
            user_id=mock_user.id,
            name="Google Gemini",
            base_url="https://generativelanguage.googleapis.com/v1beta",
            is_enabled=True,
            is_preset=True,
        )
    )
    service.delete = ServiceMock()
    return service


@pytest.fixture
async def auth_client(
    mock_user: MockUser,
    mock_provider_service: MagicMock,
    mock_redis: MagicMock,
    mock_db_session,
) -> AsyncClient:
    """Client with authenticated user and mocked provider service."""
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_user_provider_service] = lambda: mock_provider_service
    app.dependency_overrides[get_redis] = lambda: mock_redis
    app.dependency_overrides[get_db_session] = lambda: mock_db_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_list_providers(
    auth_client: AsyncClient,
    mock_provider_service: MagicMock,
):
    """Test GET /me/providers returns list of providers."""
    response = await auth_client.get(f"{settings.API_V1_STR}/me/providers")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert data["total"] == 2
    assert data["items"][0]["name"] == "Google Gemini"
    mock_provider_service.upsert_presets.assert_called_once()


@pytest.mark.anyio
async def test_create_custom_provider(
    auth_client: AsyncClient,
    mock_provider_service: MagicMock,
):
    """Test POST /me/providers creates a custom provider."""
    response = await auth_client.post(
        f"{settings.API_V1_STR}/me/providers",
        json={
            "name": "My Custom LLM",
            "base_url": "https://custom.example.com/v1",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Custom LLM"
    mock_provider_service.create_custom.assert_called_once()


@pytest.mark.anyio
async def test_create_custom_provider_duplicate(
    auth_client: AsyncClient,
    mock_provider_service: MagicMock,
):
    """Test creating duplicate provider returns 409."""
    mock_provider_service.create_custom = ServiceMock(
        side_effect=AlreadyExistsError(message="A provider with this name already exists")
    )
    response = await auth_client.post(
        f"{settings.API_V1_STR}/me/providers",
        json={
            "name": "Google Gemini",
            "base_url": "https://example.com/v1",
        },
    )
    assert response.status_code == 409


@pytest.mark.anyio
async def test_update_provider(
    auth_client: AsyncClient,
    mock_provider_service: MagicMock,
):
    """Test PATCH /me/providers/{id} updates a provider."""
    provider_id = uuid4()
    response = await auth_client.patch(
        f"{settings.API_V1_STR}/me/providers/{provider_id}",
        json={"is_enabled": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_enabled"] is True
    mock_provider_service.update.assert_called_once()


@pytest.mark.anyio
async def test_update_provider_not_found(
    auth_client: AsyncClient,
    mock_provider_service: MagicMock,
):
    """Test updating non-existent provider returns 404."""
    mock_provider_service.update = ServiceMock(
        side_effect=NotFoundError(message="Provider not found")
    )
    response = await auth_client.patch(
        f"{settings.API_V1_STR}/me/providers/{uuid4()}",
        json={"is_enabled": True},
    )
    assert response.status_code == 404


@pytest.mark.anyio
async def test_delete_custom_provider(
    auth_client: AsyncClient,
    mock_provider_service: MagicMock,
):
    """Test DELETE /me/providers/{id} deletes a custom provider."""
    provider_id = uuid4()
    response = await auth_client.delete(
        f"{settings.API_V1_STR}/me/providers/{provider_id}"
    )
    assert response.status_code == 204
    mock_provider_service.delete.assert_called_once()


@pytest.mark.anyio
async def test_delete_preset_provider_returns_400(
    auth_client: AsyncClient,
    mock_provider_service: MagicMock,
):
    """Test deleting a preset provider returns 400."""
    mock_provider_service.delete = ServiceMock(
        side_effect=BadRequestError(message="Preset providers cannot be deleted")
    )
    response = await auth_client.delete(
        f"{settings.API_V1_STR}/me/providers/{uuid4()}"
    )
    assert response.status_code == 400


@pytest.mark.anyio
async def test_list_providers_unauthenticated(
    mock_redis: MagicMock,
    mock_db_session,
):
    """Test providers endpoint without auth returns 401."""
    app.dependency_overrides[get_redis] = lambda: mock_redis
    app.dependency_overrides[get_db_session] = lambda: mock_db_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        response = await ac.get(f"{settings.API_V1_STR}/me/providers")

    assert response.status_code == 401
    app.dependency_overrides.clear()
