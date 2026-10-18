import { useColorScheme } from 'react-native';

const light = { bg: '#F7F7F8', card: '#FFFFFF', text: '#111827', muted: '#6B7280', border: '#E5E7EB', accent: '#4F46E5', done: '#16A34A' };
const dark = { bg: '#0B0B0F', card: '#17171C', text: '#F3F4F6', muted: '#9CA3AF', border: '#2A2A33', accent: '#818CF8', done: '#4ADE80' };

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}
