export type DifficultyRating =
  | "Muito fácil"
  | "Fácil"
  | "Médio"
  | "Difícil"
  | "Muito difícil";

export type CalendarSyncStatus = "pending" | "synced" | "failed" | "disabled";
export type MajorArea =
  | "Clínica Médica"
  | "Cirurgia"
  | "Ginecologia e Obstetrícia"
  | "Pediatria"
  | "Preventiva"
  | "A classificar";
export type Importance = "alta" | "media" | "baixa";
export type PerformanceBand = "muito_bom" | "bom" | "ruim" | "muito_ruim";
export type CalculationMode = "performance" | "small_sample";
export type CourseCatalogSource = "metamed" | "upload";
export type PlanningSource = "automatic" | "manual";
export type CatalogReleaseStatus = "draft" | "validated" | "active" | "retired";
export type RelevanceValidationState = "draft" | "validated" | "rejected";
export type RelevanceEngineMode = "shadow";
export type RelevanceFormulaConfig = {
  minimumScore: number;
  maximumScore: number;
  minimumFactor: number;
  maximumFactor: number;
};
/** ISO weekday keys (1..7); persisted values are validated by the database. */
export type DailyCapacities = Record<string, number>;

export type Database = {
  public: {
    Tables: {
      student_profiles: {
        Row: {
          user_id: string;
          exam_date: string | null;
          preferred_name: string | null;
          study_days: number[];
          daily_theme_capacity: number;
          daily_capacities?: DailyCapacities | null;
          week_starts_on?: number;
          timezone?: string;
          preparation_start_date: string;
          preparation_horizon_months: number;
          weekly_review_capacity: number;
          course_theme_total: number | null;
          course_catalog_source: CourseCatalogSource;
          course_catalog_filename: string | null;
          calendar_sync_enabled: boolean;
          birth_date: string | null;
          exam_interests: string[];
          city: string | null;
          study_experience_years: number | null;
          phone_number: string | null;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          exam_date?: string | null;
          preferred_name?: string | null;
          study_days?: number[];
          daily_theme_capacity?: number;
          daily_capacities?: DailyCapacities | null;
          week_starts_on?: number;
          timezone?: string;
          preparation_start_date?: string;
          preparation_horizon_months?: number;
          weekly_review_capacity?: number;
          course_theme_total?: number | null;
          course_catalog_source?: CourseCatalogSource;
          course_catalog_filename?: string | null;
          calendar_sync_enabled?: boolean;
          birth_date?: string | null;
          exam_interests?: string[];
          city?: string | null;
          study_experience_years?: number | null;
          phone_number?: string | null;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["student_profiles"]["Row"]>;
        Relationships: [];
      };
      course_topics: {
        Row: {
          id: string;
          user_id: string;
          source: "upload";
          source_filename: string | null;
          source_order: number;
          original_area: string | null;
          major_area: MajorArea;
          specialty: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source?: "upload";
          source_filename?: string | null;
          source_order?: number;
          original_area?: string | null;
          major_area?: MajorArea;
          specialty?: string;
          title: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["course_topics"]["Row"]>;
        Relationships: [];
      };
      metamed_topics: {
        Row: {
          id: string;
          source_order: number;
          pdf_page: number | null;
          original_area: string;
          major_area: MajorArea;
          specialty: string;
          title: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_order: number;
          pdf_page?: number | null;
          original_area: string;
          major_area: MajorArea;
          specialty: string;
          title: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["metamed_topics"]["Row"]>;
        Relationships: [];
      };
      relevance_publications: {
        Row: {
          id: string;
          version_key: string;
          reference_year: number;
          validation_state: RelevanceValidationState;
          score_formula: string;
          rounding_mode: "half_up_1_decimal";
          source_filename: string;
          source_sha256: string;
          technical_document_filename: string;
          technical_document_sha256: string;
          importer_version: string;
          validation_report: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id: string;
          version_key: string;
          reference_year: number;
          validation_state: RelevanceValidationState;
          score_formula: string;
          rounding_mode: "half_up_1_decimal";
          source_filename: string;
          source_sha256: string;
          technical_document_filename: string;
          technical_document_sha256: string;
          importer_version: string;
          validation_report: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["relevance_publications"]["Row"]>;
        Relationships: [];
      };
      relevance_engine_activations: {
        Row: {
          exam_code: string;
          publication_id: string;
          mode: RelevanceEngineMode;
          formula_version: "global-linear-bounded-v1";
          formula_config: RelevanceFormulaConfig;
          activated_at: string;
        };
        Insert: {
          exam_code: string;
          publication_id: string;
          mode: RelevanceEngineMode;
          formula_version: "global-linear-bounded-v1";
          formula_config: RelevanceFormulaConfig;
          activated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["relevance_engine_activations"]["Row"]>;
        Relationships: [];
      };
      canonical_topics: {
        Row: {
          topic_id: string;
          first_publication_id: string;
          created_at: string;
        };
        Insert: {
          topic_id: string;
          first_publication_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["canonical_topics"]["Row"]>;
        Relationships: [];
      };
      canonical_topic_versions: {
        Row: {
          publication_id: string;
          topic_id: string;
          canonical_name: string;
          source_major_area: string;
          major_area: Exclude<MajorArea, "A classificar">;
          specialty: string;
          editorial_signal: string | null;
          confidence: "alta" | "média";
          rationale: string | null;
          reference_year: number;
        };
        Insert: Database["public"]["Tables"]["canonical_topic_versions"]["Row"];
        Update: Partial<Database["public"]["Tables"]["canonical_topic_versions"]["Row"]>;
        Relationships: [];
      };
      canonical_topic_aliases: {
        Row: {
          publication_id: string;
          topic_id: string;
          alias: string;
          normalized_alias: string;
        };
        Insert: Database["public"]["Tables"]["canonical_topic_aliases"]["Row"];
        Update: Partial<Database["public"]["Tables"]["canonical_topic_aliases"]["Row"]>;
        Relationships: [];
      };
      topic_relevance_scores: {
        Row: {
          publication_id: string;
          topic_id: string;
          exam_code: string;
          score: number;
          reference_year: number;
        };
        Insert: Database["public"]["Tables"]["topic_relevance_scores"]["Row"];
        Update: Partial<Database["public"]["Tables"]["topic_relevance_scores"]["Row"]>;
        Relationships: [];
      };
      course_catalog_releases: {
        Row: {
          id: string;
          publication_id: string;
          provider_code: string;
          provider_name: string;
          release_name: string;
          source_document: string;
          source_edition: string;
          source_volume: string;
          source_extracted_on: string | null;
          source_sha256: string;
          status: CatalogReleaseStatus;
          created_at: string;
        };
        Insert: {
          id: string;
          publication_id: string;
          provider_code: string;
          provider_name: string;
          release_name: string;
          source_document: string;
          source_edition: string;
          source_volume: string;
          source_extracted_on?: string | null;
          source_sha256: string;
          status: CatalogReleaseStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["course_catalog_releases"]["Row"]>;
        Relationships: [];
      };
      course_catalog_item_tombstones: {
        Row: {
          provider_code: string;
          external_id: string;
          publication_id: string;
          reason: string;
          created_at: string;
        };
        Insert: {
          provider_code: string;
          external_id: string;
          publication_id: string;
          reason: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["course_catalog_item_tombstones"]["Row"]>;
        Relationships: [];
      };
      course_catalog_items: {
        Row: {
          id: string;
          release_id: string;
          publication_id: string;
          external_id: string;
          catalog_area: string;
          title: string;
          source_order: number;
          major_area: Exclude<MajorArea, "A classificar">;
          major_area_derivation: "highest_weight_topic_experimental";
          specialty: string;
          specialty_derivation: "unanimous_canonical_specialty" | "integrated_content";
          effective_relevance: number;
          workload_weight: number;
          created_at: string;
        };
        Insert: {
          id: string;
          release_id: string;
          publication_id: string;
          external_id: string;
          catalog_area: string;
          title: string;
          source_order: number;
          major_area: Exclude<MajorArea, "A classificar">;
          major_area_derivation: "highest_weight_topic_experimental";
          specialty: string;
          specialty_derivation: "unanimous_canonical_specialty" | "integrated_content";
          effective_relevance: number;
          workload_weight: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["course_catalog_items"]["Row"]>;
        Relationships: [];
      };
      course_catalog_item_topics: {
        Row: {
          item_id: string;
          publication_id: string;
          topic_id: string;
          weight: number;
        };
        Insert: Database["public"]["Tables"]["course_catalog_item_topics"]["Row"];
        Update: Partial<Database["public"]["Tables"]["course_catalog_item_topics"]["Row"]>;
        Relationships: [];
      };
      weekly_plans: {
        Row: {
          user_id: string;
          week_start: string;
          capacity: number;
          study_days?: number[] | null;
          daily_capacities?: DailyCapacities | null;
          week_starts_on?: number;
          closed_at?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          week_start: string;
          capacity: number;
          study_days?: number[] | null;
          daily_capacities?: DailyCapacities | null;
          week_starts_on?: number;
          closed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["weekly_plans"]["Row"]>;
        Relationships: [];
      };
      weekly_plan_items: {
        Row: {
          id: string;
          user_id: string;
          block_id: string;
          revision_number: number;
          due_week_start: string;
          original_due_week_start: string;
          week_starts_on: number;
          planned_review_date: string | null;
          planning_source: PlanningSource | null;
          status: "open" | "completed";
          backlog_since: string | null;
          completed_at: string | null;
          completed_review_id: string | null;
          reschedule_history: Array<{ at: string; from: string | null; to: string | null; source: PlanningSource | null }>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          block_id: string;
          revision_number: number;
          due_week_start: string;
          original_due_week_start: string;
          week_starts_on: number;
          planned_review_date?: string | null;
          planning_source?: PlanningSource | null;
          status?: "open" | "completed";
          backlog_since?: string | null;
          completed_at?: string | null;
          completed_review_id?: string | null;
          reschedule_history?: Array<{ at: string; from: string | null; to: string | null; source: PlanningSource | null }>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["weekly_plan_items"]["Row"]>;
        Relationships: [];
      };
      exam_targets: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          exam_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          exam_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["exam_targets"]["Row"]>;
        Relationships: [];
      };
      areas: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["areas"]["Row"]>;
        Relationships: [];
      };
      question_blocks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          area_id: string | null;
          area_name: string;
          exam_target_id: string | null;
          source: string | null;
          question_count: number;
          correct_count: number;
          accuracy_percentage: number;
          perceived_difficulty: DifficultyRating;
          time_spent_minutes: number | null;
          priority_weight: number;
          study_date: string;
          repetitions: number;
          easiness_factor: number;
          interval_days: number;
          next_review_date: string;
          calendar_event_id: string | null;
          calendar_sync_enabled: boolean;
          calendar_sync_status: CalendarSyncStatus;
          calendar_last_error: string | null;
          calendar_last_synced_at: string | null;
          calendar_sync_fingerprint: string | null;
          major_area: MajorArea;
          specialty: string;
          importance: Importance;
          suggested_importance: Importance | null;
          last_review_date: string | null;
          planned_review_date: string | null;
          planning_source: PlanningSource | null;
          backlog_since: string | null;
          backlog_urgency: number | null;
          pre_exam_review_requested: boolean;
          performance_band: PerformanceBand | null;
          calculation_mode: CalculationMode;
          engine_version: string;
          catalog_item_id: string | null;
          relevance_version_id: string | null;
          relevance_score: number | null;
          relevance_factor: number | null;
          relevance_formula_version: "global-linear-bounded-v1" | null;
          relevance_formula_config: RelevanceFormulaConfig | null;
          relevance_shadow_interval_days: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          area_id?: string | null;
          area_name: string;
          exam_target_id?: string | null;
          source?: string | null;
          question_count: number;
          correct_count: number;
          accuracy_percentage: number;
          perceived_difficulty: DifficultyRating;
          time_spent_minutes?: number | null;
          priority_weight?: number;
          study_date?: string;
          repetitions?: number;
          easiness_factor?: number;
          interval_days?: number;
          next_review_date?: string;
          calendar_event_id?: string | null;
          calendar_sync_enabled?: boolean;
          calendar_sync_status?: CalendarSyncStatus;
          calendar_last_error?: string | null;
          calendar_last_synced_at?: string | null;
          calendar_sync_fingerprint?: string | null;
          major_area?: MajorArea;
          specialty?: string;
          importance?: Importance;
          suggested_importance?: Importance | null;
          last_review_date?: string | null;
          planned_review_date?: string | null;
          planning_source?: PlanningSource | null;
          backlog_since?: string | null;
          backlog_urgency?: number | null;
          pre_exam_review_requested?: boolean;
          performance_band?: PerformanceBand | null;
          calculation_mode?: CalculationMode;
          engine_version?: string;
          catalog_item_id?: string | null;
          relevance_version_id?: string | null;
          relevance_score?: number | null;
          relevance_factor?: number | null;
          relevance_formula_version?: "global-linear-bounded-v1" | null;
          relevance_formula_config?: RelevanceFormulaConfig | null;
          relevance_shadow_interval_days?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["question_blocks"]["Row"]>;
        Relationships: [];
      };
      block_reviews: {
        Row: {
          id: string;
          block_id: string;
          user_id: string;
          review_date: string;
          question_count: number;
          correct_count: number;
          accuracy_percentage: number;
          perceived_difficulty: DifficultyRating;
          time_spent_minutes: number | null;
          sm2_grade_calculated: number;
          previous_next_review_date: string | null;
          new_next_review_date: string;
          contact_type: "first_contact" | "review";
          operation_id?: string | null;
          engine_version: string;
          calculation_mode: CalculationMode | null;
          performance_band: PerformanceBand | null;
          importance: Importance | null;
          previous_interval_days: number | null;
          new_interval_days: number | null;
          priority_score: number | null;
          catalog_item_id: string | null;
          relevance_version_id: string | null;
          relevance_score: number | null;
          relevance_factor: number | null;
          relevance_formula_version: "global-linear-bounded-v1" | null;
          relevance_formula_config: RelevanceFormulaConfig | null;
          relevance_shadow_interval_days: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          block_id: string;
          user_id: string;
          review_date?: string;
          question_count: number;
          correct_count: number;
          accuracy_percentage: number;
          perceived_difficulty: DifficultyRating;
          time_spent_minutes?: number | null;
          sm2_grade_calculated: number;
          previous_next_review_date?: string | null;
          new_next_review_date: string;
          contact_type?: "first_contact" | "review";
          operation_id?: string | null;
          engine_version?: string;
          calculation_mode?: CalculationMode | null;
          performance_band?: PerformanceBand | null;
          importance?: Importance | null;
          previous_interval_days?: number | null;
          new_interval_days?: number | null;
          priority_score?: number | null;
          catalog_item_id?: string | null;
          relevance_version_id?: string | null;
          relevance_score?: number | null;
          relevance_factor?: number | null;
          relevance_formula_version?: "global-linear-bounded-v1" | null;
          relevance_formula_config?: RelevanceFormulaConfig | null;
          relevance_shadow_interval_days?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["block_reviews"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      prepare_weekly_plan: {
        Args: { p_reference_date: string };
        Returns: { week_start: string; week_starts_on: number; closed_weeks: number; items: WeeklyPlanItem[] };
      };
      save_weekly_availability: {
        Args: { p_week_start: string; p_study_days: number[]; p_daily_capacities: DailyCapacities | null };
        Returns: WeeklyPlan;
      };
      reset_weekly_availability: {
        Args: { p_week_start: string };
        Returns: WeeklyPlan;
      };
      complete_block_review: {
        Args: {
          p_block_id: string;
          p_operation_id: string;
          p_review: Omit<BlockReviewInsert, "block_id" | "user_id"> & { expected_repetitions: number };
          p_changes: Database["public"]["Tables"]["question_blocks"]["Update"];
        };
        Returns: { block: QuestionBlock; review: BlockReview; replayed: boolean };
      };
      get_catalog_suggestions: {
        Args: {
          p_release_id: string;
          p_search?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: Array<{
          catalog_release_id: string;
          catalog_item_id: string;
          external_id: string;
          title: string;
          catalog_area: string;
          major_area: Exclude<MajorArea, "A classificar">;
          specialty: string;
          effective_score: number;
          relevance_version_id: string;
          topic_ids: string[];
          workload_weight: number;
          suggested_importance: Importance;
        }>;
      };
      replace_course_topics: {
        Args: {
          p_filename: string;
          p_topics: Array<{
            sourceOrder: number;
            originalArea: string | null;
            majorArea: MajorArea;
            specialty: string;
            title: string;
          }>;
        };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type ExamTarget = Database["public"]["Tables"]["exam_targets"]["Row"];
export type Area = Database["public"]["Tables"]["areas"]["Row"];
export type StudentProfile = Database["public"]["Tables"]["student_profiles"]["Row"];
export type CourseTopic = Database["public"]["Tables"]["course_topics"]["Row"];
export type MetaMedTopic = Database["public"]["Tables"]["metamed_topics"]["Row"];
export type RelevancePublication = Database["public"]["Tables"]["relevance_publications"]["Row"];
export type CourseCatalogRelease = Database["public"]["Tables"]["course_catalog_releases"]["Row"];
export type CatalogItem = Database["public"]["Tables"]["course_catalog_items"]["Row"];
export type QuestionBlock = Database["public"]["Tables"]["question_blocks"]["Row"];
export type QuestionBlockInsert = Database["public"]["Tables"]["question_blocks"]["Insert"];
export type BlockReview = Database["public"]["Tables"]["block_reviews"]["Row"];
export type BlockReviewInsert = Database["public"]["Tables"]["block_reviews"]["Insert"];
export type WeeklyPlan = Database["public"]["Tables"]["weekly_plans"]["Row"];
export type WeeklyPlanItem = Database["public"]["Tables"]["weekly_plan_items"]["Row"];
