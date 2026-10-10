// Calm "thinking" state (the web's components/planner/PlanningState.jsx): what the planner
// is doing, plus pulsing skeletons where the plan will appear.
import { Sparkles } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Animated, View, type DimensionValue } from 'react-native'

import { Text } from '@/components'
import { makeStyles } from '@/theme'
import { AiMark } from './AiMark'

const STEPS = ['Reading your request', 'Splitting the budget', 'Checking vendors’ calendars', 'Ranking by style, distance and price']

export default function PlanningState({ refining = false }: { refining?: boolean }) {
  const s = useStyles()
  const [step, setStep] = useState(0)
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const t = setInterval(() => setStep((x) => Math.min(x + 1, STEPS.length - 1)), 1100)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => {
      clearInterval(t)
      loop.stop()
    }
  }, [pulse])

  const Skel = ({ w = '100%', h = 11, round = 999 }: { w?: DimensionValue; h?: number; round?: number }) => (
    <Animated.View style={[s.skel, { width: w, height: h, borderRadius: round, opacity: pulse }]} />
  )

  return (
    <View style={s.wrap} accessibilityRole="progressbar" accessibilityLiveRegion="polite" accessibilityLabel={STEPS[step]}>
      <View style={s.reply}>
        <Animated.View style={{ opacity: pulse }}>
          <AiMark icon={Sparkles} />
        </Animated.View>
        <View style={s.grow}>
          <Text variant="body" weight="700">{refining ? 'Updating your plan…' : 'Planning…'}</Text>
          <Text variant="small" muted>{STEPS[step]}</Text>
        </View>
      </View>
      <View style={s.chips}>
        {[64, 92, 70, 84].map((w, i) => <Skel key={i} w={w} h={30} />)}
      </View>
      <View style={s.card}>
        <Skel w="40%" />
        <Skel h={12} round={6} />
        <Skel />
        <Skel w="80%" />
      </View>
      <View style={[s.card, s.option]}>
        <Skel w={40} h={40} />
        <View style={[s.grow, { gap: 10 }]}>
          <Skel w="55%" />
          <Skel w="35%" />
        </View>
      </View>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: 16 },
  reply: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  grow: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  card: { borderWidth: 1, borderColor: t.c.line, borderRadius: 16, padding: 14, gap: 12, backgroundColor: t.c.card },
  option: { flexDirection: 'row', alignItems: 'center' },
  skel: { backgroundColor: t.scheme === 'dark' ? '#232326' : '#efefef' },
}))
