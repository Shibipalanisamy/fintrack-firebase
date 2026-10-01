import { createContext, useContext, useState, useEffect } from 'react';
const Ctx = createContext(null);
export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
  useEffect(() => { localStorage.setItem('theme', isDark ? 'dark' : 'light'); document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light'); }, [isDark]);
  return <Ctx.Provider value={{ isDark, toggle: () => setIsDark(p => !p) }}>{children}</Ctx.Provider>;
};
export const useTheme = () => useContext(Ctx);