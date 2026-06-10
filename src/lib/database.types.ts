export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type CollectionRole = "owner" | "editor";
type CoverageMode = "whole_country" | "selected_regions";
type ClueDifficulty = "easy" | "medium" | "expert";
type InvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "revoked";
type TrainingMode = "world" | "country";
type ClueStatus = "draft" | "published";

// Regenerate with: npx supabase gen types typescript --local > src/lib/database.types.ts
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      collections: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      collection_members: {
        Row: {
          collection_id: string;
          user_id: string;
          role: CollectionRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          collection_id: string;
          user_id: string;
          role?: CollectionRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          collection_id?: string;
          user_id?: string;
          role?: CollectionRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      collection_invitations: {
        Row: {
          id: string;
          collection_id: string;
          email: string;
          role: CollectionRole;
          status: InvitationStatus;
          token_hash: string;
          invited_by: string;
          expires_at: string;
          accepted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          collection_id: string;
          email: string;
          role?: CollectionRole;
          status?: InvitationStatus;
          token_hash: string;
          invited_by: string;
          expires_at?: string;
          accepted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          collection_id?: string;
          email?: string;
          role?: CollectionRole;
          status?: InvitationStatus;
          token_hash?: string;
          invited_by?: string;
          expires_at?: string;
          accepted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          collection_id: string;
          name: string;
          icon: string | null;
          color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          collection_id: string;
          name: string;
          icon?: string | null;
          color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          collection_id?: string;
          name?: string;
          icon?: string | null;
          color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      countries: {
        Row: {
          code: string;
          name: string;
          geojson_path: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          name: string;
          geojson_path: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          name?: string;
          geojson_path?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      regions: {
        Row: {
          id: string;
          country_code: string;
          name: string;
          geojson_path: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          country_code: string;
          name: string;
          geojson_path: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          country_code?: string;
          name?: string;
          geojson_path?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clues: {
        Row: {
          id: string;
          collection_id: string;
          category_id: string;
          country_code: string;
          coverage: CoverageMode;
          difficulty: ClueDifficulty;
          status: ClueStatus;
          title: string;
          characteristics: string[];
          notes: string | null;
          author_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          collection_id: string;
          category_id: string;
          country_code: string;
          coverage?: CoverageMode;
          difficulty?: ClueDifficulty;
          status?: ClueStatus;
          title: string;
          characteristics?: string[];
          notes?: string | null;
          author_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          collection_id?: string;
          category_id?: string;
          country_code?: string;
          coverage?: CoverageMode;
          difficulty?: ClueDifficulty;
          status?: ClueStatus;
          title?: string;
          characteristics?: string[];
          notes?: string | null;
          author_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clue_regions: {
        Row: { clue_id: string; region_id: string; created_at: string };
        Insert: { clue_id: string; region_id: string; created_at?: string };
        Update: { clue_id?: string; region_id?: string; created_at?: string };
        Relationships: [];
      };
      clue_images: {
        Row: {
          id: string;
          clue_id: string;
          storage_path: string;
          alt_text: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clue_id: string;
          storage_path: string;
          alt_text?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clue_id?: string;
          storage_path?: string;
          alt_text?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      training_sessions: {
        Row: {
          id: string;
          user_id: string;
          collection_id: string;
          mode: TrainingMode;
          country_code: string | null;
          category_id: string | null;
          total_questions: number;
          correct_answers: number;
          total_answers: number;
          started_at: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          collection_id: string;
          mode: TrainingMode;
          country_code?: string | null;
          category_id?: string | null;
          total_questions: number;
          correct_answers?: number;
          total_answers?: number;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          collection_id?: string;
          mode?: TrainingMode;
          country_code?: string | null;
          category_id?: string | null;
          total_questions?: number;
          correct_answers?: number;
          total_answers?: number;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      training_answers: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          clue_id: string;
          selected_code: string;
          correct_code: string;
          is_correct: boolean;
          answered_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id?: string;
          clue_id: string;
          selected_code: string;
          correct_code: string;
          is_correct: boolean;
          answered_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_id?: string;
          clue_id?: string;
          selected_code?: string;
          correct_code?: string;
          is_correct?: boolean;
          answered_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_collection_member: {
        Args: { target_collection_id: string };
        Returns: boolean;
      };
      is_collection_owner: {
        Args: { target_collection_id: string };
        Returns: boolean;
      };
      shares_collection_with: {
        Args: { target_user_id: string };
        Returns: boolean;
      };
      can_access_clue_image_object: {
        Args: { candidate_path: string };
        Returns: boolean;
      };
      can_manage_clue_image_object: {
        Args: { candidate_path: string };
        Returns: boolean;
      };
      is_valid_clue_image_path: {
        Args: {
          candidate_path: string;
          expected_collection_id: string;
          expected_clue_id: string;
          expected_image_id: string;
        };
        Returns: boolean;
      };
      has_stored_clue_image: {
        Args: { target_clue_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      collection_role: CollectionRole;
      coverage_mode: CoverageMode;
      clue_difficulty: ClueDifficulty;
      invitation_status: InvitationStatus;
      training_mode: TrainingMode;
      clue_status: ClueStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
