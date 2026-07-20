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
      profiles: {
        Row: {
          id: string;
          auth_user_id: string | null;
          email: string;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          status: "active" | "suspended";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          status?: "active" | "suspended";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          status?: "active" | "suspended";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          profile_id: string;
          role: "property_manager" | "super_admin";
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          role: "property_manager" | "super_admin";
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          role?: "property_manager" | "super_admin";
          created_at?: string;
        };
        Relationships: [];
      };
      wallets: {
        Row: {
          id: string;
          profile_id: string;
          balance_cents: number;
          currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          balance_cents?: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          balance_cents?: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      property_manager_profiles: {
        Row: {
          id: string;
          profile_id: string;
          company_name: string;
          vat_number: string | null;
          website: string | null;
          managed_properties_count: number | null;
          years_experience: number | null;
          business_description: string | null;
          operating_model: string | null;
          verification_status: "not_verified" | "verified" | "suspended";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          company_name: string;
          vat_number?: string | null;
          website?: string | null;
          managed_properties_count?: number | null;
          years_experience?: number | null;
          business_description?: string | null;
          operating_model?: string | null;
          verification_status?: "not_verified" | "verified" | "suspended";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          company_name?: string;
          vat_number?: string | null;
          website?: string | null;
          managed_properties_count?: number | null;
          years_experience?: number | null;
          business_description?: string | null;
          operating_model?: string | null;
          verification_status?: "not_verified" | "verified" | "suspended";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      wallet_transactions: {
        Row: {
          id: string;
          wallet_id: string;
          profile_id: string;
          type: "top_up" | "lead_purchase" | "refund" | "adjustment";
          status: "pending" | "completed" | "failed" | "cancelled";
          amount_cents: number;
          balance_after_cents: number | null;
          description: string | null;
          provider: string | null;
          provider_reference: string | null;
          lead_purchase_id: string | null;
          metadata: Json;
          created_at: string;
          completed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          owner_request_id: string;
          property_id: string;
          title: string;
          internal_status:
            | "available"
            | "one_slot_sold"
            | "sold_two_pm"
            | "sold_exclusive"
            | "withdrawn_after_7_days"
            | "cancelled"
            | "refunded";
          public_status: "available" | "last_availability" | "unavailable";
          shared_slots_sold: number;
          shared_price_cents: number;
          exclusive_price_cents: number;
          published_at: string | null;
          expires_at: string | null;
          visible_until: string | null;
          exclusive_purchase_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_request_id: string;
          property_id: string;
          title: string;
          internal_status?:
            | "available"
            | "one_slot_sold"
            | "sold_two_pm"
            | "sold_exclusive"
            | "withdrawn_after_7_days"
            | "cancelled"
            | "refunded";
          public_status?: "available" | "last_availability" | "unavailable";
          shared_slots_sold?: number;
          shared_price_cents?: number;
          exclusive_price_cents?: number;
          published_at?: string | null;
          expires_at?: string | null;
          visible_until?: string | null;
          exclusive_purchase_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_request_id?: string;
          property_id?: string;
          title?: string;
          internal_status?:
            | "available"
            | "one_slot_sold"
            | "sold_two_pm"
            | "sold_exclusive"
            | "withdrawn_after_7_days"
            | "cancelled"
            | "refunded";
          public_status?: "available" | "last_availability" | "unavailable";
          shared_slots_sold?: number;
          shared_price_cents?: number;
          exclusive_price_cents?: number;
          published_at?: string | null;
          expires_at?: string | null;
          visible_until?: string | null;
          exclusive_purchase_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lead_purchases: {
        Row: {
          id: string;
          lead_id: string;
          property_manager_id: string;
          purchase_attempt_id: string | null;
          mode: "shared" | "exclusive";
          amount_cents: number;
          status:
            | "initiated"
            | "reserved"
            | "checkout_created"
            | "payment_pending"
            | "paid"
            | "contact_unlocked"
            | "failed"
            | "expired"
            | "cancelled"
            | "refunded";
          unlocked_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_paid_lead_purchase: {
        Args: {
          p_purchase_attempt_id: string;
          p_provider_payment_id: string;
          p_provider_checkout_session_id: string;
        };
        Returns: Database["public"]["Tables"]["lead_purchases"]["Row"];
      };
      publish_lead: {
        Args: {
          p_lead_id: string;
        };
        Returns: Database["public"]["Tables"]["leads"]["Row"];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
