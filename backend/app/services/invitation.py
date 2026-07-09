import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    AlreadyExistsError,
    AuthenticationError,
    AuthorizationError,
    BadRequestError,
    NotFoundError,
    PaymentRequiredError,
)
from app.db.models.organization import InvitationStatus, OrgRole
from app.repositories import invitation_repo, member_repo, organization_repo, user_repo
from app.services.email.service import get_email_service

logger = logging.getLogger(__name__)

_ADMIN_INVITABLE_ROLES = {OrgRole.MEMBER.value, OrgRole.VIEWER.value}


class InvitationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def invite(
        self,
        organization_id: UUID,
        email: str,
        role: str,
        requester_id: UUID,
    ):
        requester = await member_repo.get(
            self.db, organization_id=organization_id, user_id=requester_id
        )
        if not requester or requester.role not in (OrgRole.OWNER.value, OrgRole.ADMIN.value):
            raise AuthorizationError(message="仅所有者或管理员可以邀请成员")

        if requester.role == OrgRole.ADMIN.value and role not in _ADMIN_INVITABLE_ROLES:
            raise AuthorizationError(message="管理员只能邀请为成员或观察者")

        normalized_email = email.lower()

        existing_user = await user_repo.get_by_email(self.db, normalized_email)
        if existing_user:
            existing_membership = await member_repo.get(
                self.db, organization_id=organization_id, user_id=existing_user.id
            )
            if existing_membership:
                raise AlreadyExistsError(
                    message="用户已是该组织的成员",
                    details={"email": normalized_email},
                )

        pending = await invitation_repo.get_pending_for_org_email(
            self.db, organization_id=organization_id, email=normalized_email
        )
        if pending:
            raise AlreadyExistsError(
                message="该邮箱已有待处理的邀请",
                details={"email": normalized_email},
            )

        invite = await invitation_repo.create(
            self.db,
            organization_id=organization_id,
            email=normalized_email,
            role=role,
            invited_by_user_id=requester_id,
        )
        logger.info(
            "Invitation created for %s to org %s (role=%s) by user %s",
            normalized_email,
            organization_id,
            role,
            requester_id,
        )
        try:
            org = await organization_repo.get_by_id(self.db, organization_id)
            requester_user = await user_repo.get_by_id(self.db, requester_id)
            frontend = settings.FRONTEND_URL.rstrip("/")
            accept_url = f"{frontend}/invitations/{invite.token}"
            await get_email_service().send_invitation(
                to=normalized_email,
                inviter_name=(requester_user.full_name or requester_user.email)
                if requester_user
                else "A team member",
                org_name=org.name if org else "the organization",
                accept_url=accept_url,
            )
        except Exception:
            logger.exception("email_invitation_failed")
        return invite

    async def list_for_org(
        self,
        organization_id: UUID,
        requester_id: UUID,
        *,
        status: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ):
        requester = await member_repo.get(
            self.db, organization_id=organization_id, user_id=requester_id
        )
        if not requester or requester.role not in (OrgRole.OWNER.value, OrgRole.ADMIN.value):
            raise AuthorizationError(message="仅所有者或管理员可以查看邀请")

        return await invitation_repo.list_for_org(
            self.db, organization_id, status=status, skip=skip, limit=limit
        )

    async def accept(self, token: str, accepting_user_id: UUID):
        invite = await invitation_repo.get_by_token(self.db, token)
        if not invite:
            raise NotFoundError(message="邀请未找到或已被使用")

        if invite.status != InvitationStatus.PENDING.value:
            raise BadRequestError(
                message="邀请已失效",
                details={"status": invite.status},
            )

        if invite.expires_at and invite.expires_at < datetime.now(UTC):
            await invitation_repo.revoke(self.db, invite)
            raise BadRequestError(message="邀请已过期")

        accepting_user = await user_repo.get_by_id(self.db, accepting_user_id)
        if not accepting_user or accepting_user.email.lower() != invite.email:
            raise AuthenticationError(
                message="此邀请是发送给其他邮箱的"
            )

        existing = await member_repo.get(
            self.db, organization_id=invite.organization_id, user_id=accepting_user_id
        )
        if existing:
            raise AlreadyExistsError(
                message="您已是该组织的成员",
                details={"org_id": str(invite.organization_id)},
            )
        org = await organization_repo.get_by_id(self.db, invite.organization_id)
        seats_limit = getattr(org, "seats_limit", None) if org is not None else None
        if seats_limit is not None:
            current_count = await member_repo.count_for_org(self.db, invite.organization_id)
            if current_count >= seats_limit:
                raise PaymentRequiredError(
                    message="席位已满——升级方案以添加更多成员",
                    details={"seats_limit": seats_limit, "current": current_count},
                )
        await member_repo.create(
            self.db,
            organization_id=invite.organization_id,
            user_id=accepting_user_id,
            role=invite.role,
        )
        await invitation_repo.accept(self.db, invite, accepted_by_user_id=accepting_user_id)
        logger.info(
            "Invitation %s accepted by user %s (org %s)",
            invite.id,
            accepting_user_id,
            invite.organization_id,
        )
        return invite

    async def revoke(self, token: str, requester_id: UUID):
        """Invitees can revoke their own invitation — not just OWNER/ADMIN."""
        invite = await invitation_repo.get_by_token(self.db, token)
        if not invite:
            raise NotFoundError(message="邀请未找到")

        if invite.status != InvitationStatus.PENDING.value:
            raise BadRequestError(
                message="仅待处理的邀请可以撤销",
                details={"status": invite.status},
            )

        requester = await member_repo.get(
            self.db, organization_id=invite.organization_id, user_id=requester_id
        )
        accepting_user = await user_repo.get_by_id(self.db, requester_id)
        is_own_invite = accepting_user and accepting_user.email.lower() == invite.email

        if not is_own_invite and (
            not requester or requester.role not in (OrgRole.OWNER.value, OrgRole.ADMIN.value)
        ):
            raise AuthorizationError(message="仅所有者或管理员可以撤销邀请")

        await invitation_repo.revoke(self.db, invite)
        return invite
