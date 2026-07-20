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
          company_name: string | null;
          vat_number: string | null;
          website: string | null;
          managed_properties_count: number | null;
          managed_properties_range: string | null;
          primary_city: string | null;
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
          company_name?: string | null;
          vat_number?: string | null;
          website?: string | null;
          managed_properties_count?: number | null;
          managed_properties_range?: string | null;
          primary_city?: string | null;
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
          company_name?: string | null;
          vat_number?: string | null;
          website?: string | null;
          managed_properties_count?: number | null;
          managed_properties_range?: string | null;
          primary_city?: string | null;
          years_experience?: number | null;
          business_description?: string | null;
          operating_model?: string | null;
          verification_status?: "not_verified" | "verified" | "suspended";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      owner_requests: {
        Row: {
          id: string;
          acquisition_channel: "landing" | "meta_lead_ads" | "manual" | "api";
          status:
            | "new_from_meta"
            | "waiting_for_completion"
            | "completed"
            | "pending"
            | "to_verify"
            | "approved"
            | "published"
            | "not_publishable";
          completion_token_hash: string | null;
          completion_token_expires_at: string | null;
          completion_token_invalidated_at: string | null;
          privacy_consent_at: string | null;
          data_sharing_consent_at: string | null;
          marketing_consent_at: string | null;
          normalized_payload: Json;
          duplicate_check: Json;
          qualification_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          acquisition_channel: "landing" | "meta_lead_ads" | "manual" | "api";
          status?:
            | "new_from_meta"
            | "waiting_for_completion"
            | "completed"
            | "pending"
            | "to_verify"
            | "approved"
            | "published"
            | "not_publishable";
          completion_token_hash?: string | null;
          completion_token_expires_at?: string | null;
          completion_token_invalidated_at?: string | null;
          privacy_consent_at?: string | null;
          data_sharing_consent_at?: string | null;
          marketing_consent_at?: string | null;
          normalized_payload?: Json;
          duplicate_check?: Json;
          qualification_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          acquisition_channel?: "landing" | "meta_lead_ads" | "manual" | "api";
          status?:
            | "new_from_meta"
            | "waiting_for_completion"
            | "completed"
            | "pending"
            | "to_verify"
            | "approved"
            | "published"
            | "not_publishable";
          completion_token_hash?: string | null;
          completion_token_expires_at?: string | null;
          completion_token_invalidated_at?: string | null;
          privacy_consent_at?: string | null;
          data_sharing_consent_at?: string | null;
          marketing_consent_at?: string | null;
          normalized_payload?: Json;
          duplicate_check?: Json;
          qualification_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      owner_contacts: {
        Row: {
          id: string;
          owner_request_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          phone: string | null;
          precise_address: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_request_id: string;
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
          precise_address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_request_id?: string;
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
          precise_address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          owner_request_id: string;
          region: string | null;
          province: string | null;
          city: string | null;
          postal_code: string | null;
          district: string | null;
          property_type: string | null;
          bedrooms: number | null;
          bathrooms: number | null;
          beds: number | null;
          approximate_area_sqm: number | null;
          current_status: string[] | null;
          requested_services: string[];
          timing: string | null;
          description: string | null;
          photo_paths: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_request_id: string;
          region?: string | null;
          province?: string | null;
          city?: string | null;
          postal_code?: string | null;
          district?: string | null;
          property_type?: string | null;
          bedrooms?: number | null;
          bathrooms?: number | null;
          beds?: number | null;
          approximate_area_sqm?: number | null;
          current_status?: string[] | null;
          requested_services?: string[];
          timing?: string | null;
          description?: string | null;
          photo_paths?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_request_id?: string;
          region?: string | null;
          province?: string | null;
          city?: string | null;
          postal_code?: string | null;
          district?: string | null;
          property_type?: string | null;
          bedrooms?: number | null;
          bathrooms?: number | null;
          beds?: number | null;
          approximate_area_sqm?: number | null;
          current_status?: string[] | null;
          requested_services?: string[];
          timing?: string | null;
          description?: string | null;
          photo_paths?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lead_sources: {
        Row: {
          id: string;
          owner_request_id: string | null;
          channel: "landing" | "meta_lead_ads" | "manual" | "api";
          external_id: string | null;
          idempotency_key: string;
          raw_payload: Json;
          received_at: string;
          processed_at: string | null;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          owner_request_id?: string | null;
          channel: "landing" | "meta_lead_ads" | "manual" | "api";
          external_id?: string | null;
          idempotency_key: string;
          raw_payload?: Json;
          received_at?: string;
          processed_at?: string | null;
          error_message?: string | null;
        };
        Update: {
          id?: string;
          owner_request_id?: string | null;
          channel?: "landing" | "meta_lead_ads" | "manual" | "api";
          external_id?: string | null;
          idempotency_key?: string;
          raw_payload?: Json;
          received_at?: string;
          processed_at?: string | null;
          error_message?: string | null;
        };
        Relationships: [];
      };
      marketing_attribution: {
        Row: {
          id: string;
          owner_request_id: string;
          source: string | null;
          medium: string | null;
          campaign: string | null;
          content: string | null;
          term: string | null;
          landing_page: string | null;
          referrer: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_term: string | null;
          meta_campaign_id: string | null;
          meta_campaign_name: string | null;
          meta_adset_id: string | null;
          meta_adset_name: string | null;
          meta_ad_id: string | null;
          meta_ad_name: string | null;
          meta_form_id: string | null;
          meta_form_name: string | null;
          meta_lead_id: string | null;
          acquired_at: string;
        };
        Insert: {
          id?: string;
          owner_request_id: string;
          source?: string | null;
          medium?: string | null;
          campaign?: string | null;
          content?: string | null;
          term?: string | null;
          landing_page?: string | null;
          referrer?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_term?: string | null;
          acquired_at?: string;
        };
        Update: never;
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
