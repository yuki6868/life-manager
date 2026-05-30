from sqlalchemy import select, text
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


async def ensure_work_logs_gap_task_column(db: AsyncSession) -> None:
    """既存DBにも work_logs.gap_task_id を追加する軽量マイグレーション。"""
    result = await db.execute(text("PRAGMA table_info(work_logs)"))
    column_names = {row[1] for row in result.fetchall()}

    if "gap_task_id" in column_names:
        return

    await db.execute(text("ALTER TABLE work_logs ADD COLUMN gap_task_id INTEGER"))
    await db.commit()
