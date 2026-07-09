from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query, Response, status
from fastapi.responses import JSONResponse

from app.api.deps import (
    ActiveOrg,
    ConversationShareSvc,
    ConversationSvc,
    CurrentAdmin,
    CurrentUser,
    MessageRatingSvc,
)
from app.db.models.user import UserRole
from app.schemas.conversation import (
    ConversationAdminList,
    ConversationCreate,
    ConversationExport,
    ConversationKBSettings,
    ConversationList,
    ConversationRead,
    ConversationReadWithMessages,
    ConversationUpdate,
    MessageCreate,
    MessageList,
    MessageRead,
    ToolCallStatList,
)
from app.schemas.conversation_share import (
    ConversationShareCreate,
    ConversationShareList,
    ConversationShareRead,
)
from app.schemas.message_rating import (
    MessageRatingCreate,
    MessageRatingRead,
)

router = APIRouter()


@router.get("/export", response_model=ConversationExport)
async def export_conversations(
    conversation_service: ConversationSvc,
    _: CurrentAdmin,
) -> Any:
    """导出所有对话及消息和工具调用（仅管理员）"""
    export_data = await conversation_service.export_all()
    return JSONResponse(
        content={"conversations": export_data, "total": len(export_data)},
        headers={"Content-Disposition": 'attachment; filename="conversations_export.json"'},
    )


@router.get("/admin-list", response_model=ConversationAdminList)
async def list_conversations_admin(
    conversation_service: ConversationSvc,
    _: CurrentAdmin,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    include_archived: bool = Query(True, description="Include archived conversations"),
    search: str | None = Query(None, max_length=100, description="Search by title or ID prefix"),
) -> Any:
    """列出所有对话及消息数量（仅管理员）"""
    items, total = await conversation_service.list_conversations_admin(
        skip=skip,
        limit=limit,
        include_archived=include_archived,
        search=search,
    )
    return ConversationAdminList(items=items, total=total)


@router.get("/shared-with-me", response_model=ConversationList)
async def list_shared_with_me(
    share_service: ConversationShareSvc,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> Any:
    """列出分享给当前用户的对话"""
    items, total = await share_service.list_shared_with_me(current_user.id, skip=skip, limit=limit)
    return ConversationList(items=items, total=total)


@router.get("/shared/{token}", response_model=ConversationReadWithMessages)
async def get_shared_conversation(
    token: str,
    share_service: ConversationShareSvc,
) -> Any:
    """通过公开令牌访问分享的对话（无需认证）"""
    return await share_service.get_by_token(token)


@router.get("", response_model=ConversationList)
async def list_conversations(
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
    skip: int = Query(0, ge=0, description="Number of conversations to skip"),
    limit: int = Query(50, ge=1, le=100, description="Maximum conversations to return"),
    include_archived: bool = Query(False, description="Include archived conversations"),
) -> Any:
    """列出当前用户的对话"""
    items, total = await conversation_service.list_conversations(
        user_id=current_user.id,
        organization_id=active_org.id,
        skip=skip,
        limit=limit,
        include_archived=include_archived,
    )
    return ConversationList(items=items, total=total)  # ty: ignore[invalid-argument-type]


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
    data: ConversationCreate | None = None,
) -> Any:
    """创建新对话"""
    if data is None:
        data = ConversationCreate()
    data = data.model_copy(update={"user_id": current_user.id})
    data = data.model_copy(update={"organization_id": active_org.id})
    return await conversation_service.create_conversation(data)


@router.get("/tool-stats", response_model=ToolCallStatList)
async def get_tool_stats(
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
    days: int = Query(7, ge=1, le=90, description="Window in days"),
    limit: int = Query(10, ge=1, le=50, description="Max tools to return"),
) -> Any:
    """当前组织在指定时间内的常用工具"""
    items = await conversation_service.aggregate_tool_calls(active_org.id, days=days, limit=limit)
    return ToolCallStatList(items=items, days=days)  # ty: ignore[invalid-argument-type]


@router.get("/{conversation_id}", response_model=ConversationReadWithMessages)
async def get_conversation(
    conversation_id: UUID,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
) -> Any:
    """获取对话及其所有消息"""
    uid = None if current_user.has_role(UserRole.ADMIN) else current_user.id
    return await conversation_service.get_conversation(
        conversation_id,
        include_messages=True,
        user_id=uid,
    )


