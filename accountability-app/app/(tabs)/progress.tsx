import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { currentStreak, longestStreak } from '../../src/lib/streaks';
import { useStore } from '../../src/state/store';
import { useTheme } from '../../src/ui/theme';

export default function Progress() {
  const t = useTheme();
  const { goals, checkIns } = useStore();
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {goals.length === 0 && <Text style={{ color: t.muted, textAlign: 'center', marginTop: 48 }}>Your streaks will show up here.</Text>}
      {goals.map((g) => {
        const days = checkIns[g.id] ?? [];
        return (
          <View key={g.id} style={[s.card, { backgroundColor: t.card, borderColor: t.border }]}>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>{g.title}</Text>
            <Text style={{ color: t.muted }}>Current streak: {currentStreak(days)} · Best: {longestStreak(days)} · Total: {days.length}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({ card: { padding: 16, borderRadius: 14, borderWidth: 1, gap: 4 } });
