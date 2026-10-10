import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarX, Check, Heart, Images, MapPin, Palette, Search, Star } from 'lucide-react'
import { IdVerified, ProBadge } from '../Badges.jsx'
import { useStore } from '../../store.jsx'
import { fmtKm } from '../../api/locations.js'
import { cents, shortDates } from './brief.js'

// One section per bookable category (photography today), each with the
// planner's ranked options. Provider display data comes from `providers`
// (a Map of provider id -> provider object); options we can't match are skipped.
export default function Recommendations({ recommendations, providers, brief }) {
  if (!recommendations?.length) return null
  return recommendations.map((rec) => {
    const options = rec.options.filter((o) => providers.has(o.provider_id))
    return (
      <section key={rec.category} className="plan-recs">
        <div className="plan-recs-head">
          <h3>{rec.label || 'Recommendations'}</h3>
          {rec.budget_cents != null && <span className="muted small">up to {cents(rec.budget_cents)}</span>}
        </div>
        {options.length === 0 ? (
          <div className="plan-card plan-none">
            <b>No one fits every detail yet</b>
            <div className="muted small">Try other dates or a bigger budget, or browse everyone who’s free.</div>
            <Link className="btn sm ghost mt-sm" to={`/search${brief?.dates?.length ? `?dates=${brief.dates.join(',')}` : ''}`}>
              <Search size={14} /> Browse photographers
            </Link>
          </div>
        ) : (
          options.map((o, i) => <OptionCard key={`${o.provider_id}-${o.package_id}`} option={o} p={providers.get(o.provider_id)} brief={brief} budgetCents={rec.budget_cents} top={i === 0} />)
        )}
      </section>
    )
  })
}

function OptionCard({ option: o, p, brief, budgetCents, top }) {
  const { shortlist, toggleShortlist } = useStore()
  const saved = shortlist.has(p.id)
  const briefDates = brief?.dates || []
  const bookDates = o.free_dates.length ? o.free_dates : briefDates
  const pkg = p.packages.find((x) => x.id === o.package_id)
  const packageName = o.package_name || pkg?.name
  // "Over by $400" against this category's share of the budget.
  const over = o.fits_budget === false && o.price_cents != null && budgetCents != null && o.price_cents > budgetCents ? cents(o.price_cents - budgetCents) : null
  const styleMatch = o.style_match == null ? null : Math.round(o.style_match <= 1 ? o.style_match * 100 : o.style_match)
  const bookUrl = `/book/${p.id}?${new URLSearchParams({ ...(o.package_id ? { pkg: o.package_id } : {}), ...(bookDates.length ? { dates: bookDates.join(',') } : {}) })}`.replace(/%2C/g, ',')

  return (
    <article className={`plan-option ${top ? 'top' : ''}`}>
      {p.covers.length > 0 && (
        <Link to={`/gallery/${p.id}`} className="plan-covers" aria-label={`See ${p.name}'s work`}>
          {p.covers.slice(0, 3).map((src) => (
            <img key={src} src={src} alt="" loading="lazy" />
          ))}
          {top && <span className="plan-top-pick">Top pick</span>}
        </Link>
      )}
      <div className="plan-option-body">
        <div className="row gap-xs">
          <Link to={`/u/${p.id}`} className="row gap-xs grow">
            <img className="avatar" src={p.avatar} alt="" />
            <div className="grow">
              <div className="person-name">
                <span className="ellipsis">{p.name}</span> {p.idVerified && <IdVerified />} {p.pro && <ProBadge />}
              </div>
              <div className="muted tiny row gap-xs">
                {p.rating != null ? (
                  <span className="inline-icon">
                    <Star size={11} className="star-on" fill="currentColor" /> {p.rating.toFixed(1)} ({p.reviewCount})
                  </span>
                ) : (
                  <span className="new-tag">New</span>
                )}
                {p.city && <span className="ellipsis">· {p.city.split(',')[0]}</span>}
              </div>
            </div>
          </Link>
          {!p.covers.length && top && <span className="plan-top-pick inline">Top pick</span>}
          <button
            type="button"
            className={`icon-btn ${saved ? 'liked' : ''}`}
            onClick={() => toggleShortlist(p.id)}
            aria-label={saved ? 'Remove from shortlist' : 'Save to shortlist'}
            aria-pressed={saved}
          >
            <Heart size={20} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className="plan-pkg">
          <div className="grow">
            <div className="small"><b>{packageName || 'Package'}</b></div>
            {pkg?.hours && <div className="muted tiny">{pkg.hours} hours{pkg.editedPhotos ? ` · ${pkg.editedPhotos} edited photos` : ''}</div>}
          </div>
          <div className="right-text">
            <b>{o.price_cents != null ? cents(o.price_cents) : 'Quote'}</b>
            {o.fits_budget === true && <div className="plan-fit ok">Fits your budget</div>}
            {o.fits_budget === false && <div className="plan-fit over">{over ? `Over by ${over}` : 'Over budget'}</div>}
          </div>
        </div>

        <ul className="plan-facts">
          {briefDates.length > 0 && (
            o.free_on_all_dates ? (
              <li><CalendarCheck size={14} className="ok" /> Free on {briefDates.length > 1 ? 'all your dates' : 'your date'}</li>
            ) : o.free_dates.length ? (
              <li><CalendarCheck size={14} className="ok" /> Free {shortDates(o.free_dates)}</li>
            ) : (
              <li><CalendarX size={14} className="plan-warn" /> Not free on your dates</li>
            )
          )}
          {o.distance_km != null && (
            <li>
              <MapPin size={14} /> {fmtKm(o.distance_km)} away
              {o.travels_to_event === true && <span className="ok"> · travels to you</span>}
              {o.travels_to_event === false && <span className="muted"> · outside their area</span>}
            </li>
          )}
          {styleMatch != null && <li><Palette size={14} /> {styleMatch}% style match</li>}
        </ul>

        {o.reasons.length > 0 && (
          <ul className="plan-reasons">
            {o.reasons.slice(0, 4).map((r) => (
              <li key={r}><Check size={13} /> {r}</li>
            ))}
          </ul>
        )}

        <div className="plan-actions">
          <Link className="btn accent sm grow" to={bookUrl}>Request booking</Link>
          <Link className="btn ghost sm" to={`/gallery/${p.id}`}><Images size={14} /> Work</Link>
          <Link className="btn ghost sm" to={`/u/${p.id}`}>Profile</Link>
        </div>
      </div>
    </article>
  )
}
