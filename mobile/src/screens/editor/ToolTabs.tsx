// The editor's bottom tool tabs: Presets · Light · Color · Effects · Crop · AI.
// A real tab list for screen readers ("tab, 2 of 5, selected"), 44pt+ targets.
import { Aperture, Crop, Palette, Sparkles, Sun, WandSparkles, type LucideIcon } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { Text } from '@/components'
import { makeStyles, useTheme } from '@/theme'

export type ToolId = 'presets' | 'light' | 'color' | 'effects' | 'crop' | 'ai'

export const TOOLS: { id: ToolId; label: string; icon: LucideIcon }[] = [
  { id: 'presets', label: 'Presets', icon: Sparkles },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'effects', label: 'Effects', icon: Aperture },
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'ai', label: 'AI', icon: WandSparkles },
]

export function ToolTabs({ value, onChange, edited }: { value: ToolId; onChange: (t: ToolId) => void; edited: Partial<Record<ToolId, boolean>> }) {
  const s = useStyles()
  const { c } = useTheme()
  return (
    <View style={s.bar} accessibilityRole="tablist" accessibilityLabel="Editing tools">
      {TOOLS.map((tool, i) => {
        const active = tool.id === value
        const Icon = tool.icon
        return (
          <Pressable
            key={tool.id}
            onPress={() => onChange(tool.id)}
            style={({ pressed }) => [s.tab, pressed && { opacity: 0.6 }]}
            accessibilityRole="tab"
            accessibilityLabel={`${tool.label}${edited[tool.id] ? ', edited' : ''}`}
            accessibilityHint={`Tab ${i + 1} of ${TOOLS.length}`}
            accessibilityState={{ selected: active }}
          >
            <View>
              <Icon size={22} color={active ? c.ink : c.faint} strokeWidth={active ? 2.2 : 1.8} />
              {edited[tool.id] ? <View style={s.dot} /> : null}
            </View>
            <Text variant="caption" style={{ color: active ? c.ink : c.faint, marginTop: 3 }} maxFontSizeMultiplier={1.3} numberOfLines={1}>
              {tool.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.c.line, backgroundColor: t.c.bg },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56, paddingVertical: 6 },
  dot: { position: 'absolute', top: -2, right: -6, width: 6, height: 6, borderRadius: 3, backgroundColor: t.c.accent },
}))
