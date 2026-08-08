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
      weekly_plans: {
        Row: {
          user_id: string;
          week_start: string;
          capacity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          week_start: string;
          capacity: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["weekly_plans"]["Row"]>;
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
          engine_version: string;
          calculation_mode: CalculationMode | null;
          performance_band: PerformanceBand | null;
          importance: Importance | null;
          previous_interval_days: number | null;
          new_interval_days: number | null;
          priority_score: number | null;
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
          engine_version?: string;
          calculation_mode?: CalculationMode | null;
          performance_band?: PerformanceBand | null;
          importance?: Importance | null;
          previous_interval_days?: number | null;
          new_interval_days?: number | null;
          priority_score?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["block_reviews"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
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
export type QuestionBlock = Database["public"]["Tables"]["question_blocks"]["Row"];
export type QuestionBlockInsert = Database["public"]["Tables"]["question_blocks"]["Insert"];
export type BlockReview = Database["public"]["Tables"]["block_reviews"]["Row"];
export type BlockReviewInsert = Database["public"]["Tables"]["block_reviews"]["Insert"];
