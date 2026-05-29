from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def create_initial_user(db: AsyncSession) -> None:
    result = await db.execute(select(User).limit(1))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        return

    user = User(
        name="Default User",
        email=None,
    )

    db.add(user)
    await db.commit()