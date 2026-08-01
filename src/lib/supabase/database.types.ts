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
      billing_profiles: {
        Row: {
          id: string;
          profile_id: string;
          subject_type: "individual" | "company";
          first_name: string | null;
          last_name: string | null;
          fiscal_code: string | null;
          company_name: string | null;
          vat_number: string | null;
          company_fiscal_code: string | null;
          address_line: string | null;
          postal_code: string | null;
          city: string | null;
          province: string | null;
          country: string;
          sdi_code: string | null;
          pec: string | null;
          invoice_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          subject_type?: "individual" | "company";
          first_name?: string | null;
          last_name?: string | null;
          fiscal_code?: string | null;
          company_name?: string | null;
          vat_number?: string | null;
          company_fiscal_code?: string | null;
          address_line?: string | null;
          postal_code?: string | null;
          city?: string | null;
          province?: string | null;
          country?: string;
          sdi_code?: string | null;
          pec?: string | null;
          invoice_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          subject_type?: "individual" | "company";
          first_name?: string | null;
          last_name?: string | null;
          fiscal_code?: string | null;
          company_name?: string | null;
          vat_number?: string | null;
          company_fiscal_code?: string | null;
          address_line?: string | null;
          postal_code?: string | null;
          city?: string | null;
          province?: string | null;
          country?: string;
          sdi_code?: string | null;
          pec?: string | null;
          invoice_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_issuer_settings: {
        Row: {
          id: number;
          legal_name: string;
          vat_country_code: string;
          vat_number: string;
          fiscal_code: string;
          address_line: string;
          postal_code: string;
          city: string;
          province: string;
          country: string;
          email: string;
          tax_regime: string;
          tax_regime_description: string;
          vat_rate: number;
          vat_nature: string;
          vat_reference: string;
          document_type: string;
          transmission_format: string;
          aruba_transmitter_tax_code: string;
          currency: string;
          line_description: string;
          payment_method: string;
          provisional_number_prefix: string;
          stamp_duty_threshold_cents: number;
          stamp_duty_amount_cents: number;
          stamp_duty_absorbed: boolean;
          auto_generate_invoices: boolean;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          legal_name: string;
          vat_country_code?: string;
          vat_number: string;
          fiscal_code: string;
          address_line: string;
          postal_code: string;
          city: string;
          province: string;
          country?: string;
          email: string;
          tax_regime?: string;
          tax_regime_description: string;
          vat_rate?: number;
          vat_nature?: string;
          vat_reference: string;
          document_type?: string;
          transmission_format?: string;
          aruba_transmitter_tax_code?: string;
          currency?: string;
          line_description?: string;
          payment_method?: string;
          provisional_number_prefix?: string;
          stamp_duty_threshold_cents?: number;
          stamp_duty_amount_cents?: number;
          stamp_duty_absorbed?: boolean;
          auto_generate_invoices?: boolean;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["billing_issuer_settings"]["Insert"]
        >;
        Relationships: [];
      };
      billing_invoices: {
        Row: {
          id: string;
          wallet_transaction_id: string;
          payment_id: string | null;
          profile_id: string;
          status: Database["public"]["Enums"]["billing_invoice_status"];
          amount_cents: number;
          currency: string;
          provisional_number: string | null;
          document_date: string | null;
          transmission_progressive: string;
          stripe_payment_intent_id: string | null;
          stripe_checkout_session_id: string | null;
          issuer_snapshot: Json;
          customer_snapshot: Json;
          xml_content: string | null;
          xml_sha256: string | null;
          stamp_duty_applied: boolean;
          stamp_duty_amount_cents: number;
          generation_attempts: number;
          last_error: string | null;
          generated_at: string | null;
          downloaded_at: string | null;
          imported_at: string | null;
          sent_at: string | null;
          final_invoice_number: string | null;
          final_invoice_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_transaction_id: string;
          payment_id?: string | null;
          profile_id: string;
          status?: Database["public"]["Enums"]["billing_invoice_status"];
          amount_cents: number;
          currency?: string;
          provisional_number?: string | null;
          document_date?: string | null;
          transmission_progressive?: string;
          stripe_payment_intent_id?: string | null;
          stripe_checkout_session_id?: string | null;
          issuer_snapshot?: Json;
          customer_snapshot?: Json;
          xml_content?: string | null;
          xml_sha256?: string | null;
          stamp_duty_applied?: boolean;
          stamp_duty_amount_cents?: number;
          generation_attempts?: number;
          last_error?: string | null;
          generated_at?: string | null;
          downloaded_at?: string | null;
          imported_at?: string | null;
          sent_at?: string | null;
          final_invoice_number?: string | null;
          final_invoice_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["billing_invoices"]["Insert"]
        >;
        Relationships: [];
      };
      billing_invoice_events: {
        Row: {
          id: string;
          invoice_id: string;
          event_type: string;
          actor_profile_id: string | null;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          event_type: string;
          actor_profile_id?: string | null;
          details?: Json;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["billing_invoice_events"]["Insert"]
        >;
        Relationships: [];
      };
      pm_marketing_preferences: {
        Row: {
          profile_id: string;
          status: Database["public"]["Enums"]["pm_marketing_consent_status"];
          source: string;
          policy_version: string;
          granted_at: string | null;
          withdrawn_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          status?: Database["public"]["Enums"]["pm_marketing_consent_status"];
          source: string;
          policy_version: string;
          granted_at?: string | null;
          withdrawn_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          profile_id?: string;
          status?: Database["public"]["Enums"]["pm_marketing_consent_status"];
          source?: string;
          policy_version?: string;
          granted_at?: string | null;
          withdrawn_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pm_marketing_consent_events: {
        Row: {
          id: string;
          profile_id: string;
          status: Database["public"]["Enums"]["pm_marketing_consent_status"];
          source: string;
          policy_version: string;
          external_event_id: string | null;
          evidence: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          status: Database["public"]["Enums"]["pm_marketing_consent_status"];
          source: string;
          policy_version: string;
          external_event_id?: string | null;
          evidence?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          status?: Database["public"]["Enums"]["pm_marketing_consent_status"];
          source?: string;
          policy_version?: string;
          external_event_id?: string | null;
          evidence?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      pm_brevo_snapshots: {
        Row: {
          profile_id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          registered_at: string;
          last_access_at: string | null;
          account_status: string;
          marketing_consent_status:
            Database["public"]["Enums"]["pm_marketing_consent_status"];
          marketing_consent_updated_at: string;
          wallet_balance_cents: number;
          has_wallet_topup: boolean;
          first_wallet_topup_at: string | null;
          last_wallet_topup_at: string | null;
          wallet_topups_count: number;
          wallet_topups_total_cents: number;
          lead_purchases_count: number;
          first_lead_purchase_at: string | null;
          last_lead_purchase_at: string | null;
          lead_spend_gross_cents: number;
          wallet_refunds_total_cents: number;
          lead_spend_net_cents: number;
          lifecycle_status: string;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          registered_at: string;
          last_access_at?: string | null;
          account_status: string;
          marketing_consent_status:
            Database["public"]["Enums"]["pm_marketing_consent_status"];
          marketing_consent_updated_at: string;
          wallet_balance_cents?: number;
          has_wallet_topup?: boolean;
          first_wallet_topup_at?: string | null;
          last_wallet_topup_at?: string | null;
          wallet_topups_count?: number;
          wallet_topups_total_cents?: number;
          lead_purchases_count?: number;
          first_lead_purchase_at?: string | null;
          last_lead_purchase_at?: string | null;
          lead_spend_gross_cents?: number;
          wallet_refunds_total_cents?: number;
          lead_spend_net_cents?: number;
          lifecycle_status: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["pm_brevo_snapshots"]["Insert"]
        >;
        Relationships: [];
      };
      brevo_outbox: {
        Row: {
          id: string;
          profile_id: string;
          event_type: string;
          event_key: string;
          payload: Json;
          status: Database["public"]["Enums"]["brevo_outbox_status"];
          attempts: number;
          available_at: string;
          locked_at: string | null;
          locked_by: string | null;
          last_error: string | null;
          last_http_status: number | null;
          processed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          event_type: string;
          event_key: string;
          payload?: Json;
          status?: Database["public"]["Enums"]["brevo_outbox_status"];
          attempts?: number;
          available_at?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          last_error?: string | null;
          last_http_status?: number | null;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["brevo_outbox"]["Insert"]
        >;
        Relationships: [];
      };
      service_email_campaigns: {
        Row: {
          id: string;
          subject: string;
          preview: string;
          title: string;
          body: string;
          extra: string;
          cta_label: string;
          cta_url: string;
          recipient_scope: "active_property_managers";
          status:
            | "draft"
            | "queued"
            | "processing"
            | "completed"
            | "completed_with_errors"
            | "failed"
            | "cancelled";
          total_recipients: number;
          pending_count: number;
          sent_count: number;
          failed_count: number;
          created_by: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          subject: string;
          preview?: string;
          title: string;
          body: string;
          extra?: string;
          cta_label?: string;
          cta_url?: string;
          recipient_scope?: "active_property_managers";
          status?:
            | "draft"
            | "queued"
            | "processing"
            | "completed"
            | "completed_with_errors"
            | "failed"
            | "cancelled";
          total_recipients?: number;
          pending_count?: number;
          sent_count?: number;
          failed_count?: number;
          created_by?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["service_email_campaigns"]["Insert"]
        >;
        Relationships: [];
      };
      service_email_recipients: {
        Row: {
          id: string;
          campaign_id: string;
          profile_id: string | null;
          recipient_email: string;
          first_name: string | null;
          last_name: string | null;
          status:
            | "queued"
            | "processing"
            | "retry"
            | "sent"
            | "failed"
            | "skipped";
          attempts: number;
          available_at: string;
          locked_at: string | null;
          locked_by: string | null;
          provider_message_id: string | null;
          last_error: string | null;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          profile_id?: string | null;
          recipient_email: string;
          first_name?: string | null;
          last_name?: string | null;
          status?:
            | "queued"
            | "processing"
            | "retry"
            | "sent"
            | "failed"
            | "skipped";
          attempts?: number;
          available_at?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          provider_message_id?: string | null;
          last_error?: string | null;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["service_email_recipients"]["Insert"]
        >;
        Relationships: [];
      };
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
      marketing_crm_pipelines: {
        Row: {
          id: string;
          profile_id: string;
          name: string;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          name?: string;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          name?: string;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      marketing_crm_stages: {
        Row: {
          id: string;
          pipeline_id: string;
          name: string;
          color: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pipeline_id: string;
          name: string;
          color?: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pipeline_id?: string;
          name?: string;
          color?: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      marketing_crm_contacts: {
        Row: {
          id: string;
          profile_id: string;
          pipeline_id: string;
          stage_id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          property_address: string | null;
          property_type: string | null;
          region: string | null;
          province: string | null;
          city: string | null;
          bedrooms: number | null;
          bathrooms: number | null;
          area_sqm: number | null;
          current_status: string | null;
          requested_services: string[];
          timing: string | null;
          property_description: string | null;
          notes: string | null;
          next_follow_up_at: string | null;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          pipeline_id: string;
          stage_id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          property_address?: string | null;
          property_type?: string | null;
          region?: string | null;
          province?: string | null;
          city?: string | null;
          bedrooms?: number | null;
          bathrooms?: number | null;
          area_sqm?: number | null;
          current_status?: string | null;
          requested_services?: string[];
          timing?: string | null;
          property_description?: string | null;
          notes?: string | null;
          next_follow_up_at?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          pipeline_id?: string;
          stage_id?: string;
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          property_address?: string | null;
          property_type?: string | null;
          region?: string | null;
          province?: string | null;
          city?: string | null;
          bedrooms?: number | null;
          bathrooms?: number | null;
          area_sqm?: number | null;
          current_status?: string | null;
          requested_services?: string[];
          timing?: string | null;
          property_description?: string | null;
          notes?: string | null;
          next_follow_up_at?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_permissions: {
        Row: {
          key: string;
          section: string;
          label: string;
          description: string;
          supports_write: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          key: string;
          section: string;
          label: string;
          description: string;
          supports_write?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          key?: string;
          section?: string;
          label?: string;
          description?: string;
          supports_write?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      team_roles: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_active: boolean;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_role_permissions: {
        Row: {
          role_id: string;
          permission_key: string;
          access_level: "read" | "write";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          role_id: string;
          permission_key: string;
          access_level: "read" | "write";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role_id?: string;
          permission_key?: string;
          access_level?: "read" | "write";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          profile_id: string;
          role_id: string;
          status: "invited" | "active" | "suspended";
          creation_mode: "invite" | "manual";
          must_change_password: boolean;
          invited_by: string | null;
          invited_at: string | null;
          joined_at: string | null;
          suspended_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          role_id: string;
          status?: "invited" | "active" | "suspended";
          creation_mode: "invite" | "manual";
          must_change_password?: boolean;
          invited_by?: string | null;
          invited_at?: string | null;
          joined_at?: string | null;
          suspended_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          role_id?: string;
          status?: "invited" | "active" | "suspended";
          creation_mode?: "invite" | "manual";
          must_change_password?: boolean;
          invited_by?: string | null;
          invited_at?: string | null;
          joined_at?: string | null;
          suspended_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          profile_id: string;
          role: "property_manager" | "super_admin" | "team_member";
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          role: "property_manager" | "super_admin" | "team_member";
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          role?: "property_manager" | "super_admin" | "team_member";
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
          status_reason: string | null;
          status_changed_at: string | null;
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
          status_reason?: string | null;
          status_changed_at?: string | null;
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
          status_reason?: string | null;
          status_changed_at?: string | null;
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
          meta_campaign_id?: string | null;
          meta_campaign_name?: string | null;
          meta_adset_id?: string | null;
          meta_adset_name?: string | null;
          meta_ad_id?: string | null;
          meta_ad_name?: string | null;
          meta_form_id?: string | null;
          meta_form_name?: string | null;
          meta_lead_id?: string | null;
          acquired_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          lead_purchase_id: string | null;
          property_manager_id: string;
          reason: string | null;
          subject: string;
          details: string | null;
          admin_reply: string | null;
          replied_at: string | null;
          replied_by: string | null;
          status: "pending" | "reviewing" | "resolved" | "rejected";
          created_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          lead_purchase_id?: string | null;
          property_manager_id: string;
          reason?: string | null;
          subject?: string;
          details?: string | null;
          admin_reply?: string | null;
          replied_at?: string | null;
          replied_by?: string | null;
          status?: "pending" | "reviewing" | "resolved" | "rejected";
          created_at?: string;
          reviewed_at?: string | null;
        };
        Update: {
          id?: string;
          lead_purchase_id?: string | null;
          property_manager_id?: string;
          reason?: string | null;
          subject?: string;
          details?: string | null;
          admin_reply?: string | null;
          replied_at?: string | null;
          replied_by?: string | null;
          status?: "pending" | "reviewing" | "resolved" | "rejected";
          created_at?: string;
          reviewed_at?: string | null;
        };
        Relationships: [];
      };
      support_messages: {
        Row: {
          id: string;
          report_id: string;
          sender_type: "pm" | "admin";
          sender_profile_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          report_id: string;
          sender_type: "pm" | "admin";
          sender_profile_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          report_id?: string;
          sender_type?: "pm" | "admin";
          sender_profile_id?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      tracking_event_logs: {
        Row: {
          id: string;
          provider: "meta" | "ga4" | "hotjar";
          event_name: string;
          event_id: string | null;
          source: "browser" | "server" | "hybrid" | "test";
          status: "queued" | "sent" | "failed" | "skipped";
          page_path: string | null;
          value_cents: number | null;
          currency: string | null;
          metadata: Json;
          error_message: string | null;
          occurred_at: string;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider: "meta" | "ga4" | "hotjar";
          event_name: string;
          event_id?: string | null;
          source: "browser" | "server" | "hybrid" | "test";
          status?: "queued" | "sent" | "failed" | "skipped";
          page_path?: string | null;
          value_cents?: number | null;
          currency?: string | null;
          metadata?: Json;
          error_message?: string | null;
          occurred_at?: string;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          provider?: "meta" | "ga4" | "hotjar";
          event_name?: string;
          event_id?: string | null;
          source?: "browser" | "server" | "hybrid" | "test";
          status?: "queued" | "sent" | "failed" | "skipped";
          page_path?: string | null;
          value_cents?: number | null;
          currency?: string | null;
          metadata?: Json;
          error_message?: string | null;
          occurred_at?: string;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          key: string;
          value: Json;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      wallet_coupons: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          partner_name: string | null;
          active: boolean;
          first_top_up_only: boolean;
          valid_from: string | null;
          valid_until: string | null;
          max_total_redemptions: number | null;
          max_redemptions_per_profile: number;
          bonus_budget_cents: number | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          partner_name?: string | null;
          active?: boolean;
          first_top_up_only?: boolean;
          valid_from?: string | null;
          valid_until?: string | null;
          max_total_redemptions?: number | null;
          max_redemptions_per_profile?: number;
          bonus_budget_cents?: number | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          partner_name?: string | null;
          active?: boolean;
          first_top_up_only?: boolean;
          valid_from?: string | null;
          valid_until?: string | null;
          max_total_redemptions?: number | null;
          max_redemptions_per_profile?: number;
          bonus_budget_cents?: number | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      wallet_coupon_bonus_tiers: {
        Row: {
          id: string;
          coupon_id: string;
          min_paid_cents: number;
          max_paid_cents: number | null;
          bonus_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          coupon_id: string;
          min_paid_cents: number;
          max_paid_cents?: number | null;
          bonus_cents: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          coupon_id?: string;
          min_paid_cents?: number;
          max_paid_cents?: number | null;
          bonus_cents?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      wallet_coupon_redemptions: {
        Row: {
          id: string;
          coupon_id: string;
          profile_id: string;
          wallet_transaction_id: string;
          bonus_wallet_transaction_id: string | null;
          paid_amount_cents: number;
          bonus_amount_cents: number;
          code_snapshot: string;
          first_top_up_only: boolean;
          rules_snapshot: Json;
          status: "pending" | "redeemed" | "cancelled" | "expired";
          reserved_at: string;
          expires_at: string;
          redeemed_at: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          provider_checkout_session_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          coupon_id: string;
          profile_id: string;
          wallet_transaction_id: string;
          bonus_wallet_transaction_id?: string | null;
          paid_amount_cents: number;
          bonus_amount_cents: number;
          code_snapshot: string;
          first_top_up_only?: boolean;
          rules_snapshot?: Json;
          status?: "pending" | "redeemed" | "cancelled" | "expired";
          reserved_at?: string;
          expires_at: string;
          redeemed_at?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          provider_checkout_session_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          coupon_id?: string;
          profile_id?: string;
          wallet_transaction_id?: string;
          bonus_wallet_transaction_id?: string | null;
          paid_amount_cents?: number;
          bonus_amount_cents?: number;
          code_snapshot?: string;
          first_top_up_only?: boolean;
          rules_snapshot?: Json;
          status?: "pending" | "redeemed" | "cancelled" | "expired";
          reserved_at?: string;
          expires_at?: string;
          redeemed_at?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          provider_checkout_session_id?: string | null;
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
        Insert: {
          id?: string;
          wallet_id: string;
          profile_id: string;
          type: "top_up" | "lead_purchase" | "refund" | "adjustment";
          status?: "pending" | "completed" | "failed" | "cancelled";
          amount_cents: number;
          balance_after_cents?: number | null;
          description?: string | null;
          provider?: string | null;
          provider_reference?: string | null;
          lead_purchase_id?: string | null;
          metadata?: Json;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          profile_id?: string;
          type?: "top_up" | "lead_purchase" | "refund" | "adjustment";
          status?: "pending" | "completed" | "failed" | "cancelled";
          amount_cents?: number;
          balance_after_cents?: number | null;
          description?: string | null;
          provider?: string | null;
          provider_reference?: string | null;
          lead_purchase_id?: string | null;
          metadata?: Json;
          created_at?: string;
          completed_at?: string | null;
        };
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
          sold_at: string | null;
          sold_visible_until: string | null;
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
          sold_at?: string | null;
          sold_visible_until?: string | null;
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
          sold_at?: string | null;
          sold_visible_until?: string | null;
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
        Insert: {
          id?: string;
          lead_id: string;
          property_manager_id: string;
          purchase_attempt_id?: string | null;
          mode: "shared" | "exclusive";
          amount_cents: number;
          status?:
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
          unlocked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          property_manager_id?: string;
          purchase_attempt_id?: string | null;
          mode?: "shared" | "exclusive";
          amount_cents?: number;
          status?:
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
          unlocked_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      consume_public_form_rate_limit: {
        Args: {
          p_fingerprint_hash: string;
          p_limit?: number;
          p_window_seconds?: number;
        };
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      get_admin_business_analytics: {
        Args: {
          p_from_date: string;
          p_to_date: string;
          p_previous_from_date: string;
          p_previous_to_date: string;
          p_bucket?: "day" | "month";
        };
        Returns: Json;
      };
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
      enqueue_brevo_outbox_event: {
        Args: {
          p_profile_id: string;
          p_event_type: string;
          p_event_key: string;
          p_payload?: Json;
        };
        Returns: string;
      };
      refresh_pm_brevo_snapshot: {
        Args: {
          p_profile_id: string;
        };
        Returns: Database["public"]["Tables"]["pm_brevo_snapshots"]["Row"];
      };
      record_pm_marketing_consent: {
        Args: {
          p_profile_id: string;
          p_status: Database["public"]["Enums"]["pm_marketing_consent_status"];
          p_source: string;
          p_policy_version: string;
          p_external_event_id?: string | null;
          p_evidence?: Json;
        };
        Returns: Database["public"]["Tables"]["pm_marketing_preferences"]["Row"];
      };
      claim_brevo_outbox: {
        Args: {
          p_worker_id: string;
          p_batch_size?: number;
        };
        Returns: Database["public"]["Tables"]["brevo_outbox"]["Row"][];
      };
      requeue_stale_brevo_outbox: {
        Args: {
          p_stale_after?: string;
        };
        Returns: number;
      };
      queue_brevo_reconciliation: {
        Args: Record<string, never>;
        Returns: number;
      };
      queue_service_email_campaign: {
        Args: {
          p_campaign_id: string;
        };
        Returns: number;
      };
      requeue_stale_service_email_recipients: {
        Args: {
          p_stale_after?: string;
        };
        Returns: number;
      };
      claim_service_email_recipients: {
        Args: {
          p_worker_id: string;
          p_batch_size?: number;
        };
        Returns: Database["public"]["Tables"]["service_email_recipients"]["Row"][];
      };
      refresh_service_email_campaign: {
        Args: {
          p_campaign_id: string;
        };
        Returns: Database["public"]["Tables"]["service_email_campaigns"]["Row"];
      };
      complete_service_email_batch: {
        Args: {
          p_campaign_id: string;
          p_results: Json;
        };
        Returns: Database["public"]["Tables"]["service_email_campaigns"]["Row"];
      };
      fail_service_email_batch: {
        Args: {
          p_campaign_id: string;
          p_recipient_ids: string[];
          p_error: string;
          p_max_attempts?: number;
        };
        Returns: Database["public"]["Tables"]["service_email_campaigns"]["Row"];
      };
    };
    Enums: {
      billing_invoice_status:
        | "pending"
        | "generating"
        | "ready"
        | "downloaded"
        | "imported"
        | "sent"
        | "error"
        | "cancelled";
      pm_marketing_consent_status: "granted" | "not_granted" | "withdrawn";
      brevo_outbox_status:
        | "pending"
        | "processing"
        | "retry"
        | "completed"
        | "dead_letter"
        | "cancelled";
    };
    CompositeTypes: Record<string, never>;
  };
};
