import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

declare global {
  interface Window {
    __APP_CONFIG__?: {
      VITE_SUPABASE_URL?: string;
      VITE_SUPABASE_ANON_KEY?: string;
    };
  }
}

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

function validateConfig(config: SupabaseConfig) {
  let url: URL;

  try {
    url = new URL(config.url);
  } catch {
    throw new SupabaseConfigurationError(
      "VITE_SUPABASE_URL doit être une URL HTTP(S) valide.",
    );
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SupabaseConfigurationError(
      "VITE_SUPABASE_URL doit être une URL HTTP(S) valide.",
    );
  }

  if (
    !config.anonKey.trim() ||
    config.anonKey === "replace-with-your-supabase-anon-key"
  ) {
    throw new SupabaseConfigurationError(
      "VITE_SUPABASE_ANON_KEY est absente ou utilise encore la valeur d'exemple.",
    );
  }
}

function readRuntimeConfig() {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.__APP_CONFIG__;
}

export function resolveSupabaseConfig(): SupabaseConfig {
  const runtimeConfig = readRuntimeConfig();

  return {
    url: runtimeConfig?.VITE_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? "",
    anonKey:
      runtimeConfig?.VITE_SUPABASE_ANON_KEY ??
      import.meta.env.VITE_SUPABASE_ANON_KEY ??
      "",
  };
}

export function createSupabaseClient(
  config: SupabaseConfig,
): SupabaseClient<Database> {
  validateConfig(config);
  return createClient<Database>(config.url, config.anonKey);
}

let singleton: SupabaseClient<Database> | undefined;

export function getSupabaseClient(): SupabaseClient<Database> {
  singleton ??= createSupabaseClient(resolveSupabaseConfig());

  return singleton;
}
