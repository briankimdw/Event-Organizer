import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dayKey } from '../lib/dates';
import type { AppData, Goal } from '../lib/types';

const KEY = 'accountable:v1';
const EMPTY: AppData = { goals: [], checkIns: {} };

type Store = {
  ready: boolean;
  goals: Goal[];
  checkIns: AppData['checkIns'];
  addGoal: (title: string, why: string) => void;
  archiveGoal: (id: string) => void;
  /** Toggle completion of a goal for a given day (defaults to today). */
  toggleCheckIn: (goalId: string, day?: string) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setData(JSON.parse(raw)))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setData((prev) => {
      const next = fn(prev);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      ready,
      goals: data.goals.filter((g) => !g.archived),
      checkIns: data.checkIns,
      addGoal: (title, why) =>
        update((d) => ({
          ...d,
          goals: [
            ...d.goals,
            { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: title.trim(), why: why.trim(), createdAt: new Date().toISOString(), archived: false },
          ],
        })),
      archiveGoal: (id) => update((d) => ({ ...d, goals: d.goals.map((g) => (g.id === id ? { ...g, archived: true } : g)) })),
      toggleCheckIn: (goalId, day = dayKey()) =>
        update((d) => {
          const days = d.checkIns[goalId] ?? [];
          const next = days.includes(day) ? days.filter((x) => x !== day) : [...days, day];
          return { ...d, checkIns: { ...d.checkIns, [goalId]: next } };
        }),
    }),
    [data, ready, update],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}
