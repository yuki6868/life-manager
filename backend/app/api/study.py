from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.study_log import StudyLog
from app.models.study_subject import StudySubject
from app.schemas.study import (
    StudyDailySummary,
    StudyLogCreate,
    StudyLogResponse,
    StudyLogUpdate,
    StudySubjectCreate,
    StudySubjectResponse,
    StudySubjectSummary,
    StudySubjectUpdate,
    StudySummaryResponse,
)

router = APIRouter(prefix="/study", tags=["Study"])


def validate_minutes(minutes: int) -> None:
    if minutes <= 0:
        raise HTTPException(status_code=400, detail="duration_minutes must be greater than 0")


def validate_understanding(value: int | None) -> None:
    if value is not None and not 1 <= value <= 5:
        raise HTTPException(status_code=400, detail="understanding must be between 1 and 5")


async def get_subject_or_404(subject_id: int, db: AsyncSession) -> StudySubject:
    result = await db.execute(select(StudySubject).where(StudySubject.id == subject_id))
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Study subject not found")
    return subject


def to_log_response(log: StudyLog, subject: StudySubject | None = None) -> StudyLogResponse:
    resolved_subject = subject or log.subject
    return StudyLogResponse(
        id=log.id,
        subject_id=log.subject_id,
        subject_name=resolved_subject.name if resolved_subject else "未設定",
        studied_on=log.studied_on,
        started_at=log.started_at,
        ended_at=log.ended_at,
        duration_minutes=log.duration_minutes,
        material=log.material,
        unit=log.unit,
        method=log.method,
        understanding=log.understanding,
        memo=log.memo,
        created_at=log.created_at,
        updated_at=log.updated_at,
    )


@router.get("/subjects", response_model=list[StudySubjectResponse])
async def get_study_subjects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StudySubject).order_by(StudySubject.id.asc()))
    return result.scalars().all()


@router.post("/subjects", response_model=StudySubjectResponse)
async def create_study_subject(payload: StudySubjectCreate, db: AsyncSession = Depends(get_db)):
    if payload.target_minutes < 0:
        raise HTTPException(status_code=400, detail="target_minutes must be 0 or greater")

    subject = StudySubject(**payload.model_dump())
    db.add(subject)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=400, detail="同じ名前の科目がすでにあります")
    await db.refresh(subject)
    return subject


@router.patch("/subjects/{subject_id}", response_model=StudySubjectResponse)
async def update_study_subject(subject_id: int, payload: StudySubjectUpdate, db: AsyncSession = Depends(get_db)):
    subject = await get_subject_or_404(subject_id, db)
    data = payload.model_dump(exclude_unset=True)
    if "target_minutes" in data and data["target_minutes"] is not None and data["target_minutes"] < 0:
        raise HTTPException(status_code=400, detail="target_minutes must be 0 or greater")
    for key, value in data.items():
        setattr(subject, key, value)
    await db.commit()
    await db.refresh(subject)
    return subject


@router.delete("/subjects/{subject_id}")
async def delete_study_subject(subject_id: int, db: AsyncSession = Depends(get_db)):
    subject = await get_subject_or_404(subject_id, db)
    count_result = await db.execute(select(func.count(StudyLog.id)).where(StudyLog.subject_id == subject_id))
    if count_result.scalar_one() > 0:
        raise HTTPException(status_code=400, detail="学習ログがある科目は削除できません")
    await db.delete(subject)
    await db.commit()
    return {"message": "Study subject deleted"}


@router.get("/logs", response_model=list[StudyLogResponse])
async def get_study_logs(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    subject_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(StudyLog, StudySubject).join(StudySubject, StudyLog.subject_id == StudySubject.id)
    if start_date is not None:
        stmt = stmt.where(StudyLog.studied_on >= start_date)
    if end_date is not None:
        stmt = stmt.where(StudyLog.studied_on <= end_date)
    if subject_id is not None:
        stmt = stmt.where(StudyLog.subject_id == subject_id)
    stmt = stmt.order_by(StudyLog.studied_on.desc(), StudyLog.id.desc())
    result = await db.execute(stmt)
    return [to_log_response(log, subject) for log, subject in result.all()]


@router.post("/logs", response_model=StudyLogResponse)
async def create_study_log(payload: StudyLogCreate, db: AsyncSession = Depends(get_db)):
    validate_minutes(payload.duration_minutes)
    validate_understanding(payload.understanding)
    subject = await get_subject_or_404(payload.subject_id, db)
    log = StudyLog(**payload.model_dump())
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return to_log_response(log, subject)


@router.patch("/logs/{log_id}", response_model=StudyLogResponse)
async def update_study_log(log_id: int, payload: StudyLogUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StudyLog).where(StudyLog.id == log_id))
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Study log not found")

    data = payload.model_dump(exclude_unset=True)
    if "duration_minutes" in data and data["duration_minutes"] is not None:
        validate_minutes(data["duration_minutes"])
    if "understanding" in data:
        validate_understanding(data["understanding"])
    if "subject_id" in data and data["subject_id"] is not None:
        await get_subject_or_404(data["subject_id"], db)

    for key, value in data.items():
        setattr(log, key, value)
    await db.commit()
    await db.refresh(log)
    subject = await get_subject_or_404(log.subject_id, db)
    return to_log_response(log, subject)


@router.delete("/logs/{log_id}")
async def delete_study_log(log_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StudyLog).where(StudyLog.id == log_id))
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Study log not found")
    await db.delete(log)
    await db.commit()
    return {"message": "Study log deleted"}


@router.get("/summary", response_model=StudySummaryResponse)
async def get_study_summary(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    if start_date is None:
        start_date = today - timedelta(days=6)
    if end_date is None:
        end_date = today

    subject_result = await db.execute(
        select(
            StudySubject.id,
            StudySubject.name,
            StudySubject.exam_name,
            StudySubject.target_minutes,
            func.coalesce(func.sum(StudyLog.duration_minutes), 0),
            func.count(StudyLog.id),
        )
        .outerjoin(
            StudyLog,
            (StudyLog.subject_id == StudySubject.id)
            & (StudyLog.studied_on >= start_date)
            & (StudyLog.studied_on <= end_date),
        )
        .group_by(StudySubject.id)
        .order_by(func.coalesce(func.sum(StudyLog.duration_minutes), 0).desc(), StudySubject.id.asc())
    )

    subject_summaries = [
        StudySubjectSummary(
            subject_id=row[0],
            subject_name=row[1],
            exam_name=row[2],
            target_minutes=row[3],
            total_minutes=int(row[4] or 0),
            log_count=int(row[5] or 0),
        )
        for row in subject_result.all()
    ]

    daily_result = await db.execute(
        select(StudyLog.studied_on, func.coalesce(func.sum(StudyLog.duration_minutes), 0))
        .where(StudyLog.studied_on >= start_date, StudyLog.studied_on <= end_date)
        .group_by(StudyLog.studied_on)
        .order_by(StudyLog.studied_on.asc())
    )
    daily_summaries = [StudyDailySummary(studied_on=row[0], total_minutes=int(row[1] or 0)) for row in daily_result.all()]

    return StudySummaryResponse(
        total_minutes=sum(item.total_minutes for item in subject_summaries),
        total_logs=sum(item.log_count for item in subject_summaries),
        subject_summaries=subject_summaries,
        daily_summaries=daily_summaries,
    )
