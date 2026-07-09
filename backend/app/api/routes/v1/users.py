# ruff: noqa: I001 - Imports structured for Jinja2 template conditionals
"""User management routes."""

from typing import Any

from uuid import UUID

from fastapi import APIRouter, File, UploadFile, status
from fastapi.responses import FileResponse
from fastapi_pagination import Page

from app.api.deps import (
    CurrentAdmin,
    CurrentUser,
    UserSvc,
)
from app.core.exceptions import BadRequestError, NotFoundError
from app.db.models.user import UserRole
from app.schemas.user import UserRead, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserRead)
async def read_current_user(
    current_user: CurrentUser,
) -> Any:
    """获取当前用户资料"""
    return current_user


@router.patch("/me", response_model=UserRead)
async def update_current_user(
    user_in: UserUpdate,
    current_user: CurrentUser,
    user_service: UserSvc,
) -> Any:
    """更新当前用户资料"""
    if user_in.role is not None and not current_user.has_role(UserRole.ADMIN):
        user_in.role = None
    user = await user_service.update(current_user.id, user_in)
    return user


@router.post("/me/avatar", response_model=UserRead)
async def upload_avatar(
    user_service: UserSvc,
    current_user: CurrentUser,
    file: UploadFile = File(...),
) -> Any:
    """上传或替换当前用户头像"""
    data = await file.read()
    try:
        user = await user_service.update_avatar(
            current_user.id, data, file.filename or "avatar.jpg", file.content_type or ""
        )
    except ValueError as e:
        raise BadRequestError(message=str(e)) from None
    return user


@router.get("/avatar/{user_id}", response_model=None)
async def get_avatar(user_id: UUID, user_service: UserSvc) -> Any:
    """获取用户头像图片"""
    user = await user_service.get_by_id(user_id)
    if not user.avatar_url:
        raise NotFoundError(message="No avatar set")
    file_path = user_service.get_avatar_path(user.avatar_url)
    if not file_path:
        raise NotFoundError(message="Avatar file not found")
    return FileResponse(path=file_path, media_type="image/jpeg")


@router.get("", response_model=Page[UserRead])
async def read_users(
    user_service: UserSvc,
    _: CurrentAdmin,
) -> Any:
    """Get all users (admin only)."""
    return await user_service.list_paginated()


@router.get("/{user_id}", response_model=UserRead)
async def read_user(
    user_id: UUID,
    user_service: UserSvc,
    _: CurrentAdmin,
) -> Any:
    """根据 ID 获取用户（仅管理员）"""
    user = await user_service.get_by_id(user_id)
    return user


@router.patch("/{user_id}", response_model=UserRead)
async def update_user_by_id(
    user_id: UUID,
    user_in: UserUpdate,
    user_service: UserSvc,
    _: CurrentAdmin,
) -> Any:
    """根据 ID 更新用户（仅管理员）"""
    user = await user_service.update(user_id, user_in)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_user_by_id(
    user_id: UUID,
    user_service: UserSvc,
    _: CurrentAdmin,
) -> None:
    """根据 ID 删除用户（仅管理员）"""
    await user_service.delete(user_id)
