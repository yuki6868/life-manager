import { apiClient } from "./client";

export type StorageInfo = {
  data_dir: string;
  database_path: string;
  database_exists: boolean;
  database_size_bytes: number;
  backups_dir: string;
  backup_count: number;
};

export type BackupInfo = {
  filename: string;
  path: string;
  size_bytes: number;
  created_at: string;
};

export type BackupCreateResponse = {
  message: string;
  backup: BackupInfo;
};

export async function fetchStorageInfo(): Promise<StorageInfo> {
  const res = await apiClient.get("/data/storage");
  return res.data;
}

export async function fetchBackups(): Promise<BackupInfo[]> {
  const res = await apiClient.get("/data/backups");
  return res.data;
}

export async function createBackup(): Promise<BackupCreateResponse> {
  const res = await apiClient.post("/data/backups");
  return res.data;
}
