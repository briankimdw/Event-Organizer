// The photography-only product: photographers and videographers are one vertical
// (`photography`, shown as "Photo & video"; see @shared/verticals/catalog.js).
//   BRAND              the visible app name / wordmark (same as the web's "photomatch").
//                      app.json keeps the slug and URL scheme `eventorganizer`, so existing
//                      deep links and Supabase redirect URLs keep working.
//   isPhotoListing(p)  a listing that belongs in the app. Until the database cleanup runs the
//                      live data still has other verticals; 'videography' counts as photography.
import { isPhotoVertical } from '@shared/verticals/catalog.js'

export const BRAND = 'photomatch'

export const isPhotoListing = (p?: { vertical?: string | null } | null) => !!p && isPhotoVertical(p.vertical)
