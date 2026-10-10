import type { StyleProp, ViewStyle } from 'react-native'

import type { Box, LatLng } from './geo'
import type { MapProvider } from './MapProviderCard'

// Props of ProviderMap (native: ProviderMap.tsx, web fallback: ProviderMap.web.tsx).
export type ProviderMapProps = {
  /** Every result with a location (pins outside `area` are faded). */
  providers: MapProvider[]
  /** The user's location, or null. */
  userLocation?: LatLng | null
  /** Asks for the user's location; resolves it or null. */
  onLocate?: () => Promise<LatLng | null>
  /** A provider to open on load. */
  focusId?: string | null
  /** 'YYYY-MM-DD,...' carried to the profile / booking links. */
  dates?: string
  /** Also keep the user's location in frame (e.g. while filtering by distance). */
  fitUser?: boolean
  /** The open provider changed (to keep it in the route params for Back). */
  onSelect?: (id: string | null) => void
  /** The searched map area, or null; onAreaChange(box | null) searches / clears it. */
  area?: Box | null
  onAreaChange?: (box: Box | null) => void
  /** The vertical being searched (only changes the wording). */
  vertical?: string | null
  style?: StyleProp<ViewStyle>
}
