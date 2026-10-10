// Planner brief helpers for the app: the shared plain-JS helpers from the web
// (frontend/src/lib/planBrief.js) with types, plus icon components for event types.
import * as shared from '@shared/lib/planBrief.js'
import type { LucideIcon } from 'lucide-react-native'

import { iconByName } from '@/components/VerticalIcon'

export type Brief = {
  event_type: string | null
  title: string | null
  start_date: string | null
  end_date: string | null
  dates: string[]
  location_text: string | null
  location: { lat: number; lng: number } | null
  budget_total_cents: number | null
  guest_count: number | null
  styles: string[]
  services_needed: string[]
  notes: string | null
}

export const EVENT_TYPES = shared.EVENT_TYPES as [string, string][]
export const STYLE_SUGGESTIONS = shared.STYLE_SUGGESTIONS as string[]
export const eventTypeName = shared.eventTypeName as (type?: string | null) => string
export const cents = shared.cents as (c?: number | null) => string | null
export const centsShort = shared.centsShort as (c?: number | null) => string | null
export const datesLabel = shared.datesLabel as (brief?: Partial<Brief> | null) => string | null
export const shortDates = shared.shortDates as (keys: string[]) => string
export const followUpFor = shared.followUpFor as (field: string, brief: Brief) => string

export const typeIcon = (type?: string | null): LucideIcon => iconByName(shared.typeIconName(type))
