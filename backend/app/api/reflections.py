from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.reflection import Reflection
from app.schemas.reflection import ReflectionCreate, ReflectionResponse, ReflectionUpdate

router = APIRouter(
    prefix="/reflections",
    tags=["Reflections"],
)


def apply_reflection_payload(
    reflection: Reflection,
    payload: ReflectionCreate | ReflectionUpdate,
) -> None:
    reflection.reflection_date = payload.reflection_date
    reflection.good_things = payload.good_things
    reflection.bad_things = payload.bad_things
    reflection.improvements = payload.improvements
    reflection.delay_reasons = payload.delay_reasons
    reflection.memo = payload.memo


@router.get("/", response_model=list[ReflectionResponse])
async def get_reflections(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Reflection)

    if start_date is not None:
        query = query.where(Reflection.reflection_date >= start_date)

    if end_date is not None:
        query = query.where(Reflection.reflection_date <= end_date)

    result = await db.execute(
        query.order_by(Reflection.reflection_date.desc(), Reflection.id.desc())
    )
    return result.scalars().all()


@router.get("/by-date/{reflection_date}", response_model=ReflectionResponse)
async def get_reflection_by_date(
    reflection_date: date,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Reflection).where(Reflection.reflection_date == reflection_date)
    )
    reflection = result.scalar_one_or_none()

    if reflection is None:
        raise HTTPException(status_code=404, detail="Reflection not found")

    return reflection


@router.get("/{reflection_id}", response_model=ReflectionResponse)
async def get_reflection(
    reflection_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Reflection).where(Reflection.id == reflection_id))
    reflection = result.scalar_one_or_none()

    if reflection is None:
        raise HTTPException(status_code=404, detail="Reflection not found")

    return reflection


@router.post("/", response_model=ReflectionResponse)
async def create_reflection(
    payload: ReflectionCreate,
    db: AsyncSession = Depends(get_db),
):
    reflection = Reflection(
        reflection_date=payload.reflection_date,
        good_things=payload.good_things,
        bad_things=payload.bad_things,
        improvements=payload.improvements,
        delay_reasons=payload.delay_reasons,
        memo=payload.memo,
    )

    db.add(reflection)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Reflection for this date already exists",
        ) from exc

    await db.refresh(reflection)
    return reflection


@router.put("/{reflection_id}", response_model=ReflectionResponse)
async def update_reflection(
    reflection_id: int,
    payload: ReflectionUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Reflection).where(Reflection.id == reflection_id))
    reflection = result.scalar_one_or_none()

    if reflection is None:
        raise HTTPException(status_code=404, detail="Reflection not found")

    apply_reflection_payload(reflection, payload)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Reflection for this date already exists",
        ) from exc

    await db.refresh(reflection)
    return reflection


@router.delete("/{reflection_id}")
async def delete_reflection(
    reflection_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Reflection).where(Reflection.id == reflection_id))
    reflection = result.scalar_one_or_none()

    if reflection is None:
        raise HTTPException(status_code=404, detail="Reflection not found")

    await db.delete(reflection)
    await db.commit()

    return {"message": "Reflection deleted"}
