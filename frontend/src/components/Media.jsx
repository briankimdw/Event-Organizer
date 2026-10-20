import BeforeAfterSlider from './beforeafter/BeforeAfter.jsx'

// Back-compat wrapper (old props): src is the edited photo, beforeSrc the original; without a
// beforeSrc the "before" side fakes an unedited look with a CSS filter. New code: import
// components/beforeafter/BeforeAfter.jsx directly ({ before, after, alt, ... }; spec at its top).
export function BeforeAfter({ src, beforeSrc, aspect = '4 / 5', ...rest }) {
  return <BeforeAfterSlider before={beforeSrc} after={src} aspect={aspect} {...rest} />
}
