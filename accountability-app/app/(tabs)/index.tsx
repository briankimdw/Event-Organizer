import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { dayKey } from '../../src/lib/dates';
import { currentStreak } from '../../src/lib/streaks';
import { useStore } from '../../src/state/store';
import { useTheme } from '../../src/ui/theme';

export default function Today() {
  const t = useTheme();
  const router = useRouter();
  const { goals, checkIns, toggleCheckIn, ready } = useStore();
  const today = dayKey();

  return (
    <View style={[s.screen, { backgroundColor: t.bg }]}>
      <FlatList
        data={goals}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={
          ready ? <Text style={{ color: t.muted, textAlign: "center", marginTop: 48 }}>No goals yet. Add one to start holding yourself to it.</Text> : undefined
        }
        renderItem={({ item }) => {
          const days = checkIns[item.id] ?? [];
          const done = days.includes(today);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              onPress={() => toggleCheckIn(item.id)}
              style={[s.card, { backgroundColor: t.card, borderColor: done ? t.done : t.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.title, { color: t.text }]}>{item.title}</Text>
                {item.why ? <Text style={{ color: t.muted }}>{item.why}</Text> : null}
                <Text style={{ color: t.muted, marginTop: 4 }}>🔥 {currentStreak(days)} day streak</Text>
              </View>
              <Text style={{ fontSize: 28 }}>{done ? '✅' : '⬜️'}</Text>
            </Pressable>
          );
        }}
      />
      <Pressable onPress={() => router.push('/new-goal')} style={[s.fab, { backgroundColor: t.accent }]} accessibilityLabel="Add goal">
        <Text style={{ color: '#fff', fontSize: 28, lineHeight: 30 }}>+</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1.5 },
  title: { fontSize: 17, fontWeight: '600' },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
