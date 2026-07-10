export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type CollectionRole = "owner" | "editor";
type CollectionVisibility = "private" | "public_readonly";
type PlatformRole = "admin" | "super_admin";
type BillingPlanKey = "free" | "premium_monthly" | "premium_yearly";
type BillingSubscriptionStatus =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid";
type BillingFeatureSource = "manual" | "promo" | "admin";
type CoverageMode = "whole_country" | "selected_regions" | "drawn_zone";
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
          email: string | null;
          username_changed_at: string | null;
          leaderboard_visible: boolean;
          xp_total: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          avatar_url?: string | null;
          email?: string | null;
          username_changed_at?: string | null;
          leaderboard_visible?: boolean;
          xp_total?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_url?: string | null;
          email?: string | null;
          username_changed_at?: string | null;
          leaderboard_visible?: boolean;
          xp_total?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedSchema: "auth";
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          user_id: string;
          role: PlatformRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          role: PlatformRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          role?: PlatformRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_customers: {
        Row: {
          user_id: string;
          stripe_customer_id: string | null;
          checkout_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          stripe_customer_id?: string | null;
          checkout_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          stripe_customer_id?: string | null;
          checkout_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_customers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_price_id: string | null;
          plan_key: BillingPlanKey;
          status: BillingSubscriptionStatus;
          cancel_at_period_end: boolean;
          current_period_start: string | null;
          current_period_end: string | null;
          trial_end: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_price_id?: string | null;
          plan_key?: BillingPlanKey;
          status?: BillingSubscriptionStatus;
          cancel_at_period_end?: boolean;
          current_period_start?: string | null;
          current_period_end?: string | null;
          trial_end?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_price_id?: string | null;
          plan_key?: BillingPlanKey;
          status?: BillingSubscriptionStatus;
          cancel_at_period_end?: boolean;
          current_period_start?: string | null;
          current_period_end?: string | null;
          trial_end?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_feature_entitlements: {
        Row: {
          id: string;
          user_id: string;
          feature_key: string;
          source: BillingFeatureSource;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          feature_key: string;
          source: BillingFeatureSource;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          feature_key?: string;
          source?: BillingFeatureSource;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_feature_entitlements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      collections: {
        Row: {
          id: string;
          owner_id: string | null;
          name: string;
          description: string | null;
          is_official: boolean;
          visibility: CollectionVisibility;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          name: string;
          description?: string | null;
          is_official?: boolean;
          visibility?: CollectionVisibility;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string | null;
          name?: string;
          description?: string | null;
          is_official?: boolean;
          visibility?: CollectionVisibility;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collections_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "collection_members_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collection_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "collection_invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collection_invitations_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collection_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "categories_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "regions_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
        ];
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
          google_maps_url: string | null;
          source_name: string | null;
          source_url: string | null;
          license_name: string | null;
          license_url: string | null;
          attribution_text: string | null;
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
          google_maps_url?: string | null;
          source_name?: string | null;
          source_url?: string | null;
          license_name?: string | null;
          license_url?: string | null;
          attribution_text?: string | null;
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
          google_maps_url?: string | null;
          source_name?: string | null;
          source_url?: string | null;
          license_name?: string | null;
          license_url?: string | null;
          attribution_text?: string | null;
          author_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clues_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clues_category_same_collection";
            columns: ["category_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "collection_id"];
          },
          {
            foreignKeyName: "clues_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clues_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
        ];
      };
      clue_regions: {
        Row: { clue_id: string; region_id: string; created_at: string };
        Insert: { clue_id: string; region_id: string; created_at?: string };
        Update: { clue_id?: string; region_id?: string; created_at?: string };
        Relationships: [
          {
            foreignKeyName: "clue_regions_clue_id_fkey";
            columns: ["clue_id"];
            isOneToOne: false;
            referencedRelation: "clues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clue_regions_region_id_fkey";
            columns: ["region_id"];
            isOneToOne: false;
            referencedRelation: "regions";
            referencedColumns: ["id"];
          },
        ];
      };
      clue_zones: {
        Row: {
          clue_id: string;
          geojson: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          clue_id: string;
          geojson: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          clue_id?: string;
          geojson?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clue_zones_clue_id_fkey";
            columns: ["clue_id"];
            isOneToOne: true;
            referencedRelation: "clues";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "clue_images_clue_id_fkey";
            columns: ["clue_id"];
            isOneToOne: false;
            referencedRelation: "clues";
            referencedColumns: ["id"];
          },
        ];
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
          is_ranked: boolean;
          challenge_type: string;
          challenge_key: string | null;
          duration_ms: number | null;
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
          is_ranked?: boolean;
          challenge_type?: string;
          challenge_key?: string | null;
          duration_ms?: number | null;
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
          is_ranked?: boolean;
          challenge_type?: string;
          challenge_key?: string | null;
          duration_ms?: number | null;
          correct_answers?: number;
          total_answers?: number;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_sessions_category_same_collection";
            columns: ["category_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "collection_id"];
          },
          {
            foreignKeyName: "training_sessions_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_sessions_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "training_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "training_answers_clue_id_fkey";
            columns: ["clue_id"];
            isOneToOne: false;
            referencedRelation: "clues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_answers_session_owner";
            columns: ["session_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "training_sessions";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "training_answers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      xp_events: {
        Row: {
          id: string;
          user_id: string;
          training_session_id: string;
          total_delta: number;
          correct_count: number;
          wrong_count: number;
          before_xp: string;
          after_xp: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          training_session_id: string;
          total_delta: number;
          correct_count?: number;
          wrong_count?: number;
          before_xp: string;
          after_xp: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          training_session_id?: string;
          total_delta?: number;
          correct_count?: number;
          wrong_count?: number;
          before_xp?: string;
          after_xp?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xp_events_training_session_id_fkey";
            columns: ["training_session_id"];
            isOneToOne: true;
            referencedRelation: "training_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xp_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_collection: {
        Args: {
          collection_name: string;
          collection_description?: string | null;
        };
        Returns: {
          id: string;
          owner_id: string | null;
          name: string;
          description: string | null;
          visibility: CollectionVisibility;
          created_at: string;
          updated_at: string;
        };
      };
      can_read_collection: {
        Args: { target_collection_id: string };
        Returns: boolean;
      };
      can_read_collection_clue: {
        Args: { target_collection_id: string; target_status: ClueStatus };
        Returns: boolean;
      };
      compute_ranked_answer_xp: {
        Args: { p_difficulty: ClueDifficulty; p_is_correct: boolean };
        Returns: number;
      };
      is_platform_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_super_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      manage_platform_role: {
        Args: {
          target_user_id: string;
          target_role?: PlatformRole | null;
        };
        Returns: boolean;
      };
      has_premium_access: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      get_my_billing_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          plan_key: BillingPlanKey;
          status: BillingSubscriptionStatus;
          cancel_at_period_end: boolean;
          current_period_end: string | null;
          premium_enabled: boolean;
        }[];
      };
      is_collection_public: {
        Args: { target_collection_id: string };
        Returns: boolean;
      };
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
      accept_collection_invitation: {
        Args: { raw_token: string };
        Returns: {
          collection_id: string;
          collection_name: string;
        }[];
      };
      start_training_session: {
        Args: {
          p_collection_id: string;
          p_category_id: string | null;
          p_mode: TrainingMode;
          p_country_code: string | null;
          p_total_questions: number;
          p_challenge_type?: string;
          p_challenge_key?: string | null;
        };
        Returns: Database["public"]["Tables"]["training_sessions"]["Row"][];
      };
      complete_training_session: {
        Args: { p_session_id: string };
        Returns: {
          id: string;
          user_id: string;
          collection_id: string;
          mode: TrainingMode;
          country_code: string | null;
          category_id: string | null;
          total_questions: number;
          is_ranked: boolean;
          challenge_type: string;
          challenge_key: string | null;
          duration_ms: number | null;
          correct_answers: number;
          total_answers: number;
          started_at: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
          xp_delta: number;
          xp_total: string;
          xp_awarded: boolean;
        }[];
      };
      get_my_daily_challenge_progress: {
        Args: { p_collection_id: string; p_challenge_key: string };
        Returns: {
          completed_sessions: number;
          best_accuracy_percent: number | null;
          best_duration_ms: number | null;
          latest_completed_at: string | null;
        }[];
      };
      get_or_create_daily_challenge: {
        Args: Record<PropertyKey, never>;
        Returns: {
          status: string;
          challenge_id: string;
          challenge_key: string;
          collection_id: string;
          collection_name: string;
          category_id: string | null;
          category_name: string;
          mode: string;
          question_count: number;
          seconds_until_reset: number;
          attempt_status: string;
        }[];
      };
      start_daily_challenge_attempt: {
        Args: Record<PropertyKey, never>;
        Returns: {
          attempt_id: string;
          challenge_id: string;
          challenge_key: string;
          collection_id: string;
          collection_name: string;
          category_id: string | null;
          category_name: string;
          mode: string;
          question_count: number;
          current_position: number;
          is_premium: boolean;
          started_at: string;
          answered_steps: {
            position: number;
            is_correct: boolean;
          }[];
          questions: {
            position: number;
            clue_id: string;
            image_storage_path: string;
            image_alt: string;
            difficulty: ClueDifficulty;
            category_name: string;
            category_icon: string | null;
          }[];
        }[];
      };
      submit_daily_challenge_answer: {
        Args: {
          p_attempt_id: string;
          p_position: number;
          p_selected_code: string;
        };
        Returns: {
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
          xp_total: string | null;
          xp_awarded: boolean;
        }[];
      };
      get_daily_challenge_leaderboard: {
        Args: {
          p_challenge_key: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          user_id: string;
          username: string;
          avatar_url: string | null;
          rank: number;
          correct_answers: number;
          accuracy_percent: number;
          duration_ms: number;
          daily_points: number;
          completed_at: string;
          xp_total: string;
          total_count: number;
        }[];
      };
      get_global_daily_leaderboard: {
        Args: { p_limit?: number; p_offset?: number };
        Returns: {
          user_id: string;
          username: string;
          avatar_url: string | null;
          rank: number;
          total_points: string;
          participation_count: number;
          correct_answers: string;
          total_answers: string;
          accuracy_percent: number;
          total_duration_ms: string;
          xp_total: string;
          total_count: number;
        }[];
      };
      get_my_daily_challenge_leaderboard_progress: {
        Args: { p_challenge_key: string };
        Returns: {
          rank: number | null;
          correct_answers: number | null;
          accuracy_percent: number | null;
          duration_ms: number | null;
          daily_points: number | null;
          visible: boolean;
        }[];
      };
      get_my_global_daily_leaderboard_progress: {
        Args: Record<PropertyKey, never>;
        Returns: {
          rank: number | null;
          total_points: string;
          participation_count: number;
          correct_answers: string;
          total_answers: string;
          accuracy_percent: number | null;
          total_duration_ms: string;
          visible: boolean;
        }[];
      };
      list_official_leaderboard_categories: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          name: string;
          icon: string | null;
          collection_id: string;
          collection_name: string;
        }[];
      };
      get_category_leaderboard: {
        Args: { p_category_id: string; p_limit?: number; p_offset?: number };
        Returns: {
          user_id: string;
          username: string;
          avatar_url: string | null;
          rank: number;
          accuracy_percent: number;
          average_ms_per_answer: number;
          quiz_count: number;
          xp_total: string;
          total_count: number;
        }[];
      };
      get_my_category_progress: {
        Args: { p_category_id: string };
        Returns: {
          rank: number | null;
          accuracy_percent: number | null;
          average_ms_per_answer: number | null;
          quiz_count: number;
          remaining_quizzes: number;
          visible: boolean;
        }[];
      };
    };
    Enums: {
      billing_plan_key: BillingPlanKey;
      billing_subscription_status: BillingSubscriptionStatus;
      billing_feature_source: BillingFeatureSource;
      platform_role: PlatformRole;
      collection_visibility: CollectionVisibility;
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
