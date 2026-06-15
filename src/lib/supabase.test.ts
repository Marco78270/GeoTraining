import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseClient,
  resolveSupabaseConfig,
  SupabaseConfigurationError,
} from "./supabase";

const originalWindow = globalThis.window;

afterEach(() => {
  vi.unstubAllEnvs();
  if (originalWindow) {
    globalThis.window = originalWindow;
  } else {
    // @ts-expect-error test cleanup
    delete globalThis.window;
  }
});

describe("createSupabaseClient", () => {
  it("rejects an invalid Supabase URL", () => {
    expect(() =>
      createSupabaseClient({
        url: "not-a-url",
        anonKey: "public-anon-key",
      }),
    ).toThrow(SupabaseConfigurationError);
  });

  it("rejects a missing or placeholder anonymous key", () => {
    expect(() =>
      createSupabaseClient({
        url: "https://example.supabase.co",
        anonKey: "replace-with-your-supabase-anon-key",
      }),
    ).toThrow("VITE_SUPABASE_ANON_KEY");
  });
});

describe("resolveSupabaseConfig", () => {
  it("prefers runtime config when available", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://build.example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "build-anon-key");
    globalThis.window = {
      __APP_CONFIG__: {
        VITE_SUPABASE_URL: "https://runtime.example.supabase.co",
        VITE_SUPABASE_ANON_KEY: "runtime-anon-key",
      },
    } as Window & typeof globalThis;

    expect(resolveSupabaseConfig()).toEqual({
      url: "https://runtime.example.supabase.co",
      anonKey: "runtime-anon-key",
    });
  });

  it("falls back to Vite env when runtime config is absent", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://build.example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "build-anon-key");
    globalThis.window = {} as Window & typeof globalThis;

    expect(resolveSupabaseConfig()).toEqual({
      url: "https://build.example.supabase.co",
      anonKey: "build-anon-key",
    });
  });
});
