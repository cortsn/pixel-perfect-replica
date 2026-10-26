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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          access_token: string
          active: boolean
          guest_name: string
          id: string
          reference: string
          room_number: string
        }
        Insert: {
          access_token?: string
          active?: boolean
          guest_name: string
          id?: string
          reference: string
          room_number: string
        }
        Update: {
          access_token?: string
          active?: boolean
          guest_name?: string
          id?: string
          reference?: string
          room_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_room_number_fkey"
            columns: ["room_number"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["number"]
          },
        ]
      }
      devices: {
        Row: {
          booking_id: string
          created_at: string
          id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          description: string
          id: string
          location: string
          starts_at: string
          title: string
        }
        Insert: {
          description?: string
          id?: string
          location: string
          starts_at: string
          title: string
        }
        Update: {
          description?: string
          id?: string
          location?: string
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      hotel_secrets: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          details: string
          id: string
          room_number: string
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          details?: string
          id?: string
          room_number: string
          status?: string
          type: string
        }
        Update: {
          created_at?: string
          details?: string
          id?: string
          room_number?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_room_number_fkey"
            columns: ["room_number"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["number"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number
          floor: number
          housekeeping_status: string
          number: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          floor: number
          housekeeping_status?: string
          number: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          floor?: number
          housekeeping_status?: string
          number?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      guest_info: {
        Args: {
          _b: Database["public"]["Tables"]["bookings"]["Row"]
          _device: string
        }
        Returns: Json
      }
      guest_join: { Args: { _token: string }; Returns: Json }
      guest_login: {
        Args: { _reference: string; _room: string }
        Returns: Json
      }
      guest_order: {
        Args: {
          _details: string
          _device: string
          _token: string
          _type: string
        }
        Returns: string
      }
      guest_session: {
        Args: { _device: string; _token: string }
        Returns: Json
      }
      guest_set_housekeeping: {
        Args: { _device: string; _requested: boolean; _token: string }
        Returns: string
      }
      register_device: {
        Args: { _b: Database["public"]["Tables"]["bookings"]["Row"] }
        Returns: string
      }
      staff_check: { Args: { _pin: string }; Returns: boolean }
      staff_set_order_status: {
        Args: { _order: string; _pin: string; _status: string }
        Returns: undefined
      }
      staff_set_room_status: {
        Args: { _pin: string; _room: string; _status: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
