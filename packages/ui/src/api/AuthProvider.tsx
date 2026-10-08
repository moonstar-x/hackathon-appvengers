import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthContext } from './auth-context';
import { loadSession, saveSession } from './client';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(loadSession);
  const query = useQueryClient();
  function update(value: string | null) {
    saveSession(value);
    setToken(value);
    query.clear();
  }
  useEffect(() => {
    const expired = () => {
      setToken(null);
      query.clear();
    };
    window.addEventListener('club-session-expired', expired);
    return () => window.removeEventListener('club-session-expired', expired);
  }, [query]);
  return (
    <AuthContext.Provider value={{ token, login: update, logout: () => update(null) }}>
      {children}
    </AuthContext.Provider>
  );
}
