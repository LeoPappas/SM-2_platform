export type Theme = Database['public']['Tables']['themes']['Row']
export type StudySession = Database['public']['Tables']['study_sessions']['Row']

// We'll generate the precise types, but for now we manually alias them.
export type Database = {
  public: {
    Tables: {
      themes: {
        Row: {
          id: string
          user_id: string
          title: string
          area: string
          repetitions: number
          easiness_factor: number
          interval_days: number
          next_review_date: string
          calendar_event_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['themes']['Row'], 'id' | 'created_at' | 'updated_at' | 'repetitions' | 'easiness_factor' | 'interval_days' | 'next_review_date'>
        Update: Partial<Database['public']['Tables']['themes']['Row']>
      }
      study_sessions: {
        Row: {
          id: string
          theme_id: string
          user_id: string
          study_date: string
          accuracy_percentage: number
          easiness_rating: string
          sm2_grade_calculated: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['study_sessions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['study_sessions']['Row']>
      }
    }
  }
}
