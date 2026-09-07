'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'dashboard-theme-dark';

type DashboardThemeContextValue = {
  dark: boolean;
  setDark: (value: boolean) => void;
  toggleDark: () => void;
};

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(null);

function readStored(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

export function DashboardThemeProvider({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [dark, setDarkState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDarkState(readStored());
    setMounted(true);
  }, []);

  const setDark = useCallback((value: boolean) => {
    setDarkState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {}
  }, []);

  const toggleDark = useCallback(() => {
    setDarkState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.getElementById('dashboard-theme-root');
    if (!root) return;
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [dark, mounted]);

  const value: DashboardThemeContextValue = { dark, setDark, toggleDark };

  return (
    <DashboardThemeContext.Provider value={value}>
      <div
        id="dashboard-theme-root"
        className={cn('min-h-screen', className)}
        data-theme={dark ? 'dark' : 'light'}
      >
        {children}
      </div>
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme(): DashboardThemeContextValue {
  const ctx = useContext(DashboardThemeContext);
  if (!ctx) {
    throw new Error('useDashboardTheme must be used inside DashboardThemeProvider');
  }
  return ctx;
}
