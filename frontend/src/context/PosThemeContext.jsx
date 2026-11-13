import { createContext, useContext } from 'react';

const PosThemeContext = createContext(false);

export function PosThemeProvider({ children }) {
  return <PosThemeContext.Provider value={true}>{children}</PosThemeContext.Provider>;
}

export function usePosTheme() {
  return useContext(PosThemeContext);
}
