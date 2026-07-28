export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      control_center_owner: {
        Row: {
          created_at: string;
          owner_user_id: string;
          singleton_key: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          owner_user_id: string;
          singleton_key?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          owner_user_id?: string;
          singleton_key?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      installation_audit_events: {
        Row: {
          actor_user_id: string;
          changed_fields: string[];
          correlation_id: string | null;
          event_type: string;
          id: string;
          installation_id: string;
          occurred_at: string;
          revision_after: number;
          revision_before: number | null;
        };
        Insert: {
          actor_user_id: string;
          changed_fields: string[];
          correlation_id?: string | null;
          event_type: string;
          id?: string;
          installation_id: string;
          occurred_at?: string;
          revision_after: number;
          revision_before?: number | null;
        };
        Update: {
          actor_user_id?: string;
          changed_fields?: string[];
          correlation_id?: string | null;
          event_type?: string;
          id?: string;
          installation_id?: string;
          occurred_at?: string;
          revision_after?: number;
          revision_before?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_installation_audit_events_installation_id";
            columns: ["installation_id"];
            isOneToOne: false;
            referencedRelation: "installations";
            referencedColumns: ["id"];
          },
        ];
      };
      installations: {
        Row: {
          administrative_note: string | null;
          administrative_status: string;
          application_url: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string;
          display_name: string;
          environment: string;
          hosting_region: string | null;
          id: string;
          installation_code: string;
          revision: number;
          supabase_project_ref: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          administrative_note?: string | null;
          administrative_status?: string;
          application_url?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by: string;
          display_name: string;
          environment: string;
          hosting_region?: string | null;
          id?: string;
          installation_code: string;
          revision?: number;
          supabase_project_ref?: string | null;
          tenant_id: string;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          administrative_note?: string | null;
          administrative_status?: string;
          application_url?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string;
          display_name?: string;
          environment?: string;
          hosting_region?: string | null;
          id?: string;
          installation_code?: string;
          revision?: number;
          supabase_project_ref?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_installations_tenant";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_audit_events: {
        Row: {
          actor_user_id: string;
          changed_fields: string[];
          correlation_id: string | null;
          event_type: string;
          id: string;
          occurred_at: string;
          revision_after: number;
          revision_before: number | null;
          tenant_id: string;
        };
        Insert: {
          actor_user_id: string;
          changed_fields: string[];
          correlation_id?: string | null;
          event_type: string;
          id?: string;
          occurred_at?: string;
          revision_after: number;
          revision_before?: number | null;
          tenant_id: string;
        };
        Update: {
          actor_user_id?: string;
          changed_fields?: string[];
          correlation_id?: string | null;
          event_type?: string;
          id?: string;
          occurred_at?: string;
          revision_after?: number;
          revision_before?: number | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_tenant_audit_events_tenant_id";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          administrative_note: string | null;
          archived_at: string | null;
          archived_by: string | null;
          category: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          country_code: string;
          created_at: string;
          created_by: string;
          id: string;
          legal_name: string;
          operational_status: string;
          organization_number: string | null;
          revision: number;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          administrative_note?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          category: string;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          country_code?: string;
          created_at?: string;
          created_by: string;
          id?: string;
          legal_name: string;
          operational_status?: string;
          organization_number?: string | null;
          revision?: number;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          administrative_note?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          category?: string;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          country_code?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          legal_name?: string;
          operational_status?: string;
          organization_number?: string | null;
          revision?: number;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      activate_installation: {
        Args: {
          p_correlation_id?: string;
          p_expected_revision: number;
          p_installation_id: string;
        };
        Returns: {
          administrative_note: string | null;
          administrative_status: string;
          application_url: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string;
          display_name: string;
          environment: string;
          hosting_region: string | null;
          id: string;
          installation_code: string;
          revision: number;
          supabase_project_ref: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "installations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      activate_tenant: {
        Args: {
          p_correlation_id?: string;
          p_expected_revision: number;
          p_tenant_id: string;
        };
        Returns: {
          administrative_note: string | null;
          archived_at: string | null;
          archived_by: string | null;
          category: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          country_code: string;
          created_at: string;
          created_by: string;
          id: string;
          legal_name: string;
          operational_status: string;
          organization_number: string | null;
          revision: number;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "tenants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      archive_installation: {
        Args: {
          p_correlation_id?: string;
          p_expected_revision: number;
          p_installation_id: string;
        };
        Returns: {
          administrative_note: string | null;
          administrative_status: string;
          application_url: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string;
          display_name: string;
          environment: string;
          hosting_region: string | null;
          id: string;
          installation_code: string;
          revision: number;
          supabase_project_ref: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "installations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      archive_tenant: {
        Args: {
          p_correlation_id?: string;
          p_expected_revision: number;
          p_tenant_id: string;
        };
        Returns: {
          administrative_note: string | null;
          archived_at: string | null;
          archived_by: string | null;
          category: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          country_code: string;
          created_at: string;
          created_by: string;
          id: string;
          legal_name: string;
          operational_status: string;
          organization_number: string | null;
          revision: number;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "tenants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_installation: {
        Args: {
          p_administrative_note: string;
          p_application_url: string;
          p_correlation_id?: string;
          p_display_name: string;
          p_environment: string;
          p_hosting_region: string;
          p_installation_code: string;
          p_supabase_project_ref: string;
          p_tenant_id: string;
        };
        Returns: {
          administrative_note: string | null;
          administrative_status: string;
          application_url: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string;
          display_name: string;
          environment: string;
          hosting_region: string | null;
          id: string;
          installation_code: string;
          revision: number;
          supabase_project_ref: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "installations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_tenant: {
        Args: {
          p_administrative_note?: string;
          p_category: string;
          p_contact_email?: string;
          p_contact_name?: string;
          p_contact_phone?: string;
          p_correlation_id?: string;
          p_legal_name: string;
          p_organization_number: string;
        };
        Returns: {
          administrative_note: string | null;
          archived_at: string | null;
          archived_by: string | null;
          category: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          country_code: string;
          created_at: string;
          created_by: string;
          id: string;
          legal_name: string;
          operational_status: string;
          organization_number: string | null;
          revision: number;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "tenants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      decommission_installation: {
        Args: {
          p_correlation_id?: string;
          p_expected_revision: number;
          p_installation_id: string;
        };
        Returns: {
          administrative_note: string | null;
          administrative_status: string;
          application_url: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string;
          display_name: string;
          environment: string;
          hosting_region: string | null;
          id: string;
          installation_code: string;
          revision: number;
          supabase_project_ref: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "installations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_owner_integrity_status: { Args: never; Returns: string };
      is_control_center_owner: { Args: never; Returns: boolean };
      is_valid_swedish_organization_number: {
        Args: { value: string };
        Returns: boolean;
      };
      list_tenant_audit_events: {
        Args: {
          p_cursor_id?: string;
          p_cursor_occurred_at?: string;
          p_page_size?: number;
          p_tenant_id: string;
        };
        Returns: {
          actor_user_id: string;
          changed_fields: string[];
          correlation_id: string;
          event_type: string;
          has_more: boolean;
          id: string;
          next_cursor_id: string;
          next_cursor_occurred_at: string;
          occurred_at: string;
          revision_after: number;
          revision_before: number;
          tenant_id: string;
        }[];
      };
      pause_installation: {
        Args: {
          p_correlation_id?: string;
          p_expected_revision: number;
          p_installation_id: string;
        };
        Returns: {
          administrative_note: string | null;
          administrative_status: string;
          application_url: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string;
          display_name: string;
          environment: string;
          hosting_region: string | null;
          id: string;
          installation_code: string;
          revision: number;
          supabase_project_ref: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "installations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      pause_tenant: {
        Args: {
          p_correlation_id?: string;
          p_expected_revision: number;
          p_tenant_id: string;
        };
        Returns: {
          administrative_note: string | null;
          archived_at: string | null;
          archived_by: string | null;
          category: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          country_code: string;
          created_at: string;
          created_by: string;
          id: string;
          legal_name: string;
          operational_status: string;
          organization_number: string | null;
          revision: number;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "tenants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      restore_installation: {
        Args: {
          p_correlation_id?: string;
          p_expected_revision: number;
          p_installation_id: string;
        };
        Returns: {
          administrative_note: string | null;
          administrative_status: string;
          application_url: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string;
          display_name: string;
          environment: string;
          hosting_region: string | null;
          id: string;
          installation_code: string;
          revision: number;
          supabase_project_ref: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "installations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      restore_tenant: {
        Args: {
          p_correlation_id?: string;
          p_expected_revision: number;
          p_tenant_id: string;
        };
        Returns: {
          administrative_note: string | null;
          archived_at: string | null;
          archived_by: string | null;
          category: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          country_code: string;
          created_at: string;
          created_by: string;
          id: string;
          legal_name: string;
          operational_status: string;
          organization_number: string | null;
          revision: number;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "tenants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_installation: {
        Args: {
          p_administrative_note: string;
          p_application_url: string;
          p_correlation_id?: string;
          p_display_name: string;
          p_expected_revision: number;
          p_hosting_region: string;
          p_installation_id: string;
          p_supabase_project_ref: string;
        };
        Returns: {
          administrative_note: string | null;
          administrative_status: string;
          application_url: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string;
          display_name: string;
          environment: string;
          hosting_region: string | null;
          id: string;
          installation_code: string;
          revision: number;
          supabase_project_ref: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "installations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_tenant: {
        Args: {
          p_administrative_note: string;
          p_contact_email: string;
          p_contact_name: string;
          p_contact_phone: string;
          p_correlation_id?: string;
          p_expected_revision: number;
          p_legal_name: string;
          p_organization_number: string;
          p_tenant_id: string;
        };
        Returns: {
          administrative_note: string | null;
          archived_at: string | null;
          archived_by: string | null;
          category: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          country_code: string;
          created_at: string;
          created_by: string;
          id: string;
          legal_name: string;
          operational_status: string;
          organization_number: string | null;
          revision: number;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "tenants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
