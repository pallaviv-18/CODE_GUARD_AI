import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api",
  withCredentials: true,
  timeout: 35_000,
});

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || "The server could not complete this request.";
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
