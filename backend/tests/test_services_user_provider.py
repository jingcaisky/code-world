"""Tests for UserProvider service layer."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.core.exceptions import AlreadyExistsError, BadRequestError, NotFoundError
from app.schemas.user_provider import UserProviderCreate, UserProviderUpdate
from app.services.user_provider import UserProviderService


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
    ):
        self.id = id or uuid4()
        self.user_id = user_id or uuid4()
        self.name = name
        self.base_url = base_url
        self.api_key = api_key
        self.is_enabled = is_enabled
        self.is_preset = is_preset


class TestUserProviderService:
    """Tests for UserProviderService."""

    @pytest.fixture
    def mock_db(self) -> AsyncMock:
        return AsyncMock()

    @pytest.fixture
    def service(self, mock_db: AsyncMock) -> UserProviderService:
        return UserProviderService(mock_db)

    @pytest.fixture
    def user_id(self) -> str:
        return uuid4()

    @pytest.fixture
    def mock_provider(self, user_id) -> MockProvider:
        return MockProvider(user_id=user_id)

    @pytest.mark.anyio
    async def test_list_for_user_seeds_presets_when_empty(
        self, service: UserProviderService, user_id: str
    ):
        """Test that preset providers are seeded on first access."""
        from app.services.user_provider import PRESET_PROVIDERS
        with patch("app.services.user_provider.user_provider_repo") as mock_repo:
            mock_repo.list_for_user = AsyncMock(return_value=([], 0))
            mock_repo.create = AsyncMock(side_effect=[
                MockProvider(id=uuid4(), user_id=user_id, name=p["name"], base_url=p["base_url"], is_preset=True)
                for p in PRESET_PROVIDERS
            ])

            items, total = await service.list_for_user(user_id=user_id)

            assert total == len(PRESET_PROVIDERS)
            assert len(items) == len(PRESET_PROVIDERS)
            assert mock_repo.create.call_count == len(PRESET_PROVIDERS)

    @pytest.mark.anyio
    async def test_list_for_user_returns_existing(
        self, service: UserProviderService, user_id: str, mock_provider: MockProvider
    ):
        """Test that existing providers are returned without seeding."""
        with patch("app.services.user_provider.user_provider_repo") as mock_repo:
            mock_repo.list_for_user = AsyncMock(return_value=([mock_provider], 1))

            items, total = await service.list_for_user(user_id=user_id)

            assert total == 1
            assert items[0].name == "Google Gemini"

    @pytest.mark.anyio
    async def test_create_custom_success(
        self, service: UserProviderService, user_id: str
    ):
        """Test creating a custom provider."""
        with patch("app.services.user_provider.user_provider_repo") as mock_repo:
            mock_repo.get_by_name = AsyncMock(return_value=None)
            mock_repo.create = AsyncMock(
                return_value=MockProvider(
                    user_id=user_id,
                    name="My Custom LLM",
                    base_url="https://custom.example.com/v1",
                    is_preset=False,
                )
            )

            data = UserProviderCreate(
                name="My Custom LLM",
                base_url="https://custom.example.com/v1",
            )
            result = await service.create_custom(user_id=user_id, data=data)

            assert result.name == "My Custom LLM"
            assert result.base_url == "https://custom.example.com/v1"
            assert not result.is_preset
            mock_repo.create.assert_called_once()

    @pytest.mark.anyio
    async def test_create_custom_duplicate(
        self, service: UserProviderService, user_id: str, mock_provider: MockProvider
    ):
        """Test creating a duplicate provider name raises AlreadyExistsError."""
        with patch("app.services.user_provider.user_provider_repo") as mock_repo:
            mock_repo.get_by_name = AsyncMock(return_value=mock_provider)

            data = UserProviderCreate(name="Google Gemini", base_url="https://example.com/v1")
            with pytest.raises(AlreadyExistsError):
                await service.create_custom(user_id=user_id, data=data)

    @pytest.mark.anyio
    async def test_update_success(
        self, service: UserProviderService, user_id: str, mock_provider: MockProvider
    ):
        """Test updating a provider."""
        with patch("app.services.user_provider.user_provider_repo") as mock_repo:
            mock_repo.get_by_id = AsyncMock(return_value=mock_provider)
            mock_repo.update = AsyncMock(return_value=mock_provider)

            data = UserProviderUpdate(is_enabled=True)
            result = await service.update(
                user_id=user_id, provider_id=mock_provider.id, data=data
            )

            assert result == mock_provider
            mock_repo.update.assert_called_once()

    @pytest.mark.anyio
    async def test_update_not_found(
        self, service: UserProviderService, user_id: str
    ):
        """Test updating a non-existent provider raises NotFoundError."""
        with patch("app.services.user_provider.user_provider_repo") as mock_repo:
            mock_repo.get_by_id = AsyncMock(return_value=None)

            data = UserProviderUpdate(is_enabled=True)
            with pytest.raises(NotFoundError):
                await service.update(
                    user_id=user_id, provider_id=uuid4(), data=data
                )

    @pytest.mark.anyio
    async def test_delete_custom_success(
        self, service: UserProviderService, user_id: str
    ):
        """Test deleting a custom provider."""
        custom_provider = MockProvider(user_id=user_id, is_preset=False)
        with patch("app.services.user_provider.user_provider_repo") as mock_repo:
            mock_repo.get_by_id = AsyncMock(return_value=custom_provider)
            mock_repo.delete = AsyncMock()

            await service.delete(user_id=user_id, provider_id=custom_provider.id)
            mock_repo.delete.assert_called_once()

    @pytest.mark.anyio
    async def test_delete_preset_raises_error(
        self, service: UserProviderService, user_id: str, mock_provider: MockProvider
    ):
        """Test deleting a preset provider raises BadRequestError."""
        with patch("app.services.user_provider.user_provider_repo") as mock_repo:
            mock_repo.get_by_id = AsyncMock(return_value=mock_provider)

            with pytest.raises(BadRequestError, match="cannot be deleted"):
                await service.delete(user_id=user_id, provider_id=mock_provider.id)