@router.patch("/{conversation_id}", response_model=ConversationRead)
async def update_conversation(
    conversation_id: UUID,
    data: ConversationUpdate,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
) -> Any:
    """更新对话标题或归档状态"""
    return await conversation_service.update_conversation(
        conversation_id,
        data,
        user_id=current_user.id,
    )


@router.patch("/{conversation_id}/kb-settings", response_model=ConversationRead)
async def update_kb_settings(
    conversation_id: UUID,
    data: ConversationKBSettings,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
) -> Any:
    """更新此对话中启用的知识库

    传 null 恢复默认，传 [] 禁用 RAG，传 [id,...] 手动选择。
    """
    return await conversation_service.update_kb_settings(
        conversation_id,
        data.active_knowledge_base_ids,
        user_id=current_user.id,
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_conversation(
    conversation_id: UUID,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
) -> None:
    """删除对话及其所有消息"""
    await conversation_service.delete_conversation(
        conversation_id,
        user_id=current_user.id,
    )


@router.post(
    "/{conversation_id}/archive",
    response_model=ConversationRead,
)
async def archive_conversation(
    conversation_id: UUID,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
) -> Any:
    """归档对话

    归档的对话将从默认列表视图中隐藏。
    """
    return await conversation_service.archive_conversation(
        conversation_id,
        user_id=current_user.id,
    )


@router.get("/{conversation_id}/messages", response_model=MessageList)
async def list_messages(
    conversation_id: UUID,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> Any:
    """列出对话中的消息"""
    uid = None if current_user.has_role(UserRole.ADMIN) else current_user.id
    items, total = await conversation_service.list_messages(
        conversation_id,
        skip=skip,
        limit=limit,
        include_tool_calls=True,
        user_id=uid,
    )
    return MessageList(items=items, total=total)  # ty: ignore[invalid-argument-type]


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_message(
    conversation_id: UUID,
    data: MessageCreate,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
) -> Any:
    """向对话添加消息"""
    return await conversation_service.add_message(conversation_id, data)


@router.post(
    "/{conversation_id}/messages/{message_id}/rate",
    response_model=MessageRatingRead,
)
async def rate_message(
    conversation_id: UUID,
    message_id: UUID,
    data: MessageRatingCreate,
    rating_service: MessageRatingSvc,
    current_user: CurrentUser,
    response: Response,
) -> Any:
    """评分助手消息——新建返回201，更新返回200"""
    rating, is_new = await rating_service.rate_message(
        conversation_id=conversation_id,
        message_id=message_id,
        user_id=current_user.id,
        data=data,
    )
    if is_new:
        response.status_code = status.HTTP_201_CREATED
    return rating


@router.delete(
    "/{conversation_id}/messages/{message_id}/rate",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def remove_rating(
    conversation_id: UUID,
    message_id: UUID,
    rating_service: MessageRatingSvc,
    current_user: CurrentUser,
) -> None:
    """移除对消息的评分"""
    await rating_service.remove_rating(
        conversation_id=conversation_id,
        message_id=message_id,
        user_id=current_user.id,
    )


@router.post(
    "/{conversation_id}/shares",
    response_model=ConversationShareRead,
    status_code=status.HTTP_201_CREATED,
)
async def share_conversation(
    conversation_id: UUID,
    data: ConversationShareCreate,
    share_service: ConversationShareSvc,
    current_user: CurrentUser,
) -> Any:
    """Share a conversation with another user or generate a public link."""
    result = await share_service.share_conversation(
        conversation_id,
        shared_by=current_user.id,
        shared_with=data.shared_with,
        generate_link=data.generate_link,
        permission=data.permission,
    )
    return result["share"]


@router.get("/{conversation_id}/shares", response_model=ConversationShareList)
async def list_shares(
    conversation_id: UUID,
    share_service: ConversationShareSvc,
    current_user: CurrentUser,
) -> Any:
    """List all shares for a conversation (owner only)."""
    shares = await share_service.list_shares(conversation_id, current_user.id)
    return ConversationShareList(items=shares, total=len(shares))


@router.delete(
    "/{conversation_id}/shares/{share_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def revoke_share(
    conversation_id: UUID,
    share_id: UUID,
    share_service: ConversationShareSvc,
    current_user: CurrentUser,
) -> None:
    """撤销对话分享"""
    await share_service.revoke_share(share_id, current_user.id)
