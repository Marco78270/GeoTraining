import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";
import type { TrainingClue } from "./trainingSession";

type Difficulty = TrainingClue["difficulty"];

type PublishedTrainingClueRow = {
  id: string;
  category_id: string;
  country_code: string;
  difficulty: Difficulty;
  categories: { name: string } | null;
  countries: { name: string } | null;
  clue_images: Array<{
    storage_path: string;
    alt_text: string | null;
    sort_order: number;
  }>;
};

export type TrainingSessionRow =
  Database["public"]["Tables"]["training_sessions"]["Row"];

export type CreateTrainingSessionInput = {
  collectionId: string;
  categoryId?: string | null;
  totalQuestions: number;
};

export type RecordTrainingAnswerInput = {
  sessionId: string;
  clueId: string;
  selectedCode: string;
  correctCode: string;
  isCorrect: boolean;
};

export type CompleteTrainingSessionInput = {
  totalAnswers: number;
  correctAnswers: number;
};

export type TrainingDataClient = {
  listPublishedClues(collectionId: string): Promise<PublishedTrainingClueRow[]>;
  createSignedImageUrls(paths: string[]): Promise<Record<string, string>>;
  insertSession(input: CreateTrainingSessionInput): Promise<TrainingSessionRow>;
  insertAnswer(input: RecordTrainingAnswerInput): Promise<void>;
  updateSession(
    sessionId: string,
    input: Database["public"]["Tables"]["training_sessions"]["Update"],
  ): Promise<void>;
};

function buildOfficialFlagFallbackUrl(countryCode: string) {
  return `https://flagcdn.com/w320/${countryCode.toLowerCase()}.png`;
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
        const imageUrl = primaryImage
          ? (signedUrls[primaryImage.storage_path] ??
            buildOfficialFlagFallbackUrl(row.country_code))
          : buildOfficialFlagFallbackUrl(row.country_code);
        clues.push({
          id: row.id,
          countryCode: row.country_code,
          countryName: row.countries?.name ?? row.country_code,
          categoryId: row.category_id,
          categoryName: row.categories?.name ?? row.category_id,
          difficulty: row.difficulty,
          imageUrl,
          imageAlt:
            primaryImage?.alt_text ?? row.countries?.name ?? row.country_code,
        });
      }
      return clues;
    },

    async createSession(input: CreateTrainingSessionInput) {
      return client.insertSession(input);
    },

    async recordAnswer(input: RecordTrainingAnswerInput) {
      await client.insertAnswer(input);
    },

    async completeSession(
      sessionId: string,
      input: CompleteTrainingSessionInput,
    ) {
      await client.updateSession(sessionId, {
        total_answers: input.totalAnswers,
        correct_answers: input.correctAnswers,
        completed_at: new Date().toISOString(),
      });
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
  return {
    async listPublishedClues(collectionId) {
      const { data, error } = await supabase
        .from("clues")
        .select(
          "id, category_id, country_code, difficulty, categories(name), countries(name), clue_images(storage_path, alt_text, sort_order)",
        )
        .eq("collection_id", collectionId)
        .eq("status", "published")
        .order("created_at", { ascending: false });
      throwIfError(error, "training_clues_load_failed");
      return data as unknown as PublishedTrainingClueRow[];
    },

    async createSignedImageUrls(paths) {
      if (paths.length === 0) return {};
      const { data, error } = await supabase.storage
        .from("clue-images")
        .createSignedUrls(paths, 60 * 60);
      throwIfError(error, "training_clue_images_sign_failed");
      if (!data) {
        return {};
      }
      return Object.fromEntries(
        data
          .map((item, index) => [paths[index], item.signedUrl] as const)
          .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
      );
    },

    async insertSession(input) {
      const { data, error } = await supabase
        .from("training_sessions")
        .insert({
          collection_id: input.collectionId,
          mode: "world",
          category_id: input.categoryId ?? null,
          total_questions: input.totalQuestions,
        })
        .select()
        .single();
      throwIfError(error, "training_session_create_failed");
      if (!data) {
        throw new Error("La session d'entraînement n'a pas été retournée.");
      }
      return data;
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

    async updateSession(sessionId, input) {
      const { error } = await supabase
        .from("training_sessions")
        .update(input)
        .eq("id", sessionId);
      throwIfError(error, "training_session_update_failed");
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
