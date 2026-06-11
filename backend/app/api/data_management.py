from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.core.paths import display_user_path, ensure_user_database, get_app_data_dir, get_database_path
from app.schemas.data_management import BackupCreateResponse, BackupInfoResponse, StorageInfoResponse

router = APIRouter(prefix="/data", tags=["Data"])

BACKUP_DIR_NAME = "backups"
BACKUP_PREFIX = "life_manager_backup_"
BACKUP_SUFFIX = ".db"
MAX_BACKUPS = 20


def get_backups_dir() -> Path:
    backups_dir = get_app_data_dir() / BACKUP_DIR_NAME
    backups_dir.mkdir(parents=True, exist_ok=True)
    return backups_dir


def to_backup_info(path: Path) -> BackupInfoResponse:
    stat = path.stat()
    return BackupInfoResponse(
        filename=path.name,
        path=display_user_path(path),
        size_bytes=stat.st_size,
        created_at=datetime.fromtimestamp(stat.st_mtime),
    )


def list_backup_paths() -> list[Path]:
    backups_dir = get_backups_dir()
    return sorted(
        backups_dir.glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )


def cleanup_old_backups() -> None:
    for old_backup in list_backup_paths()[MAX_BACKUPS:]:
        old_backup.unlink(missing_ok=True)


@router.get("/storage", response_model=StorageInfoResponse)
async def get_storage_info():
    db_path = ensure_user_database()
    backups = list_backup_paths()
    return StorageInfoResponse(
        data_dir=display_user_path(get_app_data_dir()),
        database_path=display_user_path(db_path),
        database_exists=db_path.exists(),
        database_size_bytes=db_path.stat().st_size if db_path.exists() else 0,
        backups_dir=display_user_path(get_backups_dir()),
        backup_count=len(backups),
    )


@router.get("/backups", response_model=list[BackupInfoResponse])
async def get_backups():
    return [to_backup_info(path) for path in list_backup_paths()]


@router.post("/backups", response_model=BackupCreateResponse)
async def create_backup():
    db_path = get_database_path()
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="バックアップ対象のDBがありません")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = get_backups_dir() / f"{BACKUP_PREFIX}{timestamp}{BACKUP_SUFFIX}"
    shutil.copy2(db_path, backup_path)
    cleanup_old_backups()

    return BackupCreateResponse(
        message="バックアップを作成しました",
        backup=to_backup_info(backup_path),
    )
