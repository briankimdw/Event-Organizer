import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from '../src/state/store';
import { useTheme } from '../src/ui/theme';

export default function NewGoal() {
  const t = useTheme();
  const router = useRouter();
  const { addGoal } = useStore();
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const canSave = title.trim().length > 0;

  const input = [s.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }];
  return (
    <View style={[s.screen, { backgroundColor: t.bg }]}>
      <TextInput style={input} placeholder="What will you do daily? (e.g. Gym)" placeholderTextColor={t.muted} value={title} onChangeText={setTitle} autoFocus />
      <TextInput style={input} placeholder="Why does it matter?" placeholderTextColor={t.muted} value={why} onChangeText={setWhy} />
      <Pressable
        disabled={!canSave}
        onPress={() => {
          addGoal(title, why);
          router.back();
        }}
        style={[s.btn, { backgroundColor: t.accent, opacity: canSave ? 1 : 0.4 }]}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Save goal</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 },
  btn: { padding: 16, borderRadius: 12, alignItems: 'center' },
});
