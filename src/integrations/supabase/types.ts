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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_connection_purposes: {
        Row: {
          device_id: string | null
          group_id: string | null
          group_name: string | null
          id: string
          label: string
          purpose: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          device_id?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          label: string
          purpose: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          device_id?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          label?: string
          purpose?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_connection_purposes_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_costs: {
        Row: {
          admin_id: string
          amount: number
          category: string
          cost_date: string
          created_at: string
          description: string | null
          id: string
        }
        Insert: {
          admin_id: string
          amount?: number
          category?: string
          cost_date?: string
          created_at?: string
          description?: string | null
          id?: string
        }
        Update: {
          admin_id?: string
          amount?: number
          category?: string
          cost_date?: string
          created_at?: string
          description?: string | null
          id?: string
        }
        Relationships: []
      }
      admin_dispatch_contacts: {
        Row: {
          created_at: string
          dispatch_id: string
          error_message: string | null
          id: string
          name: string
          phone: string
          sent_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          dispatch_id: string
          error_message?: string | null
          id?: string
          name?: string
          phone: string
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          dispatch_id?: string
          error_message?: string | null
          id?: string
          name?: string
          phone?: string
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_dispatch_contacts_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "admin_dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_dispatch_templates: {
        Row: {
          admin_id: string
          buttons: Json
          category: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          media_url: string | null
          name: string
          updated_at: string
          variables: Json
        }
        Insert: {
          admin_id: string
          buttons?: Json
          category?: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          media_url?: string | null
          name: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          admin_id?: string
          buttons?: Json
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          media_url?: string | null
          name?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      admin_dispatches: {
        Row: {
          admin_id: string
          completed_at: string | null
          connection_purpose: string
          created_at: string
          device_id: string | null
          failed_count: number
          id: string
          last_error: string | null
          max_delay_seconds: number
          message_content: string
          min_delay_seconds: number
          name: string
          pause_duration_max: number
          pause_duration_min: number
          pause_every_max: number
          pause_every_min: number
          sent_count: number
          started_at: string | null
          status: string
          total_contacts: number
          updated_at: string
        }
        Insert: {
          admin_id: string
          completed_at?: string | null
          connection_purpose?: string
          created_at?: string
          device_id?: string | null
          failed_count?: number
          id?: string
          last_error?: string | null
          max_delay_seconds?: number
          message_content: string
          min_delay_seconds?: number
          name?: string
          pause_duration_max?: number
          pause_duration_min?: number
          pause_every_max?: number
          pause_every_min?: number
          sent_count?: number
          started_at?: string | null
          status?: string
          total_contacts?: number
          updated_at?: string
        }
        Update: {
          admin_id?: string
          completed_at?: string | null
          connection_purpose?: string
          created_at?: string
          device_id?: string | null
          failed_count?: number
          id?: string
          last_error?: string | null
          max_delay_seconds?: number
          message_content?: string
          min_delay_seconds?: number
          name?: string
          pause_duration_max?: number
          pause_duration_min?: number
          pause_every_max?: number
          pause_every_min?: number
          sent_count?: number
          started_at?: string | null
          status?: string
          total_contacts?: number
          updated_at?: string
        }
        Relationships: []
      }
      admin_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: string | null
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: string | null
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: string | null
          id?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_profile_data: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          risk_flag: boolean
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id: string
          risk_flag?: boolean
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          risk_flag?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          created_at: string
          id: string
          instance_id: string | null
          instance_name: string | null
          message_rendered: string
          payload_json: Json | null
          phone_number: string | null
          resolved: boolean
          resolved_at: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          type: Database["public"]["Enums"]["alert_type"]
          user_id: string
          whatsapp_error: string | null
          whatsapp_group_id: string | null
          whatsapp_sent: boolean
          whatsapp_sent_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          message_rendered: string
          payload_json?: Json | null
          phone_number?: string | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          type: Database["public"]["Enums"]["alert_type"]
          user_id: string
          whatsapp_error?: string | null
          whatsapp_group_id?: string | null
          whatsapp_sent?: boolean
          whatsapp_sent_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          message_rendered?: string
          payload_json?: Json | null
          phone_number?: string | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          type?: Database["public"]["Enums"]["alert_type"]
          user_id?: string
          whatsapp_error?: string | null
          whatsapp_group_id?: string | null
          whatsapp_sent?: boolean
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          id: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          admin_id: string
          allow_close: boolean
          allow_dismiss: boolean
          button_action: string
          button_link: string | null
          button_text: string
          created_at: string
          description: string
          display_mode: string
          end_date: string | null
          id: string
          image_url: string | null
          internal_name: string
          is_active: boolean
          show_logo: boolean
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          admin_id: string
          allow_close?: boolean
          allow_dismiss?: boolean
          button_action?: string
          button_link?: string | null
          button_text?: string
          created_at?: string
          description?: string
          display_mode?: string
          end_date?: string | null
          id?: string
          image_url?: string | null
          internal_name?: string
          is_active?: boolean
          show_logo?: boolean
          start_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          admin_id?: string
          allow_close?: boolean
          allow_dismiss?: boolean
          button_action?: string
          button_link?: string | null
          button_text?: string
          created_at?: string
          description?: string
          display_mode?: string
          end_date?: string | null
          id?: string
          image_url?: string | null
          internal_name?: string
          is_active?: boolean
          show_logo?: boolean
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      auto_message_templates: {
        Row: {
          buttons: Json
          content: string
          id: string
          is_active: boolean
          label: string
          message_type: string
          updated_at: string
          updated_by: string | null
          variables: Json
        }
        Insert: {
          buttons?: Json
          content?: string
          id?: string
          is_active?: boolean
          label: string
          message_type: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Update: {
          buttons?: Json
          content?: string
          id?: string
          is_active?: boolean
          label?: string
          message_type?: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Relationships: []
      }
      autoreply_flows: {
        Row: {
          created_at: string
          device_id: string | null
          edges: Json
          id: string
          is_active: boolean
          name: string
          nodes: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          edges?: Json
          id?: string
          is_active?: boolean
          name?: string
          nodes?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          edges?: Json
          id?: string
          is_active?: boolean
          name?: string
          nodes?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autoreply_flows_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      autoreply_sessions: {
        Row: {
          contact_phone: string
          created_at: string
          current_node_id: string
          device_id: string
          flow_id: string
          id: string
          last_message_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_phone: string
          created_at?: string
          current_node_id: string
          device_id: string
          flow_id: string
          id?: string
          last_message_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_phone?: string
          created_at?: string
          current_node_id?: string
          device_id?: string
          flow_id?: string
          id?: string
          last_message_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autoreply_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autoreply_sessions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "autoreply_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contacts: {
        Row: {
          campaign_id: string
          contact_id: string | null
          created_at: string
          device_id: string | null
          error_message: string | null
          id: string
          name: string | null
          phone: string
          sent_at: string | null
          status: string
          var1: string | null
          var10: string | null
          var2: string | null
          var3: string | null
          var4: string | null
          var5: string | null
          var6: string | null
          var7: string | null
          var8: string | null
          var9: string | null
        }
        Insert: {
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          name?: string | null
          phone: string
          sent_at?: string | null
          status?: string
          var1?: string | null
          var10?: string | null
          var2?: string | null
          var3?: string | null
          var4?: string | null
          var5?: string | null
          var6?: string | null
          var7?: string | null
          var8?: string | null
          var9?: string | null
        }
        Update: {
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          name?: string | null
          phone?: string
          sent_at?: string | null
          status?: string
          var1?: string | null
          var10?: string | null
          var2?: string | null
          var3?: string | null
          var4?: string | null
          var5?: string | null
          var6?: string | null
          var7?: string | null
          var8?: string | null
          var9?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_device_locks: {
        Row: {
          acquired_at: string
          campaign_id: string
          device_id: string
          heartbeat_at: string
          id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          campaign_id: string
          device_id: string
          heartbeat_at?: string
          id?: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          campaign_id?: string
          device_id?: string
          heartbeat_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_device_locks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          buttons: Json | null
          completed_at: string | null
          created_at: string
          delivered_count: number | null
          device_id: string | null
          device_ids: Json | null
          failed_count: number | null
          id: string
          max_delay_seconds: number
          media_url: string | null
          message_content: string | null
          message_type: string
          messages_per_instance: number | null
          min_delay_seconds: number
          name: string
          pause_duration_max: number
          pause_duration_min: number
          pause_every_max: number
          pause_every_min: number
          pause_on_disconnect: boolean
          scheduled_at: string | null
          sent_count: number | null
          started_at: string | null
          status: string
          template_id: string | null
          total_contacts: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          buttons?: Json | null
          completed_at?: string | null
          created_at?: string
          delivered_count?: number | null
          device_id?: string | null
          device_ids?: Json | null
          failed_count?: number | null
          id?: string
          max_delay_seconds?: number
          media_url?: string | null
          message_content?: string | null
          message_type?: string
          messages_per_instance?: number | null
          min_delay_seconds?: number
          name: string
          pause_duration_max?: number
          pause_duration_min?: number
          pause_every_max?: number
          pause_every_min?: number
          pause_on_disconnect?: boolean
          scheduled_at?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string
          template_id?: string | null
          total_contacts?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          buttons?: Json | null
          completed_at?: string | null
          created_at?: string
          delivered_count?: number | null
          device_id?: string | null
          device_ids?: Json | null
          failed_count?: number | null
          id?: string
          max_delay_seconds?: number
          media_url?: string | null
          message_content?: string | null
          message_type?: string
          messages_per_instance?: number | null
          min_delay_seconds?: number
          name?: string
          pause_duration_max?: number
          pause_duration_min?: number
          pause_every_max?: number
          pause_every_min?: number
          pause_on_disconnect?: boolean
          scheduled_at?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string
          template_id?: string | null
          total_contacts?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_conversation_logs: {
        Row: {
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          message_category: string
          message_content: string
          receiver_device_id: string
          receiver_name: string | null
          sender_device_id: string
          sender_name: string | null
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_category?: string
          message_content: string
          receiver_device_id: string
          receiver_name?: string | null
          sender_device_id: string
          sender_name?: string | null
          sent_at?: string
          status?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_category?: string
          message_content?: string
          receiver_device_id?: string
          receiver_name?: string | null
          sender_device_id?: string
          sender_name?: string | null
          sent_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chip_conversation_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chip_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_conversations: {
        Row: {
          active_days: Json
          completed_at: string | null
          created_at: string
          device_ids: Json
          duration_hours: number
          duration_minutes: number
          end_hour: string
          id: string
          last_error: string | null
          max_delay_seconds: number
          messages_per_cycle_max: number
          messages_per_cycle_min: number
          min_delay_seconds: number
          name: string
          pause_after_messages_max: number
          pause_after_messages_min: number
          pause_duration_max: number
          pause_duration_min: number
          start_hour: string
          started_at: string | null
          status: string
          total_messages_sent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active_days?: Json
          completed_at?: string | null
          created_at?: string
          device_ids?: Json
          duration_hours?: number
          duration_minutes?: number
          end_hour?: string
          id?: string
          last_error?: string | null
          max_delay_seconds?: number
          messages_per_cycle_max?: number
          messages_per_cycle_min?: number
          min_delay_seconds?: number
          name?: string
          pause_after_messages_max?: number
          pause_after_messages_min?: number
          pause_duration_max?: number
          pause_duration_min?: number
          start_hour?: string
          started_at?: string | null
          status?: string
          total_messages_sent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active_days?: Json
          completed_at?: string | null
          created_at?: string
          device_ids?: Json
          duration_hours?: number
          duration_minutes?: number
          end_hour?: string
          id?: string
          last_error?: string | null
          max_delay_seconds?: number
          messages_per_cycle_max?: number
          messages_per_cycle_min?: number
          min_delay_seconds?: number
          name?: string
          pause_after_messages_max?: number
          pause_after_messages_min?: number
          pause_duration_max?: number
          pause_duration_min?: number
          start_hour?: string
          started_at?: string | null
          status?: string
          total_messages_sent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_messages: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          message_content: string
          observation: string | null
          sent_at: string
          template_type: string
          user_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          message_content: string
          observation?: string | null
          sent_at?: string
          template_type: string
          user_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          message_content?: string
          observation?: string | null
          sent_at?: string
          template_type?: string
          user_id?: string
        }
        Relationships: []
      }
      community_pairs: {
        Row: {
          closed_at: string | null
          created_at: string
          cycle_id: string
          id: string
          instance_id_a: string
          instance_id_b: string
          meta: Json | null
          status: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          cycle_id: string
          id?: string
          instance_id_a: string
          instance_id_b: string
          meta?: Json | null
          status?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          cycle_id?: string
          id?: string
          instance_id_a?: string
          instance_id_b?: string
          meta?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_pairs_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "warmup_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_pairs_instance_id_a_fkey"
            columns: ["instance_id_a"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_pairs_instance_id_b_fkey"
            columns: ["instance_id_b"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      community_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      community_warmup_configs: {
        Row: {
          active_days: Json
          created_at: string
          daily_limit: number
          device_id: string
          end_hour: string
          id: string
          intensity: string
          interactions_today: number
          is_active: boolean
          last_daily_reset_at: string | null
          last_interaction_at: string | null
          max_delay_seconds: number
          min_delay_seconds: number
          pause_after_messages_max: number
          pause_after_messages_min: number
          pause_duration_max: number
          pause_duration_min: number
          start_hour: string
          status: string
          status_message: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_days?: Json
          created_at?: string
          daily_limit?: number
          device_id: string
          end_hour?: string
          id?: string
          intensity?: string
          interactions_today?: number
          is_active?: boolean
          last_daily_reset_at?: string | null
          last_interaction_at?: string | null
          max_delay_seconds?: number
          min_delay_seconds?: number
          pause_after_messages_max?: number
          pause_after_messages_min?: number
          pause_duration_max?: number
          pause_duration_min?: number
          start_hour?: string
          status?: string
          status_message?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_days?: Json
          created_at?: string
          daily_limit?: number
          device_id?: string
          end_hour?: string
          id?: string
          intensity?: string
          interactions_today?: number
          is_active?: boolean
          last_daily_reset_at?: string | null
          last_interaction_at?: string | null
          max_delay_seconds?: number
          min_delay_seconds?: number
          pause_after_messages_max?: number
          pause_after_messages_min?: number
          pause_duration_max?: number
          pause_duration_min?: number
          start_hour?: string
          status?: string
          status_message?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_warmup_configs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      community_warmup_logs: {
        Row: {
          config_id: string
          created_at: string
          delay_applied_seconds: number | null
          device_id: string
          error_message: string | null
          event_type: string
          id: string
          intensity: string | null
          interaction_type: string | null
          message_preview: string | null
          partner_device_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          config_id: string
          created_at?: string
          delay_applied_seconds?: number | null
          device_id: string
          error_message?: string | null
          event_type: string
          id?: string
          intensity?: string | null
          interaction_type?: string | null
          message_preview?: string | null
          partner_device_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          config_id?: string
          created_at?: string
          delay_applied_seconds?: number | null
          device_id?: string
          error_message?: string | null
          event_type?: string
          id?: string
          intensity?: string | null
          interaction_type?: string | null
          message_preview?: string | null
          partner_device_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_warmup_logs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "community_warmup_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_warmup_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string
          tags: string[] | null
          updated_at: string
          user_id: string
          var1: string
          var10: string
          var2: string
          var3: string
          var4: string
          var5: string
          var6: string
          var7: string
          var8: string
          var9: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
          var1?: string
          var10?: string
          var2?: string
          var3?: string
          var4?: string
          var5?: string
          var6?: string
          var7?: string
          var8?: string
          var9?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
          var1?: string
          var10?: string
          var2?: string
          var3?: string
          var4?: string
          var5?: string
          var6?: string
          var7?: string
          var8?: string
          var9?: string
        }
        Relationships: []
      }
      delay_profiles: {
        Row: {
          created_at: string
          id: string
          max_delay_seconds: number
          min_delay_seconds: number
          name: string
          pause_duration_max: number
          pause_duration_min: number
          pause_every_max: number
          pause_every_min: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_delay_seconds?: number
          min_delay_seconds?: number
          name: string
          pause_duration_max?: number
          pause_duration_min?: number
          pause_every_max?: number
          pause_every_min?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_delay_seconds?: number
          min_delay_seconds?: number
          name?: string
          pause_duration_max?: number
          pause_duration_min?: number
          pause_every_max?: number
          pause_every_min?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          created_at: string
          id: string
          instance_type: string
          login_type: string
          name: string
          number: string | null
          profile_name: string | null
          profile_picture: string | null
          proxy_id: string | null
          status: string
          uazapi_base_url: string | null
          uazapi_token: string | null
          updated_at: string
          user_id: string
          whapi_token: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          instance_type?: string
          login_type?: string
          name: string
          number?: string | null
          profile_name?: string | null
          profile_picture?: string | null
          proxy_id?: string | null
          status?: string
          uazapi_base_url?: string | null
          uazapi_token?: string | null
          updated_at?: string
          user_id: string
          whapi_token?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          instance_type?: string
          login_type?: string
          name?: string
          number?: string | null
          profile_name?: string | null
          profile_picture?: string | null
          proxy_id?: string | null
          status?: string
          uazapi_base_url?: string | null
          uazapi_token?: string | null
          updated_at?: string
          user_id?: string
          whapi_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_proxy_id_fkey"
            columns: ["proxy_id"]
            isOneToOne: false
            referencedRelation: "proxies"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_controls: {
        Row: {
          feature_description: string
          feature_icon: string
          feature_key: string
          feature_name: string
          id: string
          maintenance_message: string | null
          route_path: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          feature_description?: string
          feature_icon?: string
          feature_key: string
          feature_name: string
          id?: string
          maintenance_message?: string | null
          route_path?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          feature_description?: string
          feature_icon?: string
          feature_key?: string
          feature_name?: string
          id?: string
          maintenance_message?: string | null
          route_path?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      group_interaction_logs: {
        Row: {
          created_at: string
          device_id: string | null
          error_message: string | null
          group_id: string
          group_name: string | null
          id: string
          interaction_id: string
          message_category: string
          message_content: string
          pause_applied_seconds: number | null
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          group_id: string
          group_name?: string | null
          id?: string
          interaction_id: string
          message_category?: string
          message_content: string
          pause_applied_seconds?: number | null
          sent_at?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          group_id?: string
          group_name?: string | null
          id?: string
          interaction_id?: string
          message_category?: string
          message_content?: string
          pause_applied_seconds?: number | null
          sent_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_interaction_logs_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "group_interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      group_interactions: {
        Row: {
          active_days: Json
          completed_at: string | null
          created_at: string
          daily_limit_per_group: number
          daily_limit_total: number
          device_id: string | null
          duration_hours: number
          duration_minutes: number
          end_hour: string
          group_ids: Json
          id: string
          last_error: string | null
          max_delay_seconds: number
          messages_per_cycle_max: number
          messages_per_cycle_min: number
          min_delay_seconds: number
          name: string
          pause_after_messages_max: number
          pause_after_messages_min: number
          pause_duration_max: number
          pause_duration_min: number
          start_hour: string
          started_at: string | null
          status: string
          total_messages_sent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active_days?: Json
          completed_at?: string | null
          created_at?: string
          daily_limit_per_group?: number
          daily_limit_total?: number
          device_id?: string | null
          duration_hours?: number
          duration_minutes?: number
          end_hour?: string
          group_ids?: Json
          id?: string
          last_error?: string | null
          max_delay_seconds?: number
          messages_per_cycle_max?: number
          messages_per_cycle_min?: number
          min_delay_seconds?: number
          name?: string
          pause_after_messages_max?: number
          pause_after_messages_min?: number
          pause_duration_max?: number
          pause_duration_min?: number
          start_hour?: string
          started_at?: string | null
          status?: string
          total_messages_sent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active_days?: Json
          completed_at?: string | null
          created_at?: string
          daily_limit_per_group?: number
          daily_limit_total?: number
          device_id?: string | null
          duration_hours?: number
          duration_minutes?: number
          end_hour?: string
          group_ids?: Json
          id?: string
          last_error?: string | null
          max_delay_seconds?: number
          messages_per_cycle_max?: number
          messages_per_cycle_min?: number
          min_delay_seconds?: number
          name?: string
          pause_after_messages_max?: number
          pause_after_messages_min?: number
          pause_duration_max?: number
          pause_duration_min?: number
          start_hour?: string
          started_at?: string | null
          status?: string
          total_messages_sent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_interactions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      group_join_campaigns: {
        Row: {
          already_member_count: number
          completed_at: string | null
          created_at: string
          description: string | null
          device_ids: Json
          error_count: number
          group_links: Json
          id: string
          max_delay: number
          min_delay: number
          name: string
          pause_duration: number | null
          pause_every: number | null
          started_at: string
          status: string
          success_count: number
          total_items: number
          updated_at: string
          user_id: string
        }
        Insert: {
          already_member_count?: number
          completed_at?: string | null
          created_at?: string
          description?: string | null
          device_ids?: Json
          error_count?: number
          group_links?: Json
          id?: string
          max_delay?: number
          min_delay?: number
          name?: string
          pause_duration?: number | null
          pause_every?: number | null
          started_at?: string
          status?: string
          success_count?: number
          total_items?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          already_member_count?: number
          completed_at?: string | null
          created_at?: string
          description?: string | null
          device_ids?: Json
          error_count?: number
          group_links?: Json
          id?: string
          max_delay?: number
          min_delay?: number
          name?: string
          pause_duration?: number | null
          pause_every?: number | null
          started_at?: string
          status?: string
          success_count?: number
          total_items?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      group_join_logs: {
        Row: {
          attempt: number
          created_at: string
          device_id: string
          device_name: string
          duration_ms: number | null
          endpoint_called: string | null
          error_message: string | null
          group_link: string
          group_name: string
          id: string
          invite_code: string
          request_summary: string | null
          response_body: string | null
          response_status: number | null
          result: string
          user_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          device_id: string
          device_name?: string
          duration_ms?: number | null
          endpoint_called?: string | null
          error_message?: string | null
          group_link?: string
          group_name?: string
          id?: string
          invite_code?: string
          request_summary?: string | null
          response_body?: string | null
          response_status?: number | null
          result?: string
          user_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          device_id?: string
          device_name?: string
          duration_ms?: number | null
          endpoint_called?: string | null
          error_message?: string | null
          group_link?: string
          group_name?: string
          id?: string
          invite_code?: string
          request_summary?: string | null
          response_body?: string | null
          response_status?: number | null
          result?: string
          user_id?: string
        }
        Relationships: []
      }
      group_join_queue: {
        Row: {
          attempt: number
          campaign_id: string
          created_at: string
          device_id: string
          device_name: string
          error_message: string | null
          group_link: string
          group_name: string
          id: string
          processed_at: string | null
          response_status: number | null
          status: string
          user_id: string
        }
        Insert: {
          attempt?: number
          campaign_id: string
          created_at?: string
          device_id: string
          device_name?: string
          error_message?: string | null
          group_link: string
          group_name?: string
          id?: string
          processed_at?: string | null
          response_status?: number | null
          status?: string
          user_id: string
        }
        Update: {
          attempt?: number
          campaign_id?: string
          created_at?: string
          device_id?: string
          device_name?: string
          error_message?: string | null
          group_link?: string
          group_name?: string
          id?: string
          processed_at?: string | null
          response_status?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "group_join_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      message_queue: {
        Row: {
          client_email: string
          client_name: string
          client_phone: string | null
          created_at: string
          error_message: string | null
          expires_at: string | null
          id: string
          message_content: string | null
          message_type: Database["public"]["Enums"]["message_queue_type"]
          plan_name: string
          sent_at: string | null
          status: Database["public"]["Enums"]["message_queue_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          client_email?: string
          client_name?: string
          client_phone?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string | null
          id?: string
          message_content?: string | null
          message_type: Database["public"]["Enums"]["message_queue_type"]
          plan_name?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_queue_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          client_email?: string
          client_name?: string
          client_phone?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string | null
          id?: string
          message_content?: string | null
          message_type?: Database["public"]["Enums"]["message_queue_type"]
          plan_name?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_queue_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      operation_logs: {
        Row: {
          created_at: string
          details: string | null
          device_id: string | null
          event: string
          id: string
          meta: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          device_id?: string | null
          event: string
          id?: string
          meta?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          details?: string | null
          device_id?: string | null
          event?: string
          id?: string
          meta?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          admin_id: string
          amount: number
          created_at: string
          discount: number
          fee: number
          id: string
          method: string
          notes: string | null
          paid_at: string
          user_id: string
        }
        Insert: {
          admin_id: string
          amount?: number
          created_at?: string
          discount?: number
          fee?: number
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          user_id: string
        }
        Update: {
          admin_id?: string
          amount?: number
          created_at?: string
          discount?: number
          fee?: number
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          admin_notes: string | null
          avatar_url: string | null
          client_type: string
          company: string | null
          created_at: string
          document: string | null
          full_name: string | null
          id: string
          instance_override: number
          notificacao_liberada: boolean
          phone: string | null
          risk_flag: boolean
          status: string
          updated_at: string
          whatsapp_monitor_token: string | null
        }
        Insert: {
          admin_notes?: string | null
          avatar_url?: string | null
          client_type?: string
          company?: string | null
          created_at?: string
          document?: string | null
          full_name?: string | null
          id: string
          instance_override?: number
          notificacao_liberada?: boolean
          phone?: string | null
          risk_flag?: boolean
          status?: string
          updated_at?: string
          whatsapp_monitor_token?: string | null
        }
        Update: {
          admin_notes?: string | null
          avatar_url?: string | null
          client_type?: string
          company?: string | null
          created_at?: string
          document?: string | null
          full_name?: string | null
          id?: string
          instance_override?: number
          notificacao_liberada?: boolean
          phone?: string | null
          risk_flag?: boolean
          status?: string
          updated_at?: string
          whatsapp_monitor_token?: string | null
        }
        Relationships: []
      }
      proxies: {
        Row: {
          active: boolean
          created_at: string
          display_id: number
          host: string
          id: string
          password: string
          port: string
          status: string
          type: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_id?: number
          host: string
          id?: string
          password: string
          port: string
          status?: string
          type?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_id?: number
          host?: string
          id?: string
          password?: string
          port?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      report_wa_configs: {
        Row: {
          alert_campaign_end: boolean
          alert_disconnect: boolean
          alert_high_failures: boolean
          campaigns_group_id: string | null
          campaigns_group_name: string | null
          connected_phone: string | null
          connection_group_id: string | null
          connection_group_name: string | null
          connection_status: string
          created_at: string
          device_id: string | null
          frequency: string
          group_id: string | null
          group_name: string | null
          id: string
          toggle_campaigns: boolean
          toggle_instances: boolean
          toggle_warmup: boolean
          updated_at: string
          user_id: string
          warmup_group_id: string | null
          warmup_group_name: string | null
        }
        Insert: {
          alert_campaign_end?: boolean
          alert_disconnect?: boolean
          alert_high_failures?: boolean
          campaigns_group_id?: string | null
          campaigns_group_name?: string | null
          connected_phone?: string | null
          connection_group_id?: string | null
          connection_group_name?: string | null
          connection_status?: string
          created_at?: string
          device_id?: string | null
          frequency?: string
          group_id?: string | null
          group_name?: string | null
          id?: string
          toggle_campaigns?: boolean
          toggle_instances?: boolean
          toggle_warmup?: boolean
          updated_at?: string
          user_id: string
          warmup_group_id?: string | null
          warmup_group_name?: string | null
        }
        Update: {
          alert_campaign_end?: boolean
          alert_disconnect?: boolean
          alert_high_failures?: boolean
          campaigns_group_id?: string | null
          campaigns_group_name?: string | null
          connected_phone?: string | null
          connection_group_id?: string | null
          connection_group_name?: string | null
          connection_status?: string
          created_at?: string
          device_id?: string | null
          frequency?: string
          group_id?: string | null
          group_name?: string | null
          id?: string
          toggle_campaigns?: boolean
          toggle_instances?: boolean
          toggle_warmup?: boolean
          updated_at?: string
          user_id?: string
          warmup_group_id?: string | null
          warmup_group_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_wa_configs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      report_wa_logs: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_cycles: {
        Row: {
          created_at: string
          cycle_amount: number
          cycle_end: string
          cycle_start: string
          id: string
          notes: string | null
          plan_name: string
          status: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_amount?: number
          cycle_end?: string
          cycle_start?: string
          id?: string
          notes?: string | null
          plan_name: string
          status?: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_amount?: number
          cycle_end?: string
          cycle_start?: string
          id?: string
          notes?: string | null
          plan_name?: string
          status?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_cycles_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          max_instances: number
          plan_name: string
          plan_price: number
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          max_instances?: number
          plan_name?: string
          plan_price?: number
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          max_instances?: number
          plan_name?: string
          plan_price?: number
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          buttons: Json | null
          content: string
          created_at: string
          id: string
          media_url: string | null
          name: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          buttons?: Json | null
          content: string
          created_at?: string
          id?: string
          media_url?: string | null
          name: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          buttons?: Json | null
          content?: string
          created_at?: string
          id?: string
          media_url?: string | null
          name?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_api_tokens: {
        Row: {
          admin_id: string
          assigned_at: string | null
          created_at: string
          device_id: string | null
          healthy: boolean | null
          id: string
          label: string | null
          last_checked_at: string | null
          status: string
          token: string
          user_id: string
        }
        Insert: {
          admin_id: string
          assigned_at?: string | null
          created_at?: string
          device_id?: string | null
          healthy?: boolean | null
          id?: string
          label?: string | null
          last_checked_at?: string | null
          status?: string
          token: string
          user_id: string
        }
        Update: {
          admin_id?: string
          assigned_at?: string | null
          created_at?: string
          device_id?: string | null
          healthy?: boolean | null
          id?: string
          label?: string | null
          last_checked_at?: string | null
          status?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_api_tokens_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warmup_audit_logs: {
        Row: {
          created_at: string
          cycle_id: string | null
          device_id: string
          event_type: string
          id: string
          level: Database["public"]["Enums"]["warmup_log_level"]
          message: string
          meta: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_id?: string | null
          device_id: string
          event_type: string
          id?: string
          level?: Database["public"]["Enums"]["warmup_log_level"]
          message?: string
          meta?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_id?: string | null
          device_id?: string
          event_type?: string
          id?: string
          level?: Database["public"]["Enums"]["warmup_log_level"]
          message?: string
          meta?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_audit_logs_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "warmup_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_autosave_contacts: {
        Row: {
          contact_name: string
          contact_status: string
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          phone_e164: string
          tags: string | null
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          contact_name?: string
          contact_status?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          phone_e164: string
          tags?: string | null
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          contact_name?: string
          contact_status?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          phone_e164?: string
          tags?: string | null
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      warmup_community_membership: {
        Row: {
          created_at: string
          cycle_id: string | null
          device_id: string
          disabled_at: string | null
          enabled_at: string | null
          id: string
          is_eligible: boolean
          is_enabled: boolean
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_id?: string | null
          device_id: string
          disabled_at?: string | null
          enabled_at?: string | null
          id?: string
          is_eligible?: boolean
          is_enabled?: boolean
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_id?: string | null
          device_id?: string
          disabled_at?: string | null
          enabled_at?: string | null
          id?: string
          is_eligible?: boolean
          is_enabled?: boolean
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_community_membership_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "warmup_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_community_membership_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_cycles: {
        Row: {
          chip_state: Database["public"]["Enums"]["warmup_chip_state"]
          created_at: string
          daily_interaction_budget_max: number
          daily_interaction_budget_min: number
          daily_interaction_budget_target: number
          daily_interaction_budget_used: number
          daily_unique_recipients_cap: number
          daily_unique_recipients_used: number
          day_index: number
          days_total: number
          device_id: string
          first_24h_ends_at: string
          group_source: string
          id: string
          is_running: boolean
          last_daily_reset_at: string | null
          last_error: string | null
          next_run_at: string | null
          phase: Database["public"]["Enums"]["warmup_phase"]
          plan_id: string | null
          previous_phase: string | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chip_state?: Database["public"]["Enums"]["warmup_chip_state"]
          created_at?: string
          daily_interaction_budget_max?: number
          daily_interaction_budget_min?: number
          daily_interaction_budget_target?: number
          daily_interaction_budget_used?: number
          daily_unique_recipients_cap?: number
          daily_unique_recipients_used?: number
          day_index?: number
          days_total?: number
          device_id: string
          first_24h_ends_at?: string
          group_source?: string
          id?: string
          is_running?: boolean
          last_daily_reset_at?: string | null
          last_error?: string | null
          next_run_at?: string | null
          phase?: Database["public"]["Enums"]["warmup_phase"]
          plan_id?: string | null
          previous_phase?: string | null
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chip_state?: Database["public"]["Enums"]["warmup_chip_state"]
          created_at?: string
          daily_interaction_budget_max?: number
          daily_interaction_budget_min?: number
          daily_interaction_budget_target?: number
          daily_interaction_budget_used?: number
          daily_unique_recipients_cap?: number
          daily_unique_recipients_used?: number
          day_index?: number
          days_total?: number
          device_id?: string
          first_24h_ends_at?: string
          group_source?: string
          id?: string
          is_running?: boolean
          last_daily_reset_at?: string | null
          last_error?: string | null
          next_run_at?: string | null
          phase?: Database["public"]["Enums"]["warmup_phase"]
          plan_id?: string | null
          previous_phase?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_cycles_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_cycles_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "warmup_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_daily_stats: {
        Row: {
          created_at: string
          device_id: string
          id: string
          messages_failed: number
          messages_sent: number
          messages_total: number
          stat_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          messages_failed?: number
          messages_sent?: number
          messages_total?: number
          stat_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          messages_failed?: number
          messages_sent?: number
          messages_total?: number
          stat_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      warmup_folder_devices: {
        Row: {
          created_at: string
          device_id: string
          folder_id: string
          id: string
          tags: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          folder_id: string
          id?: string
          tags?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          folder_id?: string
          id?: string
          tags?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_folder_devices_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_folder_devices_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "warmup_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_folders: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          sort_order: number
          tags: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          sort_order?: number
          tags?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          tags?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      warmup_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_custom: boolean
          link: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_custom?: boolean
          link: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_custom?: boolean
          link?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      warmup_groups_pool: {
        Row: {
          created_at: string
          external_group_ref: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_group_ref?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_group_ref?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      warmup_instance_groups: {
        Row: {
          created_at: string
          cycle_id: string | null
          device_id: string
          group_id: string
          group_jid: string | null
          group_name: string | null
          id: string
          invite_link: string | null
          join_status: Database["public"]["Enums"]["warmup_group_join_status"]
          joined_at: string | null
          last_error: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_id?: string | null
          device_id: string
          group_id: string
          group_jid?: string | null
          group_name?: string | null
          id?: string
          invite_link?: string | null
          join_status?: Database["public"]["Enums"]["warmup_group_join_status"]
          joined_at?: string | null
          last_error?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_id?: string | null
          device_id?: string
          group_id?: string
          group_jid?: string | null
          group_name?: string | null
          id?: string
          invite_link?: string | null
          join_status?: Database["public"]["Enums"]["warmup_group_join_status"]
          joined_at?: string | null
          last_error?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_instance_groups_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "warmup_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_instance_groups_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_jobs: {
        Row: {
          attempts: number
          created_at: string
          cycle_id: string
          device_id: string
          id: string
          job_type: Database["public"]["Enums"]["warmup_job_type"]
          last_error: string | null
          max_attempts: number
          payload: Json | null
          run_at: string
          status: Database["public"]["Enums"]["warmup_job_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          cycle_id: string
          device_id: string
          id?: string
          job_type: Database["public"]["Enums"]["warmup_job_type"]
          last_error?: string | null
          max_attempts?: number
          payload?: Json | null
          run_at?: string
          status?: Database["public"]["Enums"]["warmup_job_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          cycle_id?: string
          device_id?: string
          id?: string
          job_type?: Database["public"]["Enums"]["warmup_job_type"]
          last_error?: string | null
          max_attempts?: number
          payload?: Json | null
          run_at?: string
          status?: Database["public"]["Enums"]["warmup_job_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_jobs_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "warmup_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_jobs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_logs: {
        Row: {
          created_at: string
          device_id: string
          error_message: string | null
          group_jid: string | null
          group_name: string | null
          id: string
          message_content: string
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          error_message?: string | null
          group_jid?: string | null
          group_name?: string | null
          id?: string
          message_content: string
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          error_message?: string | null
          group_jid?: string | null
          group_name?: string | null
          id?: string
          message_content?: string
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "warmup_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_messages: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      warmup_plans: {
        Row: {
          created_at: string
          days_total: number
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          days_total: number
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          days_total?: number
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      warmup_sessions: {
        Row: {
          created_at: string
          current_day: number
          daily_increment: number
          device_id: string
          end_time: string
          id: string
          last_executed_at: string | null
          max_delay_seconds: number
          max_messages_per_day: number
          messages_per_day: number
          messages_sent_today: number
          messages_sent_total: number
          min_delay_seconds: number
          quality_profile: string
          safety_state: string
          start_time: string
          status: string
          total_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_day?: number
          daily_increment?: number
          device_id: string
          end_time?: string
          id?: string
          last_executed_at?: string | null
          max_delay_seconds?: number
          max_messages_per_day?: number
          messages_per_day?: number
          messages_sent_today?: number
          messages_sent_total?: number
          min_delay_seconds?: number
          quality_profile?: string
          safety_state?: string
          start_time?: string
          status?: string
          total_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_day?: number
          daily_increment?: number
          device_id?: string
          end_time?: string
          id?: string
          last_executed_at?: string | null
          max_delay_seconds?: number
          max_messages_per_day?: number
          messages_per_day?: number
          messages_sent_today?: number
          messages_sent_total?: number
          min_delay_seconds?: number
          quality_profile?: string
          safety_state?: string
          start_time?: string
          status?: string
          total_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_unique_recipients: {
        Row: {
          created_at: string
          cycle_id: string
          day_date: string
          id: string
          recipient_phone_e164: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_id: string
          day_date?: string
          id?: string
          recipient_phone_e164: string
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_id?: string
          day_date?: string
          id?: string
          recipient_phone_e164?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_unique_recipients_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "warmup_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_device_lock: {
        Args: {
          _campaign_id: string
          _device_id: string
          _stale_seconds?: number
          _user_id: string
        }
        Returns: boolean
      }
      check_phone_available: { Args: { _phone: string }; Returns: boolean }
      claim_pending_messages: {
        Args: { _limit?: number }
        Returns: {
          client_email: string
          client_name: string
          client_phone: string | null
          created_at: string
          error_message: string | null
          expires_at: string | null
          id: string
          message_content: string | null
          message_type: Database["public"]["Enums"]["message_queue_type"]
          plan_name: string
          sent_at: string | null
          status: Database["public"]["Enums"]["message_queue_status"]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "message_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_old_logs: { Args: { _retention_days?: number }; Returns: Json }
      cleanup_stale_locks: {
        Args: { _stale_seconds?: number }
        Returns: number
      }
      get_profile_safe: {
        Args: { profile_row: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: {
          admin_notes: string | null
          avatar_url: string | null
          client_type: string
          company: string | null
          created_at: string
          document: string | null
          full_name: string | null
          id: string
          instance_override: number
          notificacao_liberada: boolean
          phone: string | null
          risk_flag: boolean
          status: string
          updated_at: string
          whatsapp_monitor_token: string | null
        }
        SetofOptions: {
          from: "profiles"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_device_lock: {
        Args: { _campaign_id: string }
        Returns: undefined
      }
      increment_warmup_budget: {
        Args: {
          p_cycle_id: string
          p_increment?: number
          p_unique_recipient?: boolean
        }
        Returns: Json
      }
      release_device_lock: {
        Args: { _campaign_id: string; _device_id: string }
        Returns: undefined
      }
      release_provision_lock: { Args: { _user_id: string }; Returns: undefined }
      try_provision_lock: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      alert_severity: "INFO" | "WARNING" | "CRITICAL"
      alert_type:
        | "INSTANCE_CONNECTED"
        | "INSTANCE_DISCONNECTED"
        | "QRCODE_GENERATED"
        | "CAMPAIGN_STARTED"
        | "CAMPAIGN_PAUSED"
        | "CAMPAIGN_FINISHED"
        | "CAMPAIGN_ERROR"
        | "HIGH_FAILURE_RATE"
        | "WARMUP_REPORT_24H"
        | "TEST_ALERT"
      app_role: "admin" | "moderator" | "user"
      message_queue_status: "pending" | "sent" | "failed"
      message_queue_type:
        | "WELCOME"
        | "DUE_3_DAYS"
        | "DUE_TODAY"
        | "OVERDUE_1"
        | "OVERDUE_7"
        | "OVERDUE_30"
      warmup_chip_state: "new" | "recovered" | "unstable"
      warmup_group_join_status: "pending" | "joined" | "failed" | "left"
      warmup_job_status:
        | "pending"
        | "running"
        | "succeeded"
        | "failed"
        | "cancelled"
      warmup_job_type:
        | "join_group"
        | "enable_autosave"
        | "enable_community"
        | "autosave_interaction"
        | "community_interaction"
        | "daily_reset"
        | "phase_transition"
        | "health_check"
        | "group_interaction"
        | "post_status"
      warmup_log_level: "info" | "warn" | "error"
      warmup_phase:
        | "pre_24h"
        | "groups_only"
        | "autosave_enabled"
        | "community_enabled"
        | "completed"
        | "paused"
        | "error"
        | "community_light"
        | "community_ramp_up"
        | "community_stable"
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
      alert_severity: ["INFO", "WARNING", "CRITICAL"],
      alert_type: [
        "INSTANCE_CONNECTED",
        "INSTANCE_DISCONNECTED",
        "QRCODE_GENERATED",
        "CAMPAIGN_STARTED",
        "CAMPAIGN_PAUSED",
        "CAMPAIGN_FINISHED",
        "CAMPAIGN_ERROR",
        "HIGH_FAILURE_RATE",
        "WARMUP_REPORT_24H",
        "TEST_ALERT",
      ],
      app_role: ["admin", "moderator", "user"],
      message_queue_status: ["pending", "sent", "failed"],
      message_queue_type: [
        "WELCOME",
        "DUE_3_DAYS",
        "DUE_TODAY",
        "OVERDUE_1",
        "OVERDUE_7",
        "OVERDUE_30",
      ],
      warmup_chip_state: ["new", "recovered", "unstable"],
      warmup_group_join_status: ["pending", "joined", "failed", "left"],
      warmup_job_status: [
        "pending",
        "running",
        "succeeded",
        "failed",
        "cancelled",
      ],
      warmup_job_type: [
        "join_group",
        "enable_autosave",
        "enable_community",
        "autosave_interaction",
        "community_interaction",
        "daily_reset",
        "phase_transition",
        "health_check",
        "group_interaction",
        "post_status",
      ],
      warmup_log_level: ["info", "warn", "error"],
      warmup_phase: [
        "pre_24h",
        "groups_only",
        "autosave_enabled",
        "community_enabled",
        "completed",
        "paused",
        "error",
        "community_light",
        "community_ramp_up",
        "community_stable",
      ],
    },
  },
} as const
