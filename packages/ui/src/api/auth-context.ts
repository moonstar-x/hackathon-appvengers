import { createContext, useContext } from 'react';
export const AuthContext = createContext<{
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
}>({ token: null, login: () => undefined, logout: () => undefined });
export function useAuth() {
  return useContext(AuthContext);
}
