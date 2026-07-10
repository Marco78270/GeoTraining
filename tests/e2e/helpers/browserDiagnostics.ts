import { expect, type Page, type Response } from "@playwright/test";

type DiagnosticKind =
  | "console error"
  | "page error"
  | "request failed"
  | "non-ok response";

type DiagnosticEntry = {
  kind: DiagnosticKind;
  message: string;
};

type BrowserDiagnostics = {
  assertClean(): Promise<void>;
};

const APP_RESOURCE_TYPES = new Set(["document", "fetch", "script", "stylesheet", "xhr"]);

export function attachBrowserDiagnostics(page: Page): BrowserDiagnostics {
  const entries: DiagnosticEntry[] = [];
  let appOrigin: string | null = null;

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    entries.push({
      kind: "console error",
      message: message.text(),
    });
  });

  page.on("pageerror", (error) => {
    entries.push({
      kind: "page error",
      message: error.stack ?? error.message,
    });
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "unknown error";
    if (/ERR_ABORTED/i.test(failure)) {
      return;
    }

    entries.push({
      kind: "request failed",
      message: `${request.method()} ${request.url()} (${failure})`,
    });
  });

  page.on("response", (response) => {
    if (response.status() === 304) {
      return;
    }

    if (!response.ok() && isSuspiciousResponse(response, appOrigin)) {
      entries.push({
        kind: "non-ok response",
        message: `${response.status()} ${response.request().method()} ${response.url()}`,
      });
    }

    if (!appOrigin) {
      appOrigin = tryGetOrigin(response.url());
    }
  });

  return {
    async assertClean() {
      expect(
        entries,
        formatDiagnosticMessage(entries),
      ).toEqual([]);
    },
  };
}

function isSuspiciousResponse(response: Response, appOrigin: string | null): boolean {
  const url = response.url();
  const origin = tryGetOrigin(url);
  const pathname = tryGetPathname(url);
  const resourceType = response.request().resourceType();

  return (
    pathname.endsWith(".geojson") ||
    pathname.includes("/api/") ||
    (APP_RESOURCE_TYPES.has(resourceType) && !!origin && origin === appOrigin)
  );
}

function tryGetOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function tryGetPathname(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

function formatDiagnosticMessage(entries: DiagnosticEntry[]): string {
  if (entries.length === 0) {
    return "Expected browser diagnostics to stay clean.";
  }

  const details = entries.map((entry, index) => `${index + 1}. [${entry.kind}] ${entry.message}`);

  return ["Browser diagnostics found unexpected issues:", ...details].join("\n");
}
