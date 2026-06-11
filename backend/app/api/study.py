from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.study_category import StudyCategory
from app.models.study_log import StudyLog
from app.models.study_subject import StudySubject
from app.schemas.study import (
    StudyCategoryCreate,
    StudyCategoryResponse,
    StudyCategorySummary,
    StudyCategoryUpdate,
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


UNCATEGORIZED_NAME = "未分類"


def validate_minutes(minutes: int) -> None:
    if minutes <= 0:
        raise HTTPException(status_code=400, detail="duration_minutes must be greater than 0")


def validate_non_negative_minutes(minutes: int | None, field_name: str) -> None:
    if minutes is not None and minutes < 0:
        raise HTTPException(status_code=400, detail=f"{field_name} must be 0 or greater")


def validate_understanding(value: int | None) -> None:
    if value is not None and not 1 <= value <= 5:
        raise HTTPException(status_code=400, detail="understanding must be between 1 and 5")


async def get_category_or_404(category_id: int, db: AsyncSession) -> StudyCategory:
    result = await db.execute(select(StudyCategory).where(StudyCategory.id == category_id))
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(status_code=404, detail="Study category not found")
    return category


async def get_subject_or_404(subject_id: int, db: AsyncSession) -> StudySubject:
    result = await db.execute(select(StudySubject).where(StudySubject.id == subject_id))
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Study subject not found")
    return subject


def to_subject_response(subject: StudySubject, category: StudyCategory | None = None) -> StudySubjectResponse:
    resolved_category = category or subject.category
    return StudySubjectResponse(
        id=subject.id,
        name=subject.name,
        category_id=subject.category_id,
        category_name=resolved_category.name if resolved_category else None,
        exam_name=subject.exam_name,
        target_minutes=subject.target_minutes,
        color=subject.color,
        memo=subject.memo,
        created_at=subject.created_at,
        updated_at=subject.updated_at,
    )


def to_log_response(log: StudyLog, subject: StudySubject | None = None, category: StudyCategory | None = None) -> StudyLogResponse:
    resolved_subject = subject or log.subject
    resolved_category = category or (resolved_subject.category if resolved_subject else None)
    return StudyLogResponse(
        id=log.id,
        subject_id=log.subject_id,
        subject_name=resolved_subject.name if resolved_subject else "未設定",
        category_id=resolved_subject.category_id if resolved_subject else None,
        category_name=resolved_category.name if resolved_category else None,
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


@router.get("/categories", response_model=list[StudyCategoryResponse])
async def get_study_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StudyCategory).order_by(StudyCategory.id.asc()))
    return result.scalars().all()


@router.post("/categories", response_model=StudyCategoryResponse)
async def create_study_category(payload: StudyCategoryCreate, db: AsyncSession = Depends(get_db)):
    validate_non_negative_minutes(payload.target_minutes, "target_minutes")
    category = StudyCategory(**payload.model_dump())
    db.add(category)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=400, detail="同じ名前の上位カテゴリがすでにあります")
    await db.refresh(category)
    return category


@router.patch("/categories/{category_id}", response_model=StudyCategoryResponse)
async def update_study_category(category_id: int, payload: StudyCategoryUpdate, db: AsyncSession = Depends(get_db)):
    category = await get_category_or_404(category_id, db)
    data = payload.model_dump(exclude_unset=True)
    if "target_minutes" in data:
        validate_non_negative_minutes(data["target_minutes"], "target_minutes")
    for key, value in data.items():
        setattr(category, key, value)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=400, detail="同じ名前の上位カテゴリがすでにあります")
    await db.refresh(category)
    return category


@router.delete("/categories/{category_id}")
async def delete_study_category(category_id: int, db: AsyncSession = Depends(get_db)):
    category = await get_category_or_404(category_id, db)
    count_result = await db.execute(select(func.count(StudySubject.id)).where(StudySubject.category_id == category_id))
    if count_result.scalar_one() > 0:
        raise HTTPException(status_code=400, detail="科目がある上位カテゴリは削除できません")
    await db.delete(category)
    await db.commit()
    return {"message": "Study category deleted"}


