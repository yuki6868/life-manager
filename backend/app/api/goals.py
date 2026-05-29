from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.goal import Goal
from app.schemas.goal import GoalCreate, GoalResponse, GoalStatusUpdate, GoalUpdate

router = APIRouter(
    prefix="/goals",
    tags=["Goals"],
)

GOAL_STATUSES = {"active", "completed", "paused", "cancelled"}


@router.get("/", response_model=list[GoalResponse])
async def get_goals(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Goal).order_by(Goal.id.desc())
    )
    return result.scalars().all()


@router.get("/{goal_id}", response_model=GoalResponse)
async def get_goal(goal_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id)
    )
    goal = result.scalar_one_or_none()

    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    return goal


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


@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: int,
    payload: GoalUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id)
    )
    goal = result.scalar_one_or_none()

    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    goal.title = payload.title
    goal.description = payload.description
    goal.status = payload.status
    goal.target_date = payload.target_date

    await db.commit()
    await db.refresh(goal)

    return goal


@router.patch("/{goal_id}/status", response_model=GoalResponse)
async def update_goal_status(
    goal_id: int,
    payload: GoalStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    if payload.status not in GOAL_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid goal status")

    result = await db.execute(
        select(Goal).where(Goal.id == goal_id)
    )
    goal = result.scalar_one_or_none()

    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    goal.status = payload.status

    await db.commit()
    await db.refresh(goal)

    return goal


@router.delete("/{goal_id}")
async def delete_goal(
    goal_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id)
    )
    goal = result.scalar_one_or_none()

    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    await db.delete(goal)
    await db.commit()

    return {"message": "Goal deleted"}