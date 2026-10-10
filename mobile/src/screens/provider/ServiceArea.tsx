// Where the provider is based and how far they travel (the web Dashboard's
// ServiceArea card + components/map/ServiceAreaEditor.jsx). The web editor drags a
// pin on a Leaflet map; here you search a place (shared geocode) or use your
// location, pick the radius with a stepper, and see it on the shared MapPreview.
import { LocateFixed, MapPin, Search } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { geocode, getMyLocation, parsePoint, reverseGeocode, updateServiceArea } from '@shared/api/locations.js'
import { avatarUrl } from '@shared/lib/format.js'
import { Button, Card, Sheet, Text, TextField } from '@/components'
import { MapPreview } from '@/components/map'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import Stepper from './Stepper'

// Radius stops (km): fine steps nearby, bigger ones for vendors who travel far (same as the web).
const STOPS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000]

type Point = { lat: number; lng: number }
type Place = { id: string | number; label: string; detail: string; lat: number; lng: number }

export default function ServiceArea({ provider, onChanged }: { provider: any; onChanged?: () => void }) {
  const s = useStyles()
  const { c } = useTheme()
  const { myProvider, refreshProvider, toast } = useStore()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  if (!myProvider) return null

  const location = parsePoint(myProvider.base_location) as Point | null
  const radiusKm: number = myProvider.service_radius_km ?? 40
  const city: string = myProvider.city || ''
  const avatar = provider?.avatar || avatarUrl(null, myProvider.display_name)

  const save = async (area: Point & { radiusKm: number; city: string }) => {
    setSaving(true)
    try {
      await updateServiceArea(myProvider.id, area)
      await refreshProvider()
      onChanged?.()
      setOpen(false)
      toast('Service area saved')
    } catch (e: any) {
      console.warn(e)
      toast('Couldn’t save: ' + (e?.message || 'try again'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card style={s.card}>
      <View style={s.row}>
        <MapPin size={18} color={c.muted} />
        <View style={s.grow}>
          <Text variant="small" weight="700">Service area</Text>
          <Text variant="tiny" muted>
            {location ? `${city.split(',')[0] || 'Your base'} · you travel up to ${radiusKm} km` : 'Not set yet, so clients can’t find you on the map.'}
          </Text>
        </View>
        <Button title={location ? 'Edit' : 'Set up'} size="sm" variant={location ? 'ghost' : 'primary'} onPress={() => setOpen(true)} />
      </View>
      {location && <MapPreview location={location} radiusKm={radiusKm} avatar={avatar} name={myProvider.display_name} onPress={() => setOpen(true)} />}
      <Sheet open={open} onClose={() => !saving && setOpen(false)} title="Service area">
        <Text variant="small" muted>Where you’re based and how far you’ll travel. Clients see this on the map and on your profile.</Text>
        {open && <AreaEditor initial={{ location, radiusKm, city }} avatar={avatar} name={myProvider.display_name} onSave={save} saving={saving} />}
      </Sheet>
    </Card>
  )
}

function AreaEditor({ initial, avatar, name, onSave, saving }: {
  initial: { location: Point | null; radiusKm: number; city: string }
  avatar: string
  name: string
  onSave: (a: Point & { radiusKm: number; city: string }) => void
  saving: boolean
}) {
  const s = useStyles()
  const { c } = useTheme()
  const [point, setPoint] = useState<Point | null>(initial.location)
  const [radiusKm, setRadiusKm] = useState(initial.radiusKm)
  const [city, setCity] = useState(initial.city)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [locating, setLocating] = useState(false)

  // Debounced place search (Nominatim allows one request a second; locations.js queues them).
  useEffect(() => {
    const query = q.trim()
    if (query.length < 3) {
      setResults([])
      setSearching(false)
      return
    }
    const ctrl = new AbortController()
    setSearching(true)
    const t = setTimeout(() => {
      geocode(query, { signal: ctrl.signal })
        .then((rows: Place[]) => {
          setResults(rows)
          setMessage(rows.length ? null : { text: 'No places found. Try a city name or a fuller address.' })
        })
        .catch((e: any) => e?.name !== 'AbortError' && setMessage({ text: e?.message || 'Place search failed. Try again.', error: true }))
        .finally(() => !ctrl.signal.aborted && setSearching(false))
    }, 600)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  const pick = (r: Place) => {
    setPoint({ lat: r.lat, lng: r.lng })
    setCity(r.label)
    setQ('')
    setResults([])
    setMessage(null)
  }

  const locate = async () => {
    setLocating(true)
    setMessage(null)
    try {
      const p = (await getMyLocation()) as Point
      setPoint(p)
      const label = await reverseGeocode(p).catch(() => '')
      if (label) setCity(label)
    } catch (e: any) {
      setMessage({ text: e?.message || 'Couldn’t find your location.', error: true })
    } finally {
      setLocating(false)
    }
  }

  const dirty = !!point && (point.lat !== initial.location?.lat || point.lng !== initial.location?.lng || radiusKm !== initial.radiusKm || city !== initial.city)

  return (
    <View style={s.editor}>
      <TextField icon={Search} placeholder="Search a city or address" value={q} onChangeText={setQ} clearable autoCorrect={false}
        right={searching ? <ActivityIndicator size="small" color={c.muted} /> : undefined} />
      {results.map((r) => (
        <Pressable key={r.id} onPress={() => pick(r)} style={({ pressed }) => [s.result, pressed && { backgroundColor: c.soft }]} accessibilityRole="button">
          <MapPin size={16} color={c.muted} />
          <View style={s.grow}>
            <Text variant="small" weight="600">{r.label}</Text>
            <Text variant="tiny" muted numberOfLines={1}>{r.detail}</Text>
          </View>
        </Pressable>
      ))}
      <Button title={locating ? 'Finding you…' : 'Use my location'} icon={LocateFixed} variant="ghost" size="sm" disabled={locating} onPress={locate} />
      {message && <Text variant="tiny" color={message.error ? 'danger' : 'muted'}>{message.text}</Text>}

      {point ? (
        <MapPreview location={point} radiusKm={radiusKm} avatar={avatar} name={name} />
      ) : (
        <View style={s.noPoint}><Text variant="small" muted center>Search a place or use your location to set your base.</Text></View>
      )}

      <TextField label="Area name" placeholder="e.g. Pasadena, CA" maxLength={80} value={city} onChangeText={setCity} />
      <View>
        <Text variant="small" muted>How far you travel</Text>
        <View style={s.stepper}>
          <Stepper label="service radius" stops={STOPS} value={radiusKm} onChange={setRadiusKm} format={(v) => `${v.toLocaleString('en-US')} km`} />
        </View>
        <Text variant="tiny" muted>Clients within {radiusKm} km of your base see that you travel to them. You can still accept bookings further out.</Text>
      </View>
      <Button title={saving ? 'Saving…' : 'Save service area'} block disabled={!dirty || saving} onPress={() => point && onSave({ ...point, radiusKm, city })} />
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  card: { marginTop: t.space.md, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  editor: { gap: 10, marginTop: t.space.md },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: t.radius.md },
  noPoint: { height: 120, borderRadius: t.radius.lg, backgroundColor: t.c.soft, alignItems: 'center', justifyContent: 'center', padding: t.space.lg },
  stepper: { alignItems: 'center', paddingVertical: t.space.sm },
}))
