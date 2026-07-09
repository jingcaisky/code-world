"""Authentication routes."""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import CurrentUser, UserSvc
from app.core.config import settings
from app.core.exceptions import AuthenticationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_token,
)
from app.schemas.password_reset import (
    MagicLinkRequest,
    MagicLinkVerifyRequest,
    PasswordResetConfirm,
    PasswordResetConfirmResponse,
    PasswordResetRequest,
    PasswordResetResponse,
)
from app.schemas.token import RefreshTokenRequest, Token
from app.schemas.user import UserCreate, UserRead
from app.services.email.service import get_email_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    user_service: UserSvc,
) -> Any:
    """OAuth2 密码登录，返回访问令牌和刷新令牌"""
    user = await user_service.authenticate(form_data.username, form_data.password)
    access_token = create_access_token(subject=str(user.id))
    refresh_token = create_refresh_token(subject=str(user.id))
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    user_service: UserSvc,
) -> Any:
    """注册新用户"""
    user = await user_service.register(user_in)
    return user


@router.post("/refresh", response_model=Token)
async def refresh_token(
    request: Request,
    body: RefreshTokenRequest,
    user_service: UserSvc,
) -> Any:
    """用刷新令牌换取新的访问令牌"""

    # No DB-backed sessions — validate the refresh JWT directly.
    payload = verify_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise AuthenticationError(message="Invalid or expired refresh token")
    user_id = payload.get("sub")
    if not user_id:
        raise AuthenticationError(message="Invalid refresh token")
    user = await user_service.get_by_id(user_id)
    if not user.is_active:
        raise AuthenticationError(message="User account is disabled")

    access_token = create_access_token(subject=str(user.id))
    new_refresh_token = create_refresh_token(subject=str(user.id))
    return Token(access_token=access_token, refresh_token=new_refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def logout(
    body: RefreshTokenRequest,
) -> None:
    """无需操作（无会话追踪），客户端在本地清理 JWT"""
    return None


@router.get("/me", response_model=UserRead)
async def get_current_user_info(current_user: CurrentUser) -> Any:
    """获取当前已认证用户的信息"""
    return current_user


@router.post("/password-reset/request", response_model=PasswordResetResponse)
async def request_password_reset(
    body: PasswordResetRequest,
    user_service: UserSvc,
) -> Any:
    """发送一次性重置密码链接到邮箱

    始终返回相同的 200 响应——我们不会泄露邮箱是否在我们的系统中。
    """
    issued = await user_service.issue_password_reset_token(body.email)
    if issued is not None:
        reset_user, token = issued
        try:
            reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
            await get_email_service().send_password_reset(
                to=body.email,
                name=reset_user.full_name or body.email,
                reset_url=reset_url,
            )
        except Exception:
            logger.exception("password_reset_email_failed", extra={"email": body.email})
    return PasswordResetResponse()


@router.post("/password-reset/confirm", response_model=PasswordResetConfirmResponse)
async def confirm_password_reset(
    body: PasswordResetConfirm,
    user_service: UserSvc,
) -> Any:
    """使用重置邮件中的令牌设置新密码"""
    await user_service.confirm_password_reset(body.token, body.new_password)
    return PasswordResetConfirmResponse()


@router.post("/magic-link/request", response_model=PasswordResetResponse)
async def request_magic_link(
    body: MagicLinkRequest,
    user_service: UserSvc,
) -> Any:
    """发送一次性登录链接

    与密码重置请求返回相同的响应，避免邮箱枚举。
    """
    issued = await user_service.issue_magic_link_token(body.email)
    if issued is not None:
        link_user, token = issued
        try:
            login_url = f"{settings.FRONTEND_URL.rstrip('/')}/auth/magic-link?token={token}"
            await get_email_service().send_welcome(
                to=body.email,
                name=link_user.full_name or body.email,
                login_url=login_url,
            )
        except Exception:
            logger.exception("magic_link_email_failed", extra={"email": body.email})
    return PasswordResetResponse(message="Check your email for a sign-in link.")


@router.post("/magic-link/verify", response_model=Token)
async def verify_magic_link(
    request: Request,
    body: MagicLinkVerifyRequest,
    user_service: UserSvc,
) -> Any:
    """用魔法链接令牌换取访问令牌和刷新令牌"""
    user = await user_service.consume_magic_link_token(body.token)
    access_token = create_access_token(subject=str(user.id))
    refresh_token = create_refresh_token(subject=str(user.id))
    return Token(access_token=access_token, refresh_token=refresh_token)
