from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

APP_DATA_DIR_NAME = "LifeManagerData"
DB_FILE_NAME = "life_manager.db"


def get_app_data_dir() -> Path:
    """ユーザーごとの永続データ保存先を返す。

    Electron/デスクトップアプリ化したあとも、アプリ本体の置き換えで
    DB が消えないように、プロジェクト配下ではなくユーザー領域へ保存する。
    """
    env_dir = os.getenv("LIFE_MANAGER_DATA_DIR")
    if env_dir:
        return Path(env_dir).expanduser().resolve()

    if sys.platform == "win32":
        base = Path(os.getenv("APPDATA") or Path.home() / "AppData" / "Roaming")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.getenv("XDG_DATA_HOME") or Path.home() / ".local" / "share")

    return base / APP_DATA_DIR_NAME


def get_database_path() -> Path:
    return get_app_data_dir() / DB_FILE_NAME


def _legacy_database_candidates() -> list[Path]:
    backend_dir = Path(__file__).resolve().parents[2]
    cwd = Path.cwd()
    return [
        backend_dir / DB_FILE_NAME,
        cwd / DB_FILE_NAME,
        cwd / "backend" / DB_FILE_NAME,
    ]


def ensure_user_data_dir() -> Path:
    data_dir = get_app_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def ensure_user_database() -> Path:
    """ユーザー領域に DB を用意する。

    初回起動時だけ、既存の開発用/旧配置 DB があればコピーする。
    すでにユーザー領域に DB がある場合は絶対に上書きしない。
    """
    db_path = get_database_path()
    ensure_user_data_dir()

    if db_path.exists():
        return db_path

    for candidate in _legacy_database_candidates():
        if candidate.exists() and candidate.resolve() != db_path.resolve():
            shutil.copy2(candidate, db_path)
            break

    return db_path


def sqlite_url_from_path(path: Path) -> str:
    """SQLAlchemy 用の SQLite URL を作る。

    sqlite3 は DB ファイルの親ディレクトリが存在しないと
    `unable to open database file` になるため、URL 化の直前でも
    必ず親ディレクトリを作成する。

    ここで percent encode すると、環境によって
    `Application%20Support` のような文字列がそのまま解釈され、
    実在しない親ディレクトリを参照することがある。
    そのため、Path.as_posix() の生パスを使う。
    """
    resolved = path.expanduser().resolve()
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite+aiosqlite:///{resolved.as_posix()}"


def display_user_path(path: Path) -> str:
    """画面表示用にユーザー名を含む絶対パスを隠す。

    配布前のスクリーンショットやデモで /Users/<name> が露出しないよう、
    ホーム配下は ~ から始まる表記に変換する。
    """
    resolved = path.expanduser().resolve()
    home = Path.home().resolve()
    try:
        return f"~/{resolved.relative_to(home).as_posix()}"
    except ValueError:
        return resolved.as_posix()
