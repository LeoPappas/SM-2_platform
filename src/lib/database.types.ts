export type DifficultyRating =
  | "Muito fácil"
  | "Fácil"
  | "Médio"
  | "Difícil"
  | "Muito difícil";

export type CalendarSyncStatus = "pending" | "synced" | "failed" | "disabled";

export type Database = {
  public: {
    Tables: {
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
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["block_reviews"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type ExamTarget = Database["public"]["Tables"]["exam_targets"]["Row"];
export type Area = Database["public"]["Tables"]["areas"]["Row"];
export type QuestionBlock = Database["public"]["Tables"]["question_blocks"]["Row"];
export type QuestionBlockInsert = Database["public"]["Tables"]["question_blocks"]["Insert"];
export type BlockReview = Database["public"]["Tables"]["block_reviews"]["Row"];
export type BlockReviewInsert = Database["public"]["Tables"]["block_reviews"]["Insert"];
