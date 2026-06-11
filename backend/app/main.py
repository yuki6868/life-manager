from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.paths import display_user_path, ensure_user_data_dir, ensure_user_database, get_database_path
from app.db.base import Base
from app.db.session import engine, AsyncSessionLocal
from app.db.init_db import (
    create_initial_user,
    ensure_study_category_tables,
    ensure_tasks_urgent_columns,
    ensure_work_logs_gap_task_column,
)

import app.models
from app.api.goals import router as goal_router
from app.api.projects import router as project_router
from app.api.tasks import router as task_router
from app.api.calendar_events import router as calendar_event_router
from app.api.recurrence_rules import router as recurrence_rule_router
from app.api.work_logs import router as work_log_router
from app.api.dashboard import router as dashboard_router
from app.api.reflections import router as reflection_router
from app.api.project_reflections import router as project_reflection_router
from app.api.estimations import router as estimation_router
from app.api.gap_tasks import router as gap_task_router
from app.api.assistant import router as assistant_router
from app.api.study import router as study_router
from app.api.data_management import router as data_management_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_user_data_dir()
    ensure_user_database()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        await ensure_work_logs_gap_task_column(db)
        await ensure_tasks_urgent_columns(db)
        await ensure_study_category_tables(db)
        await create_initial_user(db)

    yield


app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # Electron の本番表示は file:// 由来で Origin: null になるため、
    # 開発用 Vite とデスクトップ実行の両方を許可する。
    allow_origins=[
        settings.FRONTEND_ORIGIN,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "null",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(goal_router)
app.include_router(project_router)
app.include_router(task_router)
app.include_router(calendar_event_router)
app.include_router(recurrence_rule_router)
app.include_router(work_log_router)
app.include_router(dashboard_router)
app.include_router(reflection_router)
app.include_router(project_reflection_router)
app.include_router(estimation_router)
app.include_router(gap_task_router)
app.include_router(assistant_router)
app.include_router(study_router)
app.include_router(data_management_router)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
        "data_dir": display_user_path(get_database_path().parent),
        "database": display_user_path(get_database_path()),
    }