# AI秘書 LIFE MANAGER

フリーランス・個人開発者向けの行動管理アプリです。予定、実績、タスク、プロジェクト、スキマ時間、振り返りをまとめて管理できます。

## 主な機能

- ダッシュボード
  - 今日の予定、実績、達成率、次にやることを確認
  - AI秘書からの提案を表示
  - 集中時間ブロック、未完了タスク、最近完了したタスクを確認
- カレンダー
  - 日・週・月表示
  - 予定の作成、編集、削除
  - タイムライン上で予定を移動
  - 予定と実績の横並び比較
  - 繰り返し予定、昨日やったタスク、最近やったタスクの再利用
- プロジェクト管理
  - プロジェクト作成、進捗管理、ステータス管理
- タスク管理
  - 通常タスク、優先タスク、緊急タスクの管理
- タイマー
  - 作業時間の記録
  - 実績ログとの連携
- 工数・精度
  - 予定時間と実績時間の比較
  - 見積もり精度の確認
- スキマタスク
  - 30分以内など短時間でできるタスクの管理
- 振り返り
  - 日次振り返り
  - プロジェクト振り返り

## 技術構成

```text
life-manager/
├── backend/   FastAPI + SQLAlchemy + SQLite
└── frontend/  React + TypeScript + Vite
```

- バックエンド: FastAPI
- フロントエンド: React / TypeScript / Vite
- データベース: SQLite
- API通信: Axios

## 必要なもの

事前に以下をインストールしてください。

- Python 3.11以上
- Node.js 20以上
- npm

確認コマンド:

```bash
python --version
node --version
npm --version
```

Macで `python` が使えない場合は、以降のコマンドを `python3` に読み替えてください。

## 初回セットアップ

リポジトリ直下で作業します。

```bash
cd life-manager
```

### 1. バックエンドのセットアップ

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Windows PowerShellの場合:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
```

### 2. バックエンドの環境変数

`backend/.env` がない場合は作成してください。

```env
APP_NAME=Life Manager
APP_ENV=development
DATABASE_URL=sqlite+aiosqlite:///./life_manager.db
FRONTEND_ORIGIN=http://localhost:5173
```

### 3. フロントエンドのセットアップ

別ターミナルでリポジトリ直下に戻ってから実行します。

```bash
cd frontend
npm install
```

### 4. フロントエンドの環境変数

`frontend/.env` がない場合は作成してください。

```env
VITE_API_BASE_URL=http://localhost:8000
```

## 起動方法

バックエンドとフロントエンドを別々のターミナルで起動します。

### ターミナル1: バックエンド起動

```bash
cd life-manager/backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

起動できたら、以下にアクセスして確認できます。

```text
http://localhost:8000/health
```

正常なら以下のようなレスポンスが返ります。

```json
{
  "status": "ok",
  "app": "Life Manager",
  "env": "development"
}
```

APIドキュメントは以下です。

```text
http://localhost:8000/docs
```

### ターミナル2: フロントエンド起動

```bash
cd life-manager/frontend
npm run dev
```

表示されたURLをブラウザで開きます。通常は以下です。

```text
http://localhost:5173
```

## よく使うコマンド

### バックエンド

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

### フロントエンド

```bash
cd frontend
npm run dev
```

### TypeScriptチェック

```bash
cd frontend
npx tsc -b --pretty false
```

### フロントエンドのビルド

```bash
cd frontend
npm run build
```

### フロントエンドのプレビュー

```bash
cd frontend
npm run preview
```

## データベースについて

データベースは `backend/life_manager.db` に作成されます。

初回起動時に、FastAPI側で必要なテーブルが自動作成されます。

データを初期化したい場合は、バックエンドを停止してから以下を実行してください。

```bash
cd backend
rm life_manager.db
uvicorn app.main:app --reload
```

Windows PowerShellの場合:

```powershell
cd backend
Remove-Item life_manager.db
uvicorn app.main:app --reload
```

## 画面一覧

