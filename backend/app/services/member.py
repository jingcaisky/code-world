import logging
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, BadRequestError, NotFoundError
from app.db.models.organization import OrganizationMember, OrgRole
from app.repositories import member_repo, user_repo

logger = logging.getLogger(__name__)

# Roles Admin is allowed to assign (cannot grant/revoke Owner via Admin)
_ADMIN_ASSIGNABLE_ROLES = {OrgRole.MEMBER.value, OrgRole.VIEWER.value}


class MemberService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_org(
        self,
        organization_id: UUID,
        requester_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[tuple[OrganizationMember, str, str | None, str | None]], int]:
        """List members with their joined user info. Any org member may list."""
        membership = await member_repo.get(
            self.db, organization_id=organization_id, user_id=requester_id
        )
        if not membership:
            raise NotFoundError(
                message="Organization not found", details={"org_id": str(organization_id)}
            )

        rows = await member_repo.list_for_org(self.db, organization_id, skip=skip, limit=limit)
        total = await member_repo.count_for_org(self.db, organization_id)
        return rows, total

    async def change_role(
        self,
        organization_id: UUID,
        target_user_id: UUID,
        new_role: str,
        requester_id: UUID,
    ) -> tuple[OrganizationMember, str, str | None, str | None]:
        """Change a member's role.

        Rules:
        - Only OWNER or ADMIN may change roles.
        - ADMIN can only assign/change to MEMBER or VIEWER (cannot promote to ADMIN/OWNER).
        - OWNER cannot be demoted via this method (use transfer_ownership).
        """
        requester = await member_repo.get(
            self.db, organization_id=organization_id, user_id=requester_id
        )
        if not requester or requester.role not in (OrgRole.OWNER.value, OrgRole.ADMIN.value):
            raise AuthorizationError(message="仅所有者或管理员可以修改成员角色")

        target = await member_repo.get(
            self.db, organization_id=organization_id, user_id=target_user_id
        )
        if not target:
            raise NotFoundError(
                message="Member not found", details={"user_id": str(target_user_id)}
            )

        if target.role == OrgRole.OWNER.value:
            raise BadRequestError(message="请使用转移所有权来更换所有者角色")

        if requester.role == OrgRole.ADMIN.value and new_role not in _ADMIN_ASSIGNABLE_ROLES:
            raise AuthorizationError(message="管理员只能分配成员或观察者角色")

        updated = await member_repo.update_role(self.db, target, role=new_role)
        user = await user_repo.get_by_id(self.db, updated.user_id)
        email = user.email if user else ""
        full_name = user.full_name if user else None
        avatar_url = user.avatar_url if user else None
        return updated, email, full_name, avatar_url

    async def remove(
        self,
        organization_id: UUID,
        target_user_id: UUID,
        requester_id: UUID,
    ) -> None:
        """Remove a member from the org.

        Rules:
        - OWNER or ADMIN may remove members.
        - ADMIN cannot remove another ADMIN or OWNER.
        - Last OWNER cannot be removed.
        """
        requester = await member_repo.get(
            self.db, organization_id=organization_id, user_id=requester_id
        )
        if not requester or requester.role not in (OrgRole.OWNER.value, OrgRole.ADMIN.value):
            raise AuthorizationError(message="仅所有者或管理员可以移除成员")

        target = await member_repo.get(
            self.db, organization_id=organization_id, user_id=target_user_id
        )
        if not target:
            raise NotFoundError(
                message="Member not found", details={"user_id": str(target_user_id)}
            )

        if target.role == OrgRole.OWNER.value:
            owners = await self._count_owners(organization_id)
            if owners <= 1:
                raise BadRequestError(
                    message="无法移除最后一位所有者，请先转移所有权"
                )
            if requester.role != OrgRole.OWNER.value:
                raise AuthorizationError(message="仅所有者可以移除其他所有者")

        if requester.role == OrgRole.ADMIN.value and target.role == OrgRole.ADMIN.value:
            raise AuthorizationError(message="管理员无法移除其他管理员")

        await member_repo.delete(self.db, target)

    async def leave(self, organization_id: UUID, requester_id: UUID) -> None:
        """Current user leaves the org.

        OWNER must transfer ownership first (unless they are the last member — then delete org).
        """
        membership = await member_repo.get(
            self.db, organization_id=organization_id, user_id=requester_id
        )
        if not membership:
            raise NotFoundError(
                message="Organization not found", details={"org_id": str(organization_id)}
            )

        if membership.role == OrgRole.OWNER.value:
            total = await member_repo.count_for_org(self.db, organization_id)
            if total > 1:
                raise BadRequestError(message="离开组织前请先转移所有权")

        await member_repo.delete(self.db, membership)

    async def transfer_ownership(
        self,
        organization_id: UUID,
        new_owner_user_id: UUID,
        requester_id: UUID,
    ) -> None:
        """Transfer OWNER role to another member.

        Only the current OWNER may call this.
        """
        requester = await member_repo.get(
            self.db, organization_id=organization_id, user_id=requester_id
        )
        if not requester or requester.role != OrgRole.OWNER.value:
            raise AuthorizationError(message="仅所有者可以转移所有权")

        if new_owner_user_id == requester_id:
            raise BadRequestError(message="不能将所有权转移给自己")

        new_owner = await member_repo.get(
            self.db, organization_id=organization_id, user_id=new_owner_user_id
        )
        if not new_owner:
            raise NotFoundError(
                message="目标用户不是该组织的成员",
                details={"user_id": str(new_owner_user_id)},
            )

        await member_repo.update_role(self.db, requester, role=OrgRole.ADMIN.value)
        await member_repo.update_role(self.db, new_owner, role=OrgRole.OWNER.value)
        logger.info(
            "Ownership transferred in org %s from user %s to user %s",
            organization_id,
            requester_id,
            new_owner_user_id,
        )

    async def _count_owners(self, organization_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count(OrganizationMember.id)).where(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.role == OrgRole.OWNER.value,
            )
        )
        return result.scalar() or 0