@router.get("/subjects", response_model=list[StudySubjectResponse])
async def get_study_subjects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StudySubject, StudyCategory)
        .outerjoin(StudyCategory, StudySubject.category_id == StudyCategory.id)
        .order_by(StudyCategory.name.asc().nulls_last(), StudySubject.id.asc())
    )
    return [to_subject_response(subject, category) for subject, category in result.all()]


@router.post("/subjects", response_model=StudySubjectResponse)
async def create_study_subject(payload: StudySubjectCreate, db: AsyncSession = Depends(get_db)):
    validate_non_negative_minutes(payload.target_minutes, "target_minutes")
    category = None
    if payload.category_id is not None:
        category = await get_category_or_404(payload.category_id, db)

    subject = StudySubject(**payload.model_dump())
    db.add(subject)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=400, detail="同じ名前の科目がすでにあります")
    await db.refresh(subject)
    return to_subject_response(subject, category)


@router.patch("/subjects/{subject_id}", response_model=StudySubjectResponse)
async def update_study_subject(subject_id: int, payload: StudySubjectUpdate, db: AsyncSession = Depends(get_db)):
    subject = await get_subject_or_404(subject_id, db)
    data = payload.model_dump(exclude_unset=True)
    if "target_minutes" in data:
        validate_non_negative_minutes(data["target_minutes"], "target_minutes")
    category = None
    if "category_id" in data and data["category_id"] is not None:
        category = await get_category_or_404(data["category_id"], db)
    for key, value in data.items():
        setattr(subject, key, value)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=400, detail="同じ名前の科目がすでにあります")
    await db.refresh(subject)
    return to_subject_response(subject, category)


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
    category_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(StudyLog, StudySubject, StudyCategory)
        .join(StudySubject, StudyLog.subject_id == StudySubject.id)
        .outerjoin(StudyCategory, StudySubject.category_id == StudyCategory.id)
    )
    if start_date is not None:
        stmt = stmt.where(StudyLog.studied_on >= start_date)
    if end_date is not None:
        stmt = stmt.where(StudyLog.studied_on <= end_date)
    if subject_id is not None:
        stmt = stmt.where(StudyLog.subject_id == subject_id)
    if category_id is not None:
        stmt = stmt.where(StudySubject.category_id == category_id)
    stmt = stmt.order_by(StudyLog.studied_on.desc(), StudyLog.id.desc())
    result = await db.execute(stmt)
    return [to_log_response(log, subject, category) for log, subject, category in result.all()]


