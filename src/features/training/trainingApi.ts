import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";
import type {
  CompletedTrainingSessionResult,
  TrainingClue,
  TrainingZoneGeoJson,
} from "./trainingSession";

type Difficulty = TrainingClue["difficulty"];

type PublishedTrainingClueRow = {
  id: string;
  category_id: string;
  country_code: string;
  title: string;
  coverage: TrainingClue["coverage"];
  difficulty: Difficulty;
  source_name: string | null;
  source_url: string | null;
  categories: { name: string; icon: string | null } | null;
  countries: { name: string } | null;
  clue_images: Array<{
    storage_path: string;
    alt_text: string | null;
    sort_order: number;
  }>;
  clue_regions: Array<{
    region_id: string;
    regions: { name: string } | null;
  }>;
  clue_zones:
    | Array<{
        geojson: TrainingZoneGeoJson | null;
      }>
    | {
        geojson: TrainingZoneGeoJson | null;
      }
    | null;
};

export type TrainingSessionRow =
  Database["public"]["Tables"]["training_sessions"]["Row"];

type TrainingSessionCompletionRpcRow = TrainingSessionRow & {
  xp_delta?: number | string | null;
  xp_total?: number | string | null;
  xp_awarded?: boolean | null;
};

export type CompletedTrainingSessionRow = TrainingSessionRow &
  CompletedTrainingSessionResult;

export type CreateTrainingSessionInput = {
  collectionId: string;
  categoryId?: string | null;
  mode: "world" | "country";
  countryCode?: string | null;
  totalQuestions: number;
  challengeType?: "standard" | "daily";
  challengeKey?: string | null;
};

export type DailyChallengeProgress = {
  completedSessions: number;
  bestAccuracyPercent: number | null;
  bestDurationMs: number | null;
  latestCompletedAt: string | null;
};

export type DailyChallengeStatus =
  | "available"
  | "in_progress"
  | "completed"
  | "unavailable";

export type DailyAttemptStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type DailyChallenge = {
  status: DailyChallengeStatus;
  challengeId: string;
  challengeKey: string;
  collectionId: string;
  collectionName: string;
  categoryId: string | null;
  categoryName: string;
  mode: "world";
  questionCount: number;
  secondsUntilReset: number;
  attemptStatus: DailyAttemptStatus;
};

export type DailyChallengeQuestion = {
  position: number;
  clueId: string;
  imageUrl: string;
  imageAlt: string;
  difficulty: Difficulty;
  categoryName: string;
  categoryIcon: string | null;
};

export type DailyAttempt = {
  attemptId: string;
  challengeId: string;
  challengeKey: string;
  collectionId: string;
  collectionName: string;
  categoryId: string | null;
  categoryName: string;
  mode: "world";
  questionCount: number;
  currentPosition: number;
  isPremium: boolean;
  startedAt?: string;
  answeredSteps?: Array<{
    position: number;
    isCorrect: boolean;
  }>;
  questions: DailyChallengeQuestion[];
};

export type DailyAnswerInput = {
  attemptId: string;
  position: number;
  selectedCode: string;
};

export type DailyAnswerResult = {
  position: number;
  selectedCode: string;
  selectedLabel: string;
  correctCode: string;
  correctLabel: string;
  isCorrect: boolean;
  completed: boolean;
  currentPosition: number;
  correctAnswers: number;
  totalQuestions: number;
  durationMs: number | null;
  xpDelta: number;
  xpTotal: number | null;
  xpAwarded: boolean;
};

export type RecordTrainingAnswerInput = {
  sessionId: string;
  clueId: string;
  selectedCode: string;
  correctCode: string;
  isCorrect: boolean;
};

export type TrainingDataClient = {
  listPublishedClues(collectionId: string): Promise<PublishedTrainingClueRow[]>;
  createSignedImageUrls(paths: string[]): Promise<Record<string, string>>;
  startSession(input: CreateTrainingSessionInput): Promise<TrainingSessionRow>;
  insertAnswer(input: RecordTrainingAnswerInput): Promise<void>;
  completeSession(sessionId: string): Promise<TrainingSessionCompletionRpcRow>;
  getDailyChallengeProgress(
    collectionId: string,
    challengeKey: string,
  ): Promise<DailyChallengeProgress>;
  loadDailyChallenge(): Promise<DailyChallenge | null>;
  startDailyAttempt(): Promise<DailyAttempt>;
  submitDailyAnswer(input: DailyAnswerInput): Promise<DailyAnswerResult>;
};

