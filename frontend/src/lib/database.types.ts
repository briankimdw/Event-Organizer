// Generated from the Supabase schema. Do not edit by hand.
// Regenerate: npx supabase gen types typescript --project-id ktjvbajrfrbwpndforcy > frontend/src/lib/database.types.ts

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
      admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      album_tags: {
        Row: {
          album_id: string
          tag_id: string
        }
        Insert: {
          album_id: string
          tag_id: string
        }
        Update: {
          album_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_tags_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      albums: {
        Row: {
          caption: string | null
          category_id: string | null
          cover_photo_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["album_kind"]
          location_text: string | null
          provider_id: string
          shot_on: string | null
          sort_order: number
          status: Database["public"]["Enums"]["album_status"]
          title: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          category_id?: string | null
          cover_photo_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["album_kind"]
          location_text?: string | null
          provider_id: string
          shot_on?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["album_status"]
          title: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          category_id?: string | null
          cover_photo_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["album_kind"]
          location_text?: string | null
          provider_id?: string
          shot_on?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["album_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "albums_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "albums_cover_photo_fk"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "albums_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          end_time: string
          id: string
          provider_id: string
          start_time: string
          weekday: number
        }
        Insert: {
          end_time: string
          id?: string
          provider_id: string
          start_time: string
          weekday: number
        }
        Update: {
          end_time?: string
          id?: string
          provider_id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      blackouts: {
        Row: {
          created_at: string
          during: unknown
          id: string
          provider_id: string
        }
        Insert: {
          created_at?: string
          during: unknown
          id?: string
          provider_id: string
        }
        Update: {
          created_at?: string
          during?: unknown
          id?: string
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blackouts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id?: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_addons: {
        Row: {
          addon_id: string | null
          booking_id: string
          id: string
          name: string
          price_cents: number
        }
        Insert: {
          addon_id?: string | null
          booking_id: string
          id?: string
          name: string
          price_cents: number
        }
        Update: {
          addon_id?: string | null
          booking_id?: string
          id?: string
          name?: string
          price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "package_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          actor_id: string | null
          booking_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["booking_status"] | null
          id: number
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Insert: {
          actor_id?: string | null
          booking_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: never
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Update: {
          actor_id?: string | null
          booking_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: never
          to_status?: Database["public"]["Enums"]["booking_status"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_offers: {
        Row: {
          booking_id: string
          created_at: string
          created_by: string
          id: string
          message: string | null
          proposed_total_cents: number
          responded_at: string | null
          status: Database["public"]["Enums"]["offer_status"]
        }
        Insert: {
          booking_id: string
          created_at?: string
          created_by: string
          id?: string
          message?: string | null
          proposed_total_cents: number
          responded_at?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
        }
        Update: {
          booking_id?: string
          created_at?: string
          created_by?: string
          id?: string
          message?: string | null
          proposed_total_cents?: number
          responded_at?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_offers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          addons_cents: number
          cancelled_at: string | null
          category_id: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          deposit_cents: number | null
          event_id: string | null
          expires_at: string | null
          id: string
          location: unknown
          location_text: string | null
          notes: string | null
          package_id: string | null
          package_snapshot: Json
          policy_snapshot: Json
          provider_id: string
          status: Database["public"]["Enums"]["booking_status"]
          subtotal_cents: number | null
          time_range: unknown
          timezone: string
          total_cents: number | null
          travel_fee_cents: number
          updated_at: string
        }
        Insert: {
          addons_cents?: number
          cancelled_at?: string | null
          category_id?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          deposit_cents?: number | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          location?: unknown
          location_text?: string | null
          notes?: string | null
          package_id?: string | null
          package_snapshot: Json
          policy_snapshot?: Json
          provider_id: string
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal_cents?: number | null
          time_range: unknown
          timezone: string
          total_cents?: number | null
          travel_fee_cents?: number
          updated_at?: string
        }
        Update: {
          addons_cents?: number
          cancelled_at?: string | null
          category_id?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          deposit_cents?: number | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          location?: unknown
          location_text?: string | null
          notes?: string | null
          package_id?: string | null
          package_snapshot?: Json
          policy_snapshot?: Json
          provider_id?: string
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal_cents?: number | null
          time_range?: unknown
          timezone?: string
          total_cents?: number | null
          travel_fee_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_policies: {
        Row: {
          created_at: string
          id: string
          name: string
          provider_id: string | null
          rules: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          provider_id?: string | null
          rules: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          provider_id?: string | null
          rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_policies_provider_fk"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_items: {
        Row: {
          collection_id: string
          created_at: string
          photo_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          photo_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          photo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          profile_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          profile_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          booking_id: string | null
          created_at: string
          event_id: string | null
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          last_message_at: string | null
          provider_id: string | null
          title: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          last_message_at?: string | null
          provider_id?: string | null
          title?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["conversation_kind"]
          last_message_at?: string | null
          provider_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_members: {
        Row: {
          created_at: string
          event_id: string
          profile_id: string
          role: Database["public"]["Enums"]["event_member_role"]
        }
        Insert: {
          created_at?: string
          event_id: string
          profile_id: string
          role?: Database["public"]["Enums"]["event_member_role"]
        }
        Update: {
          created_at?: string
          event_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["event_member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "event_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          budget_cents: number | null
          created_at: string
          currency: string
          ends_at: string | null
          guest_count: number | null
          id: string
          location: unknown
          location_text: string | null
          owner_id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["event_status"]
          title: string
          type: string | null
          updated_at: string
        }
        Insert: {
          budget_cents?: number | null
          created_at?: string
          currency?: string
          ends_at?: string | null
          guest_count?: number | null
          id?: string
          location?: unknown
          location_text?: string | null
          owner_id?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          budget_cents?: number | null
          created_at?: string
          currency?: string
          ends_at?: string | null
          guest_count?: number | null
          id?: string
          location?: unknown
          location_text?: string | null
          owner_id?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          provider_id: string
        }
        Insert: {
          created_at?: string
          follower_id?: string
          provider_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_verifications: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          status: Database["public"]["Enums"]["verification_status"]
          updated_at: string
          user_id: string
          vendor: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["verification_status"]
          updated_at?: string
          user_id: string
          vendor?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["verification_status"]
          updated_at?: string
          user_id?: string
          vendor?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
          shared_album_id: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          sender_id?: string
          shared_album_id?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
          shared_album_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shared_album_id_fkey"
            columns: ["shared_album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      package_addons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_cents: number
          provider_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_cents: number
          provider_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          provider_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_addons_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          attributes: Json
          category_id: string
          created_at: string
          currency: string
          deposit_pct: number
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean
          name: string
          price_cents: number | null
          price_type: Database["public"]["Enums"]["price_type"]
          provider_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          attributes?: Json
          category_id: string
          created_at?: string
          currency?: string
          deposit_pct?: number
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          name: string
          price_cents?: number | null
          price_type: Database["public"]["Enums"]["price_type"]
          provider_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          attributes?: Json
          category_id?: string
          created_at?: string
          currency?: string
          deposit_pct?: number
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number | null
          price_type?: Database["public"]["Enums"]["price_type"]
          provider_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          ai_score: number | null
          album_id: string
          authenticity: Database["public"]["Enums"]["photo_authenticity"]
          blurhash: string | null
          created_at: string
          display_path: string
          exif: Json
          exif_hidden: string[]
          height: number | null
          id: string
          original_path: string | null
          owner_id: string
          pair_role: Database["public"]["Enums"]["pair_role"] | null
          phash: string | null
          position: number
          width: number | null
        }
        Insert: {
          ai_score?: number | null
          album_id: string
          authenticity?: Database["public"]["Enums"]["photo_authenticity"]
          blurhash?: string | null
          created_at?: string
          display_path: string
          exif?: Json
          exif_hidden?: string[]
          height?: number | null
          id?: string
          original_path?: string | null
          owner_id?: string
          pair_role?: Database["public"]["Enums"]["pair_role"] | null
          phash?: string | null
          position?: number
          width?: number | null
        }
        Update: {
          ai_score?: number | null
          album_id?: string
          authenticity?: Database["public"]["Enums"]["photo_authenticity"]
          blurhash?: string | null
          created_at?: string
          display_path?: string
          exif?: Json
          exif_hidden?: string[]
          height?: number | null
          id?: string
          original_path?: string | null
          owner_id?: string
          pair_role?: Database["public"]["Enums"]["pair_role"] | null
          phash?: string | null
          position?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          city: string | null
          client_rating_avg: number | null
          client_rating_count: number
          created_at: string
          display_name: string
          id: string
          location: unknown
          updated_at: string
          username: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          city?: string | null
          client_rating_avg?: number | null
          client_rating_count?: number
          created_at?: string
          display_name?: string
          id: string
          location?: unknown
          updated_at?: string
          username: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          city?: string | null
          client_rating_avg?: number | null
          client_rating_count?: number
          created_at?: string
          display_name?: string
          id?: string
          location?: unknown
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      provider_private: {
        Row: {
          payouts_enabled: boolean
          provider_id: string
          stripe_account_id: string | null
          updated_at: string
        }
        Insert: {
          payouts_enabled?: boolean
          provider_id: string
          stripe_account_id?: string | null
          updated_at?: string
        }
        Update: {
          payouts_enabled?: boolean
          provider_id?: string
          stripe_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_private_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_services: {
        Row: {
          category_id: string
          provider_id: string
        }
        Insert: {
          category_id: string
          provider_id: string
        }
        Update: {
          category_id?: string
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          attributes: Json
          base_location: unknown
          bio: string | null
          buffer_minutes: number
          cancellation_policy_id: string | null
          city: string | null
          created_at: string
          display_name: string
          id: string
          identity_verified: boolean
          is_pro: boolean
          profile_id: string
          rating_avg: number | null
          rating_count: number
          service_radius_km: number
          slug: string
          status: Database["public"]["Enums"]["provider_status"]
          timezone: string
          travel_fee_per_km_cents: number
          updated_at: string
          vertical_id: string
        }
        Insert: {
          attributes?: Json
          base_location?: unknown
          bio?: string | null
          buffer_minutes?: number
          cancellation_policy_id?: string | null
          city?: string | null
          created_at?: string
          display_name: string
          id?: string
          identity_verified?: boolean
          is_pro?: boolean
          profile_id: string
          rating_avg?: number | null
          rating_count?: number
          service_radius_km?: number
          slug: string
          status?: Database["public"]["Enums"]["provider_status"]
          timezone?: string
          travel_fee_per_km_cents?: number
          updated_at?: string
          vertical_id: string
        }
        Update: {
          attributes?: Json
          base_location?: unknown
          bio?: string | null
          buffer_minutes?: number
          cancellation_policy_id?: string | null
          city?: string | null
          created_at?: string
          display_name?: string
          id?: string
          identity_verified?: boolean
          is_pro?: boolean
          profile_id?: string
          rating_avg?: number | null
          rating_count?: number
          service_radius_km?: number
          slug?: string
          status?: Database["public"]["Enums"]["provider_status"]
          timezone?: string
          travel_fee_per_km_cents?: number
          updated_at?: string
          vertical_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "providers_cancellation_policy_id_fkey"
            columns: ["cancellation_policy_id"]
            isOneToOne: false
            referencedRelation: "cancellation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_vertical_id_fkey"
            columns: ["vertical_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string
          body: string | null
          booking_id: string
          created_at: string
          direction: Database["public"]["Enums"]["review_direction"]
          id: string
          provider_id: string
          rating: number
          revealed_at: string | null
          subject_profile_id: string
        }
        Insert: {
          author_id: string
          body?: string | null
          booking_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["review_direction"]
          id?: string
          provider_id: string
          rating: number
          revealed_at?: string | null
          subject_profile_id: string
        }
        Update: {
          author_id?: string
          body?: string | null
          booking_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["review_direction"]
          id?: string
          provider_id?: string
          rating?: number
          revealed_at?: string | null
          subject_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_subject_profile_id_fkey"
            columns: ["subject_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_providers: {
        Row: {
          created_at: string
          provider_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          provider_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          provider_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_providers_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_providers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          package_schema: Json | null
          parent_id: string | null
          provider_schema: Json | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          package_schema?: Json | null
          parent_id?: string | null
          provider_schema?: Json | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name?: string
          package_schema?: Json | null
          parent_id?: string | null
          provider_schema?: Json | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      swipes: {
        Row: {
          action: Database["public"]["Enums"]["swipe_action"]
          album_id: string | null
          created_at: string
          dwell_ms: number | null
          id: number
          photo_id: string | null
          position: number | null
          provider_id: string | null
          reason_shown: string | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["swipe_action"]
          album_id?: string | null
          created_at?: string
          dwell_ms?: number | null
          id?: never
          photo_id?: string | null
          position?: number | null
          provider_id?: string | null
          reason_shown?: string | null
          session_id?: string | null
          user_id?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["swipe_action"]
          album_id?: string | null
          created_at?: string
          dwell_ms?: number | null
          id?: never
          photo_id?: string | null
          position?: number | null
          provider_id?: string | null
          reason_shown?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swipes_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["tag_kind"]
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["tag_kind"]
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["tag_kind"]
          name?: string
          slug?: string
        }
        Relationships: []
      }
      taste_corrections: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["correction_kind"]
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["correction_kind"]
          user_id?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["correction_kind"]
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "taste_corrections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_delivery: {
        Args: { p_booking_id: string }
        Returns: {
          addons_cents: number
          cancelled_at: string | null
          category_id: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          deposit_cents: number | null
          event_id: string | null
          expires_at: string | null
          id: string
          location: unknown
          location_text: string | null
          notes: string | null
          package_id: string | null
          package_snapshot: Json
          policy_snapshot: Json
          provider_id: string
          status: Database["public"]["Enums"]["booking_status"]
          subtotal_cents: number | null
          time_range: unknown
          timezone: string
          total_cents: number | null
          travel_fee_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      become_provider: {
        Args: {
          p_bio?: string
          p_city?: string
          p_display_name: string
          p_slug: string
          p_vertical_slug?: string
        }
        Returns: {
          attributes: Json
          base_location: unknown
          bio: string | null
          buffer_minutes: number
          cancellation_policy_id: string | null
          city: string | null
          created_at: string
          display_name: string
          id: string
          identity_verified: boolean
          is_pro: boolean
          profile_id: string
          rating_avg: number | null
          rating_count: number
          service_radius_km: number
          slug: string
          status: Database["public"]["Enums"]["provider_status"]
          timezone: string
          travel_fee_per_km_cents: number
          updated_at: string
          vertical_id: string
        }
        SetofOptions: {
          from: "*"
          to: "providers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_view_album: { Args: { p_album_id: string }; Returns: boolean }
      cancel_booking: { Args: { p_booking_id: string }; Returns: Json }
      category_schema: {
        Args: { p_category_id: string; p_which: string }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_booking_party: { Args: { p_booking_id: string }; Returns: boolean }
      is_conversation_member: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_event_member: { Args: { p_event_id: string }; Returns: boolean }
      is_provider_free: {
        Args: { p_day: string; p_provider_id: string }
        Returns: boolean
      }
      mark_delivered: {
        Args: { p_booking_id: string }
        Returns: {
          addons_cents: number
          cancelled_at: string | null
          category_id: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          deposit_cents: number | null
          event_id: string | null
          expires_at: string | null
          id: string
          location: unknown
          location_text: string | null
          notes: string | null
          package_id: string | null
          package_snapshot: Json
          policy_snapshot: Json
          provider_id: string
          status: Database["public"]["Enums"]["booking_status"]
          subtotal_cents: number | null
          time_range: unknown
          timezone: string
          total_cents: number | null
          travel_fee_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      owns_album: { Args: { p_album_id: string }; Returns: boolean }
      owns_provider: { Args: { p_provider_id: string }; Returns: boolean }
      request_booking: {
        Args: {
          p_addon_ids?: string[]
          p_dates: string[]
          p_event_id?: string
          p_hours?: number
          p_location_text?: string
          p_notes?: string
          p_package_id: string
          p_start_time: string
        }
        Returns: {
          addons_cents: number
          cancelled_at: string | null
          category_id: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          deposit_cents: number | null
          event_id: string | null
          expires_at: string | null
          id: string
          location: unknown
          location_text: string | null
          notes: string | null
          package_id: string | null
          package_snapshot: Json
          policy_snapshot: Json
          provider_id: string
          status: Database["public"]["Enums"]["booking_status"]
          subtotal_cents: number | null
          time_range: unknown
          timezone: string
          total_cents: number | null
          travel_fee_cents: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      respond_to_booking: {
        Args: {
          p_action: string
          p_booking_id: string
          p_message?: string
          p_total_cents?: number
        }
        Returns: {
          addons_cents: number
          cancelled_at: string | null
          category_id: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          deposit_cents: number | null
          event_id: string | null
          expires_at: string | null
          id: string
          location: unknown
          location_text: string | null
          notes: string | null
          package_id: string | null
          package_snapshot: Json
          policy_snapshot: Json
          provider_id: string
          status: Database["public"]["Enums"]["booking_status"]
          subtotal_cents: number | null
          time_range: unknown
          timezone: string
          total_cents: number | null
          travel_fee_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_offer: {
        Args: { p_accept: boolean; p_offer_id: string }
        Returns: {
          addons_cents: number
          cancelled_at: string | null
          category_id: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          deposit_cents: number | null
          event_id: string | null
          expires_at: string | null
          id: string
          location: unknown
          location_text: string | null
          notes: string | null
          package_id: string | null
          package_snapshot: Json
          policy_snapshot: Json
          provider_id: string
          status: Database["public"]["Enums"]["booking_status"]
          subtotal_cents: number | null
          time_range: unknown
          timezone: string
          total_cents: number | null
          travel_fee_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_providers: {
        Args: {
          p_category?: string
          p_dates?: string[]
          p_max_price_cents?: number
          p_min_rating?: number
          p_pro_only?: boolean
        }
        Returns: {
          free_dates: string[]
          provider_id: string
          starting_price_cents: number
        }[]
      }
      start_inquiry: { Args: { p_provider_id: string }; Returns: string }
      submit_review: {
        Args: { p_body?: string; p_booking_id: string; p_rating: number }
        Returns: {
          author_id: string
          body: string | null
          booking_id: string
          created_at: string
          direction: Database["public"]["Enums"]["review_direction"]
          id: string
          provider_id: string
          rating: number
          revealed_at: string | null
          subject_profile_id: string
        }
        SetofOptions: {
          from: "*"
          to: "reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      album_kind: "album" | "before_after"
      album_status: "processing" | "published" | "under_review" | "hidden"
      booking_status:
        | "requested"
        | "countered"
        | "accepted"
        | "confirmed"
        | "in_progress"
        | "delivered"
        | "completed"
        | "declined"
        | "expired"
        | "cancelled_by_client"
        | "cancelled_by_provider"
        | "disputed"
        | "refunded"
      category_kind: "vertical" | "service"
      conversation_kind: "inquiry" | "booking" | "group" | "event"
      correction_kind: "tag" | "provider"
      event_member_role: "owner" | "co_planner"
      event_status: "draft" | "planning" | "booked" | "completed" | "cancelled"
      offer_status: "pending" | "accepted" | "declined" | "withdrawn"
      pair_role: "before" | "after"
      photo_authenticity: "unverified" | "real_verified" | "flagged" | "ai"
      price_type: "fixed" | "hourly" | "quote"
      provider_status: "draft" | "active" | "suspended"
      report_status: "open" | "reviewing" | "resolved" | "dismissed"
      review_direction: "client_to_provider" | "provider_to_client"
      swipe_action: "like" | "pass" | "save"
      tag_kind: "genre" | "user" | "auto"
      verification_status: "pending" | "verified" | "failed"
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
    Enums: {
      album_kind: ["album", "before_after"],
      album_status: ["processing", "published", "under_review", "hidden"],
      booking_status: [
        "requested",
        "countered",
        "accepted",
        "confirmed",
        "in_progress",
        "delivered",
        "completed",
        "declined",
        "expired",
        "cancelled_by_client",
        "cancelled_by_provider",
        "disputed",
        "refunded",
      ],
      category_kind: ["vertical", "service"],
      conversation_kind: ["inquiry", "booking", "group", "event"],
      correction_kind: ["tag", "provider"],
      event_member_role: ["owner", "co_planner"],
      event_status: ["draft", "planning", "booked", "completed", "cancelled"],
      offer_status: ["pending", "accepted", "declined", "withdrawn"],
      pair_role: ["before", "after"],
      photo_authenticity: ["unverified", "real_verified", "flagged", "ai"],
      price_type: ["fixed", "hourly", "quote"],
      provider_status: ["draft", "active", "suspended"],
      report_status: ["open", "reviewing", "resolved", "dismissed"],
      review_direction: ["client_to_provider", "provider_to_client"],
      swipe_action: ["like", "pass", "save"],
      tag_kind: ["genre", "user", "auto"],
      verification_status: ["pending", "verified", "failed"],
    },
  },
} as const
