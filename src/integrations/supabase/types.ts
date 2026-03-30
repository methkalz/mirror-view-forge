export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audio_config: {
        Row: {
          audio_url: string | null
          category: string
          enabled: boolean
          id: string
          interval_seconds: number | null
          label: string
          label_ar: string
          max_concurrent: number
          play_mode: string
          sound_key: string
          updated_at: string
          volume: number
        }
        Insert: {
          audio_url?: string | null
          category: string
          enabled?: boolean
          id?: string
          interval_seconds?: number | null
          label: string
          label_ar?: string
          max_concurrent?: number
          play_mode?: string
          sound_key: string
          updated_at?: string
          volume?: number
        }
        Update: {
          audio_url?: string | null
          category?: string
          enabled?: boolean
          id?: string
          interval_seconds?: number | null
          label?: string
          label_ar?: string
          max_concurrent?: number
          play_mode?: string
          sound_key?: string
          updated_at?: string
          volume?: number
        }
        Relationships: []
      }
      audio_files: {
        Row: {
          created_at: string
          file_name: string
          file_url: string
          id: string
          sort_order: number
          sound_config_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_url: string
          id?: string
          sort_order?: number
          sound_config_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          sort_order?: number
          sound_config_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_files_sound_config_id_fkey"
            columns: ["sound_config_id"]
            isOneToOne: false
            referencedRelation: "audio_config"
            referencedColumns: ["id"]
          },
        ]
      }
      background_config: {
        Row: {
          id: string
          image_url: string | null
          overlay_bottom: string | null
          overlay_mid: string | null
          overlay_opacity: number | null
          overlay_top: string | null
          phase: string
          sort_order: number | null
          transition_end: number
          transition_start: number
          updated_at: string | null
        }
        Insert: {
          id?: string
          image_url?: string | null
          overlay_bottom?: string | null
          overlay_mid?: string | null
          overlay_opacity?: number | null
          overlay_top?: string | null
          phase: string
          sort_order?: number | null
          transition_end?: number
          transition_start?: number
          updated_at?: string | null
        }
        Update: {
          id?: string
          image_url?: string | null
          overlay_bottom?: string | null
          overlay_mid?: string | null
          overlay_opacity?: number | null
          overlay_top?: string | null
          phase?: string
          sort_order?: number | null
          transition_end?: number
          transition_start?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      game_config: {
        Row: {
          base_speed: number
          dda_enabled: boolean
          developer_name: string
          developer_url: string | null
          difficulty_multiplier: number
          game_subtitle: string
          game_title: string
          global_pause: boolean
          gravity: number
          id: string
          logo_url: string | null
          show_title: boolean
          spawn_interval: number
          updated_at: string
        }
        Insert: {
          base_speed?: number
          dda_enabled?: boolean
          developer_name?: string
          developer_url?: string | null
          difficulty_multiplier?: number
          game_subtitle?: string
          game_title?: string
          global_pause?: boolean
          gravity?: number
          id?: string
          logo_url?: string | null
          show_title?: boolean
          spawn_interval?: number
          updated_at?: string
        }
        Update: {
          base_speed?: number
          dda_enabled?: boolean
          developer_name?: string
          developer_url?: string | null
          difficulty_multiplier?: number
          game_subtitle?: string
          game_title?: string
          global_pause?: boolean
          gravity?: number
          id?: string
          logo_url?: string | null
          show_title?: boolean
          spawn_interval?: number
          updated_at?: string
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          bosses_defeated: number
          close_calls: number
          created_at: string
          drones_destroyed: number
          duration_seconds: number
          id: string
          level_reached: number
          player_name: string
          powerups_collected: number
          score: number
          waves_reached: number
        }
        Insert: {
          bosses_defeated?: number
          close_calls?: number
          created_at?: string
          drones_destroyed?: number
          duration_seconds?: number
          id?: string
          level_reached?: number
          player_name: string
          powerups_collected?: number
          score?: number
          waves_reached?: number
        }
        Update: {
          bosses_defeated?: number
          close_calls?: number
          created_at?: string
          drones_destroyed?: number
          duration_seconds?: number
          id?: string
          level_reached?: number
          player_name?: string
          powerups_collected?: number
          score?: number
          waves_reached?: number
        }
        Relationships: []
      }
      leaderboard: {
        Row: {
          created_at: string
          id: string
          level_reached: number
          player_name: string
          score: number
          waves_reached: number
        }
        Insert: {
          created_at?: string
          id?: string
          level_reached?: number
          player_name: string
          score?: number
          waves_reached?: number
        }
        Update: {
          created_at?: string
          id?: string
          level_reached?: number
          player_name?: string
          score?: number
          waves_reached?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wave_configs: {
        Row: {
          drone_types: Json
          duration: number
          id: string
          max_concurrent: number
          spawn_rate: number
          surge_multiplier: number
          threats: Json
          wave_number: number
        }
        Insert: {
          drone_types?: Json
          duration?: number
          id?: string
          max_concurrent?: number
          spawn_rate?: number
          surge_multiplier?: number
          threats?: Json
          wave_number: number
        }
        Update: {
          drone_types?: Json
          duration?: number
          id?: string
          max_concurrent?: number
          spawn_rate?: number
          surge_multiplier?: number
          threats?: Json
          wave_number?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