function isSignedUrlAccessError(error: { message: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return (
    error.code === "403" ||
    error.code === "401" ||
    message.includes("permission") ||
    message.includes("access denied") ||
    message.includes("row-level security") ||
    message.includes("unauthorized")
  );
}

function buildOfficialFlagFallbackUrl(countryCode: string) {
  return `https://flagcdn.com/w320/${countryCode.toLowerCase()}.png`;
}

function buildWikimediaFileFallbackUrl(sourceUrl: string | null) {
  if (!sourceUrl) {
    return null;
  }

  try {
    const url = new URL(sourceUrl);
    if (
      url.hostname !== "commons.wikimedia.org" ||
      !url.pathname.startsWith("/wiki/File:")
    ) {
      return null;
    }
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${url.pathname.slice("/wiki/File:".length)}?width=1200`;
  } catch {
    return null;
  }
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildGenericClueFallbackUrl(clue: PublishedTrainingClueRow) {
  const countryName = clue.countries?.name ?? clue.country_code;
  const categoryName = clue.categories?.name ?? "Indice";
  const accent =
    clue.difficulty === "expert"
      ? "#ff6b6b"
      : clue.difficulty === "medium"
        ? "#f4c84f"
        : "#4fd38a";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
      <defs>
        <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#0f1f33"/>
          <stop offset="100%" stop-color="#10293d"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="675" fill="url(#bg)"/>
      <rect x="96" y="96" width="1008" height="483" rx="28" fill="#11273a" stroke="${accent}" stroke-width="4"/>
      <text x="600" y="210" fill="#8ba6bf" font-size="38" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">${escapeSvgText(
        categoryName.toUpperCase(),
      )}</text>
      <text x="600" y="320" fill="#f7fbff" font-size="72" font-weight="700" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">${escapeSvgText(
        countryName,
      )}</text>
      <text x="600" y="408" fill="#d5e3ef" font-size="46" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">${escapeSvgText(
        clue.title,
      )}</text>
      <text x="600" y="510" fill="#8ba6bf" font-size="28" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">Visuel de secours GeoTrainer</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function canUseOfficialFlagFallback(clue: PublishedTrainingClueRow) {
  return (
    clue.source_name?.includes("FlagCDN") === true ||
    clue.title.startsWith("Drapeau - ")
  );
}

function resolveFallbackImageUrl(clue: PublishedTrainingClueRow) {
  if (canUseOfficialFlagFallback(clue)) {
    return buildOfficialFlagFallbackUrl(clue.country_code);
  }

  const wikimediaFallbackUrl = buildWikimediaFileFallbackUrl(clue.source_url);
  if (wikimediaFallbackUrl) {
    return wikimediaFallbackUrl;
  }

  if (clue.source_name || clue.source_url) {
    return buildGenericClueFallbackUrl(clue);
  }

  return null;
}

function readClueZoneGeoJson(clueZones: PublishedTrainingClueRow["clue_zones"]) {
  if (Array.isArray(clueZones)) {
    return clueZones.find((zone) => zone.geojson)?.geojson ?? null;
  }
  return clueZones?.geojson ?? null;
}

type DailyChallengeRpcRow = {
  status: DailyChallengeStatus;
  challenge_id: string;
  challenge_key: string;
  collection_id: string;
  collection_name: string;
  category_id: string | null;
  category_name: string;
  mode: "world";
  question_count: number;
  seconds_until_reset: number;
  attempt_status: DailyAttemptStatus;
};

type DailyChallengeQuestionRpcRow = {
  position: number;
  clue_id: string;
  image_storage_path: string;
  image_alt: string;
  difficulty: Difficulty;
  category_name: string;
  category_icon: string | null;
};

type DailyAttemptRpcRow = {
  attempt_id: string;
  challenge_id: string;
  challenge_key: string;
  collection_id: string;
  collection_name: string;
  category_id: string | null;
  category_name: string;
  mode: "world";
  question_count: number;
  current_position: number;
  is_premium: boolean;
  started_at: string;
  answered_steps: Array<{
    position: number;
    is_correct: boolean;
  }>;
  questions: DailyChallengeQuestionRpcRow[];
};

type DailyAnswerResultRpcRow = {
  position: number;
  selected_code: string;
  selected_label: string;
  correct_code: string;
  correct_label: string;
  is_correct: boolean;
  completed: boolean;
  current_position: number;
  correct_answers: number;
  total_questions: number;
  duration_ms: number | null;
  xp_delta: number;
  xp_total: number | string | null;
  xp_awarded: boolean;
};

function mapDailyChallenge(row: DailyChallengeRpcRow): DailyChallenge {
  return {
    status: row.status,
    challengeId: row.challenge_id,
    challengeKey: row.challenge_key,
    collectionId: row.collection_id,
    collectionName: row.collection_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    mode: row.mode,
    questionCount: row.question_count,
    secondsUntilReset: row.seconds_until_reset,
    attemptStatus: row.attempt_status,
  };
}

function mapDailyAttempt(row: DailyAttemptRpcRow): DailyAttempt {
  return {
    attemptId: row.attempt_id,
    challengeId: row.challenge_id,
    challengeKey: row.challenge_key,
    collectionId: row.collection_id,
    collectionName: row.collection_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    mode: row.mode,
    questionCount: row.question_count,
    currentPosition: row.current_position,
    isPremium: row.is_premium,
    startedAt: row.started_at,
    answeredSteps: row.answered_steps.map((step) => ({
      position: step.position,
      isCorrect: step.is_correct,
    })),
    questions: row.questions.map((question) => ({
      position: question.position,
      clueId: question.clue_id,
      imageUrl: question.image_storage_path,
      imageAlt: question.image_alt,
      difficulty: question.difficulty,
      categoryName: question.category_name,
      categoryIcon: question.category_icon,
    })),
  };
}

function mapDailyAnswerResult(row: DailyAnswerResultRpcRow): DailyAnswerResult {
  return {
    position: row.position,
    selectedCode: row.selected_code,
    selectedLabel: row.selected_label,
    correctCode: row.correct_code,
    correctLabel: row.correct_label,
    isCorrect: row.is_correct,
    completed: row.completed,
    currentPosition: row.current_position,
    correctAnswers: row.correct_answers,
    totalQuestions: row.total_questions,
    durationMs: row.duration_ms,
    xpDelta: row.xp_delta,
    xpTotal: row.xp_total === null ? null : Number(row.xp_total),
    xpAwarded: row.xp_awarded,
  };
}

type DailyErrorCode =
  | "already_completed"
  | "previous_attempt_in_progress"
  | "unavailable";

function mapDailyBusinessError(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code ?? "")
      : "";
  const rawMessage =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "")
      : "";
  const message = rawMessage.toLowerCase();
  const normalizedMessage = rawMessage.trim();
  const details =
    error && typeof error === "object" && "details" in error
      ? String((error as { details?: string }).details ?? "").toLowerCase()
      : "";
  const hint =
    error && typeof error === "object" && "hint" in error
      ? String((error as { hint?: string }).hint ?? "").toLowerCase()
      : "";

  if (
    code === "daily_attempt_already_completed" ||
    normalizedMessage === "daily_attempt_already_completed"
  ) {
    return "already_completed" satisfies DailyErrorCode;
  }

  if (
    code === "daily_previous_attempt_in_progress" ||
    normalizedMessage === "daily_previous_attempt_in_progress"
  ) {
    return "previous_attempt_in_progress" satisfies DailyErrorCode;
  }

  if (
    code === "daily_challenge_unavailable" ||
    normalizedMessage === "daily_challenge_unavailable"
  ) {
    return "unavailable" satisfies DailyErrorCode;
  }

  if (
    code === "PGRST202" ||
    code === "42883" ||
    message.includes("get_or_create_daily_challenge") ||
    details.includes("get_or_create_daily_challenge") ||
    hint.includes("get_or_create_daily_challenge") ||
    message.includes("schema cache") ||
    details.includes("schema cache") ||
    message.includes("function") && message.includes("does not exist")
  ) {
    return "unavailable" satisfies DailyErrorCode;
  }

  return null;
}

function withMappedDailyError<T>(operation: () => Promise<T>) {
  return operation().catch((error: unknown) => {
    const mappedCode = mapDailyBusinessError(error);
    if (!mappedCode) {
      throw error;
    }
    throw Object.assign(new Error(String((error as Error).message ?? mappedCode)), {
      code: mappedCode,
      cause: error,
    });
  });
}

export function createTrainingApi(client: TrainingDataClient) {
  return {
    async loadPlayableClues(collectionId: string): Promise<TrainingClue[]> {
      const rows = await client.listPublishedClues(collectionId);
      const paths = rows.flatMap((row) =>
        row.clue_images.map((image) => image.storage_path),
      );
      const signedUrls = await client.createSignedImageUrls(paths);
      const clues: TrainingClue[] = [];
      for (const row of rows) {
        const primaryImage = [...row.clue_images].sort(
          (left, right) => left.sort_order - right.sort_order,
        )[0];
        const resolvedPrimaryImageUrl = primaryImage
          ? signedUrls[primaryImage.storage_path]
          : undefined;
        const imageUrl = resolvedPrimaryImageUrl ?? resolveFallbackImageUrl(row);
        if (!imageUrl) {
          continue;
        }
        clues.push({
          id: row.id,
          countryCode: row.country_code,
          countryName: row.countries?.name ?? row.country_code,
          categoryId: row.category_id,
          categoryName: row.categories?.name ?? row.category_id,
          categoryIcon: row.categories?.icon ?? null,
          difficulty: row.difficulty,
          imageUrl,
          imageAlt:
            primaryImage?.alt_text ?? row.countries?.name ?? row.country_code,
          coverage: row.coverage,
          regionIds: row.clue_regions.map((item) => item.region_id),
          regionNames: row.clue_regions
            .map((item) => item.regions?.name ?? "")
            .filter(Boolean),
          zoneGeoJson:
            row.coverage === "drawn_zone"
              ? readClueZoneGeoJson(row.clue_zones)
              : null,
        });
      }
      return clues;
    },

    async createSession(input: CreateTrainingSessionInput) {
      return client.startSession(input);
    },

    async recordAnswer(input: RecordTrainingAnswerInput) {
      await client.insertAnswer(input);
    },

    async completeSession(sessionId: string) {
      const session = await client.completeSession(sessionId);
      return {
        ...session,
        xpDelta: Number(session.xp_delta ?? 0),
        xpTotal: Number(session.xp_total ?? 0),
        xpAwarded: Boolean(session.xp_awarded),
      } satisfies CompletedTrainingSessionRow;
    },

    async loadDailyChallengeProgress(collectionId: string, challengeKey: string) {
      return client.getDailyChallengeProgress(collectionId, challengeKey);
    },

    async loadDailyChallenge() {
      try {
        return await client.loadDailyChallenge();
      } catch (error) {
        if (mapDailyBusinessError(error) === "unavailable") {
          return null;
        }
        throw error;
      }
    },

    async startDailyAttempt() {
      return withMappedDailyError(() => client.startDailyAttempt());
    },

    async submitDailyAnswer(input: DailyAnswerInput) {
      return withMappedDailyError(() => client.submitDailyAnswer(input));
    },
  };
}

function throwIfError(
  error: { message: string; code?: string } | null,
  fallbackCode: string,
) {
  if (error) {
    throw Object.assign(new Error(error.message), {
      code: error.code ?? fallbackCode,
    });
  }
}

export function createSupabaseTrainingDataClient(
  supabase: SupabaseClient<Database>,
): TrainingDataClient {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

  async function createSignedImageUrls(paths: string[]) {
    if (paths.length === 0) return {};
    const { data, error } = await supabase.storage
      .from("clue-images")
      .createSignedUrls(paths, 60 * 60);
    if (error) {
      if (isSignedUrlAccessError(error)) {
        console.warn(
          "[trainingApi] Signed image URLs unavailable for current user, using fallbacks instead.",
          error.message,
        );
        return {};
      }
      throwIfError(error, "training_clue_images_sign_failed");
    }
    if (!data) {
      return {};
    }
    return Object.fromEntries(
      data
        .map((item, index) => [paths[index], item.signedUrl] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    );
  }

  return {
    async listPublishedClues(collectionId) {
      const { data, error } = await supabase
        .from("clues")
        .select(
          "id, category_id, country_code, title, coverage, difficulty, source_name, source_url, categories(name, icon), countries(name), clue_images(storage_path, alt_text, sort_order), clue_regions(region_id, regions(name)), clue_zones(geojson)",
        )
        .eq("collection_id", collectionId)
        .eq("status", "published")
        .order("created_at", { ascending: false });
      throwIfError(error, "training_clues_load_failed");
      return data as unknown as PublishedTrainingClueRow[];
    },

    async createSignedImageUrls(paths) {
      return createSignedImageUrls(paths);
    },

    async startSession(input) {
      const { data, error } = await rpc("start_training_session", {
        p_collection_id: input.collectionId,
        p_category_id: input.categoryId ?? null,
        p_mode: input.mode,
        p_country_code: input.countryCode ?? null,
        p_total_questions: input.totalQuestions,
        p_challenge_type: input.challengeType ?? "standard",
        p_challenge_key: input.challengeKey ?? null,
      });
      throwIfError(error, "training_session_create_failed");
      const session = Array.isArray(data) ? data[0] : data;
      if (!session) {
        throw new Error("La session d'entraînement n'a pas été retournée.");
      }
      return session as TrainingSessionCompletionRpcRow;
    },

    async insertAnswer(input) {
      const { error } = await supabase.from("training_answers").insert({
        session_id: input.sessionId,
        clue_id: input.clueId,
        selected_code: input.selectedCode,
        correct_code: input.correctCode,
        is_correct: input.isCorrect,
      });
      throwIfError(error, "training_answer_create_failed");
    },

    async completeSession(sessionId) {
      const { data, error } = await rpc("complete_training_session", {
        p_session_id: sessionId,
      });
      throwIfError(error, "training_session_update_failed");
      const session = Array.isArray(data) ? data[0] : data;
      if (!session) {
        throw new Error("La session d'entraînement terminée n'a pas été retournée.");
      }
      return session as TrainingSessionCompletionRpcRow;
    },

    async getDailyChallengeProgress(collectionId, challengeKey) {
      const { data, error } = await rpc(
        "get_my_daily_challenge_progress",
        {
          p_collection_id: collectionId,
          p_challenge_key: challengeKey,
        },
      );
      throwIfError(error, "training_daily_progress_load_failed");
      const row = Array.isArray(data) ? data[0] : data;
      return {
        completedSessions: row?.completed_sessions ?? 0,
        bestAccuracyPercent: row?.best_accuracy_percent ?? null,
        bestDurationMs: row?.best_duration_ms ?? null,
        latestCompletedAt: row?.latest_completed_at ?? null,
      };
    },

    async loadDailyChallenge() {
      const { data, error } = await rpc("get_or_create_daily_challenge");
      throwIfError(error, "training_daily_challenge_load_failed");
      const row = Array.isArray(data) ? data[0] : data;
      return row ? mapDailyChallenge(row as DailyChallengeRpcRow) : null;
    },

    async startDailyAttempt() {
      const { data, error } = await rpc("start_daily_challenge_attempt");
      throwIfError(error, "training_daily_attempt_start_failed");
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        throw new Error("Le défi quotidien n'a pas retourné de tentative.");
      }
      const attempt = mapDailyAttempt(row as DailyAttemptRpcRow);
      const signedUrls = await createSignedImageUrls(
        attempt.questions.map((question) => question.imageUrl),
      );
      return {
        ...attempt,
        questions: attempt.questions.map((question) => ({
          ...question,
          imageUrl: signedUrls[question.imageUrl] ?? question.imageUrl,
        })),
      };
    },

    async submitDailyAnswer(input) {
      const { data, error } = await rpc("submit_daily_challenge_answer", {
        p_attempt_id: input.attemptId,
        p_position: input.position,
        p_selected_code: input.selectedCode,
      });
      throwIfError(error, "training_daily_answer_submit_failed");
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        throw new Error("La réponse du défi quotidien n'a pas été retournée.");
      }
      return mapDailyAnswerResult(row as DailyAnswerResultRpcRow);
    },
  };
}

let defaultApi: ReturnType<typeof createTrainingApi> | undefined;

export function getTrainingApi() {
  defaultApi ??= createTrainingApi(
    createSupabaseTrainingDataClient(getSupabaseClient()),
  );
  return defaultApi;
}

export type TrainingApi = ReturnType<typeof createTrainingApi>;
