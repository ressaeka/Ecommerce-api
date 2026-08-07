export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export function successResponse<T>(data: T, message: string): ApiResponse<T> {
  return { success: true, message, data };
}
