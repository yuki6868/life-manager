from datetime import datetime

from pydantic import BaseModel


class StorageInfoResponse(BaseModel):
    data_dir: str
    database_path: str
    database_exists: bool
    database_size_bytes: int
    backups_dir: str
    backup_count: int


class BackupInfoResponse(BaseModel):
    filename: str
    path: str
    size_bytes: int
    created_at: datetime


class BackupCreateResponse(BaseModel):
    message: str
    backup: BackupInfoResponse
