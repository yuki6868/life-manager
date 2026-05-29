from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends

from app.db.session import get_db
from app.models.goal import Goal
from app.schemas.goal import (
    GoalCreate,
    GoalResponse,
)

router = APIRouter(
    prefix="/goals",
    tags=["Goals"],
)


@router.get("/", response_model=list[GoalResponse])
async def get_goals(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Goal)
        .order_by(Goal.id.desc())
    )

    return result.scalars().all()


@router.post("/", response_model=GoalResponse)
async def create_goal(
    payload: GoalCreate,
    db: AsyncSession = Depends(get_db),
):
    goal = Goal(
        user_id=1,
        title=payload.title,
        description=payload.description,
        target_date=payload.target_date,
    )

    db.add(goal)

    await db.commit()
    await db.refresh(goal)

    return goal