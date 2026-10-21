import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AppData,
  Entry,
  Goal,
  Medication,
  Profile,
  Settings,
} from "../types";
import * as store from "../lib/store";
import { todayISO } from "../lib/dates";

type Toast = { id: number; message: string; tone: "ok" | "warn" };

type AppContextValue = {
  data: AppData;
  today: string;
  toasts: Toast[];
  notify: (message: string, tone?: "ok" | "warn") => void;
  dismissToast: (id: number) => void;
  saveEntry: (input: Partial<Entry> & { date: string }) => void;
  deleteEntry: (id: string) => void;
  importEntries: (entries: Entry[]) => void;
  setGoals: (goals: Goal[]) => void;
  setDailyQuestion: (q: { date: string; question: string; answer: string } | null) => void;
  setMedications: (meds: Medication[]) => void;
  toggleMedication: (date: string, medId: string) => void;
  setProfile: (profile: Profile) => void;
  setSettings: (settings: Settings) => void;
  resetAll: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(store.getState());
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => store.subscribe(setData), []);

  const notify = useCallback((message: string, tone: "ok" | "warn" = "ok") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<AppContextValue>(() => {
    const wrap = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
      fn(...args);
    };
    return {
      data,
      today: todayISO(),
      toasts,
      notify,
      dismissToast,
      saveEntry: (input) => wrap(store.saveEntry)(input),
      deleteEntry: (id) => wrap(store.deleteEntry)(id),
      importEntries: (entries) => wrap(store.importEntries)(entries),
      setGoals: (goals) => wrap(store.setGoals)(goals),
      setDailyQuestion: (q) => wrap(store.setDailyQuestion)(q),
      setMedications: (meds) => wrap(store.setMedications)(meds),
      toggleMedication: (date, medId) => wrap(store.toggleMedication)(date, medId),
      setProfile: (profile) => wrap(store.setProfile)(profile),
      setSettings: (settings) => wrap(store.setSettings)(settings),
      resetAll: () => wrap(store.resetAll)(),
    };
  }, [data, toasts, notify, dismissToast]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

/** Convenience: today's entry (or undefined). */
export function useTodayEntry(): Entry | undefined {
  const { data, today } = useApp();
  return useMemo(() => data.entries.find((e) => e.date === today), [data.entries, today]);
}
