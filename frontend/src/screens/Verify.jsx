import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, IdCard, ScanFace, ShieldCheck } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import { useStore } from '../store.jsx'

const STEPS = ['Consent', 'Photo ID', 'Selfie', 'Done']

export default function Verify() {
  const navigate = useNavigate()
  const { setIdentityStatus } = useStore()
  const [step, setStep] = useState(0)
  const [consent, setConsent] = useState(false)

  const finish = () => {
    setIdentityStatus('verified')
    navigate(-1)
  }

  return (
    <div>
      <TopBar title="Verify identity" />
      <div className="pad">
        <div className="steps">
          {STEPS.map((s, i) => (
            <div key={s} className={`step ${i <= step ? 'on' : ''}`}>
              <span>{i + 1}</span>
              {s}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="center-col">
            <ShieldCheck size={48} className="accent-text" />
            <h3>Confirm it's really you</h3>
            <p className="muted small">
              You need to verify your identity before you can accept paid bookings or get paid. You'll scan a government ID and take a quick selfie. This is free and separate from Verified Pro.
            </p>
            <div className="note left-text">
              Verification is handled by Stripe Identity. We only keep whether you passed, never your ID images or face data.
            </div>
            <label className="check-row mt left-text">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="small">I consent to the collection and processing of my biometric data (face scan) for identity verification, as described in the Privacy Policy.</span>
            </label>
            <button className="btn accent block mt" disabled={!consent} onClick={() => setStep(1)}>Continue</button>
          </div>
        )}

        {step === 1 && (
          <div className="center-col">
            <div className="scan-frame id"><IdCard size={56} /></div>
            <h3>Scan your photo ID</h3>
            <p className="muted small">Driver's license, passport or national ID card. Make sure all four corners are visible.</p>
            <button className="btn accent block mt" onClick={() => setStep(2)}>Capture ID</button>
          </div>
        )}

        {step === 2 && (
          <div className="center-col">
            <div className="scan-frame face"><ScanFace size={64} /></div>
            <h3>Take a selfie</h3>
            <p className="muted small">We'll match your face to the photo on your ID. Turn your head slowly when prompted.</p>
            <button className="btn accent block mt" onClick={() => setStep(3)}>Start selfie check</button>
          </div>
        )}

        {step === 3 && (
          <div className="center-col">
            <CheckCircle2 size={56} className="ok" />
            <h3>You're verified</h3>
            <p className="muted small">An ID-verified badge now appears on your profile, and you can accept paid bookings.</p>
            <button className="btn block mt" onClick={finish}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}
