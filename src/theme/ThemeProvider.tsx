import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

const THEME_STORAGE_KEY = 'theme-preference';

export function ThemeProvider({ children, defaultTheme = 'dark' }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [mounted, setMounted] = useState(false);

  // Load saved theme preference on mount
  useEffect(() => {
    const loadTheme = () => {
      try {
        // Try to load from localStorage
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

        if (savedTheme === 'light' || savedTheme === 'dark') {
          setThemeState(savedTheme);
        } else {
          // Fall back to system preference
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          setThemeState(prefersDark ? 'dark' : 'light');
        }
      } catch (error) {
        console.error('Failed to load theme preference:', error);
      }

      setMounted(true);
    };

    loadTheme();
  }, []);

  // Apply theme to document and save preference
  useEffect(() => {
    if (!mounted) return;

    const root = window.document.documentElement;
    root.setAttribute('data-theme', theme);

    // Also add class for compatibility with some CSS frameworks
    root.classList.remove('light', 'dark');
    root.classList.add(theme);

    // Save preference to localStorage
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (err) {
      console.error('Failed to save theme preference:', err);
    }
  }, [theme, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Prevent flash of wrong theme
  if (!mounted) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
