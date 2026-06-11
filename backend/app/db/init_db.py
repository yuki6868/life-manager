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


async def ensure_tasks_urgent_columns(db: AsyncSession) -> None:
    """既存DBにも緊急タスク用の列を追加する軽量マイグレーション。"""
    result = await db.execute(text("PRAGMA table_info(tasks)"))
    column_names = {row[1] for row in result.fetchall()}

    statements: list[str] = []

    if "task_type" not in column_names:
        statements.append(
            "ALTER TABLE tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'normal'"
        )

    if "urgency" not in column_names:
        statements.append("ALTER TABLE tasks ADD COLUMN urgency INTEGER")

    if "importance" not in column_names:
        statements.append("ALTER TABLE tasks ADD COLUMN importance INTEGER")

    if "occurred_at" not in column_names:
        statements.append("ALTER TABLE tasks ADD COLUMN occurred_at DATETIME")

    if "interruption_reason" not in column_names:
        statements.append("ALTER TABLE tasks ADD COLUMN interruption_reason TEXT")

    for statement in statements:
        await db.execute(text(statement))

    if statements:
        await db.commit()


async def ensure_study_category_tables(db: AsyncSession) -> None:
    """既存DBにも学習カテゴリと科目の category_id を追加する軽量マイグレーション。"""
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS study_categories (
                id INTEGER NOT NULL PRIMARY KEY,
                name VARCHAR(120) NOT NULL UNIQUE,
                target_minutes INTEGER NOT NULL DEFAULT 0,
                memo TEXT,
                created_at DATETIME,
                updated_at DATETIME
            )
            """
        )
    )

    result = await db.execute(text("PRAGMA table_info(study_subjects)"))
    column_names = {row[1] for row in result.fetchall()}

    if "category_id" not in column_names:
        await db.execute(text("ALTER TABLE study_subjects ADD COLUMN category_id INTEGER"))

    await db.commit()
