import { existsSync } from "node:fs";

/** Loads .env.local into process.env when the file exists. Never prints values. */
export function loadEnv(): void {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}