| 画面 | 内容 |
| --- | --- |
| ダッシュボード | 今日の予定、実績、提案、集中時間、進捗を確認 |
| カレンダー | 予定と実績を日・週・月で管理 |
| プロジェクト | プロジェクトの作成、編集、進捗管理 |
| タスク | タスクの作成、編集、ステータス管理 |
| タイマー | 作業時間を計測して実績化 |
| 工数・精度 | 予定時間と実績時間の差分を分析 |
| 繰り返し | 繰り返し予定の管理 |
| スキマタスク | 短時間でできるタスクの管理 |
| 分析 | 作業実績や傾向の確認 |
| 設定 | アプリ設定 |

## APIの主なエンドポイント

| 種別 | パス |
| --- | --- |
| ヘルスチェック | `GET /health` |
| 目標 | `/goals` |
| プロジェクト | `/projects` |
| タスク | `/tasks` |
| カレンダー予定 | `/calendar-events` |
| 繰り返し予定 | `/recurrence-rules` |
| 実績ログ | `/work-logs` |
| ダッシュボード | `/dashboard` |
| 振り返り | `/reflections` |
| プロジェクト振り返り | `/project-reflections` |
| 見積もり精度 | `/estimations` |
| スキマタスク | `/gap-tasks` |
| AI秘書提案 | `/assistant` |

詳細はバックエンド起動後に以下で確認できます。

```text
http://localhost:8000/docs
```

## トラブルシューティング

### フロントエンドからAPIにつながらない

以下を確認してください。

1. バックエンドが起動しているか

```text
http://localhost:8000/health
```

2. `frontend/.env` が正しいか

```env
VITE_API_BASE_URL=http://localhost:8000
```

3. `backend/.env` の `FRONTEND_ORIGIN` が正しいか

```env
FRONTEND_ORIGIN=http://localhost:5173
```

### `ModuleNotFoundError: No module named 'app'` が出る

`backend` ディレクトリで起動してください。

```bash
cd life-manager/backend
uvicorn app.main:app --reload
```

### `npm run build` で optional dependency 系のエラーが出る

Node.js / npm の optional dependency が壊れている可能性があります。以下を試してください。

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

Windows PowerShellの場合:

```powershell
cd frontend
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
npm run build
```

### ポートが使用中と言われる

バックエンドの `8000`、またはフロントエンドの `5173` がすでに使われています。

バックエンドのポートを変える例:

```bash
cd backend
uvicorn app.main:app --reload --port 8001
```

その場合は `frontend/.env` も変更します。

```env
VITE_API_BASE_URL=http://localhost:8001
```

## 開発メモ

- バックエンドの入口は `backend/app/main.py` です。
- フロントエンドの入口は `frontend/src/main.tsx` です。
- 画面コンポーネントは `frontend/src/pages/` にあります。
- APIクライアントは `frontend/src/api/` にあります。
- 共通CSSは `frontend/src/App.css` にあります。

## Gitでパッチを適用する方法

パッチファイルをリポジトリ直下に置いてから実行します。

```bash
git apply パッチファイル名.patch
```

適用前に確認したい場合:

```bash
git apply --check パッチファイル名.patch
```

失敗した場合は、現在のコードとパッチ作成時のコードに差分がある可能性があります。最新のzipを渡して、パッチを作り直してください。

## Electron化へ向けた開発起動

Electron版では、画面はElectron、APIはローカルのFastAPIで動かします。
DBはユーザー領域 `~/Library/Application Support/LifeManagerData/` に保存されるため、アプリ本体を更新してもデータは残ります。

### 追加セットアップ

リポジトリ直下でElectronを入れます。

```bash
npm install
```

### Electron開発起動

```bash
npm run desktop:dev
```

内部では以下を行います。

```text
Viteを起動
Electronを起動
ElectronからFastAPIを起動
Electron画面から http://127.0.0.1:8000 に接続
```

### フロントエンドだけ本番ビルド確認

```bash
npm run desktop:build:frontend
```

この段階ではまだ `.app` / `.dmg` 作成までは行いません。
次の段階で、FastAPIをPyInstallerで実行ファイル化し、electron-builderで同梱します。
