export type ID = number;

export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type Status = "active" | "completed" | "archived";