@router.post("/logs", response_model=StudyLogResponse)
async def create_study_log(payload: StudyLogCreate, db: AsyncSession = Depends(get_db)):
    validate_minutes(payload.duration_minutes)
    validate_understanding(payload.understanding)
    subject = await get_subject_or_404(payload.subject_id, db)
    category = await get_category_or_404(subject.category_id, db) if subject.category_id is not None else None
    log = StudyLog(**payload.model_dump())
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return to_log_response(log, subject, category)


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
    category = await get_category_or_404(subject.category_id, db) if subject.category_id is not None else None
    return to_log_response(log, subject, category)


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
            StudySubject.category_id,
            StudyCategory.name,
            StudySubject.exam_name,
            StudySubject.target_minutes,
            func.coalesce(func.sum(StudyLog.duration_minutes), 0),
            func.count(StudyLog.id),
        )
        .outerjoin(StudyCategory, StudySubject.category_id == StudyCategory.id)
        .outerjoin(
            StudyLog,
            (StudyLog.subject_id == StudySubject.id)
            & (StudyLog.studied_on >= start_date)
            & (StudyLog.studied_on <= end_date),
        )
        .group_by(StudySubject.id, StudyCategory.name)
        .order_by(func.coalesce(func.sum(StudyLog.duration_minutes), 0).desc(), StudySubject.id.asc())
    )

    subject_summaries = [
        StudySubjectSummary(
            subject_id=row[0],
            subject_name=row[1],
            category_id=row[2],
            category_name=row[3],
            exam_name=row[4],
            target_minutes=row[5],
            total_minutes=int(row[6] or 0),
            log_count=int(row[7] or 0),
        )
        for row in subject_result.all()
    ]

    category_result = await db.execute(
        select(
            StudyCategory.id,
            StudyCategory.name,
            StudyCategory.target_minutes,
            func.coalesce(func.sum(StudySubject.target_minutes), 0),
            func.coalesce(func.sum(StudyLog.duration_minutes), 0),
            func.count(StudyLog.id),
            func.count(func.distinct(StudySubject.id)),
        )
        .outerjoin(StudySubject, StudySubject.category_id == StudyCategory.id)
        .outerjoin(
            StudyLog,
            (StudyLog.subject_id == StudySubject.id)
            & (StudyLog.studied_on >= start_date)
            & (StudyLog.studied_on <= end_date),
        )
        .group_by(StudyCategory.id)
        .order_by(func.coalesce(func.sum(StudyLog.duration_minutes), 0).desc(), StudyCategory.id.asc())
    )
    category_summaries = []
    for row in category_result.all():
        category_target = int(row[2] or 0)
        subject_target = int(row[3] or 0)
        effective_target = category_target if category_target > 0 else subject_target
        category_summaries.append(
            StudyCategorySummary(
                category_id=row[0],
                category_name=row[1],
                target_minutes=category_target,
                subject_target_minutes=subject_target,
                effective_target_minutes=effective_target,
                total_minutes=int(row[4] or 0),
                log_count=int(row[5] or 0),
                subject_count=int(row[6] or 0),
            )
        )

    uncategorized_subjects = [item for item in subject_summaries if item.category_id is None]
    if uncategorized_subjects:
        uncategorized_target = sum(item.target_minutes for item in uncategorized_subjects)
        category_summaries.append(
            StudyCategorySummary(
                category_id=None,
                category_name=UNCATEGORIZED_NAME,
                target_minutes=0,
                subject_target_minutes=uncategorized_target,
                effective_target_minutes=uncategorized_target,
                total_minutes=sum(item.total_minutes for item in uncategorized_subjects),
                log_count=sum(item.log_count for item in uncategorized_subjects),
                subject_count=len(uncategorized_subjects),
            )
        )

    subject_targets_by_category: dict[int | None, int] = {}
    for item in subject_summaries:
        subject_targets_by_category[item.category_id] = subject_targets_by_category.get(item.category_id, 0) + item.target_minutes

    for item in category_summaries:
        item.subject_target_minutes = subject_targets_by_category.get(item.category_id, 0)
        item.effective_target_minutes = item.target_minutes if item.target_minutes > 0 else item.subject_target_minutes

    category_summaries.sort(key=lambda item: (-item.total_minutes, item.category_id or 10**9))

    daily_result = await db.execute(
        select(StudyLog.studied_on, func.coalesce(func.sum(StudyLog.duration_minutes), 0))
        .where(StudyLog.studied_on >= start_date, StudyLog.studied_on <= end_date)
        .group_by(StudyLog.studied_on)
        .order_by(StudyLog.studied_on.asc())
    )
    daily_summaries = [StudyDailySummary(studied_on=row[0], total_minutes=int(row[1] or 0)) for row in daily_result.all()]

    subject_target_minutes = sum(item.target_minutes for item in subject_summaries)
    category_target_minutes = sum(item.target_minutes for item in category_summaries if item.category_id is not None)
    effective_target_minutes = sum(item.effective_target_minutes for item in category_summaries)

    return StudySummaryResponse(
        total_minutes=sum(item.total_minutes for item in subject_summaries),
        total_logs=sum(item.log_count for item in subject_summaries),
        subject_target_minutes=subject_target_minutes,
        category_target_minutes=category_target_minutes,
        effective_target_minutes=effective_target_minutes,
        category_summaries=category_summaries,
        subject_summaries=subject_summaries,
        daily_summaries=daily_summaries,
    )
