import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { api, setToken, getToken } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (usuario: string, clave: string) => Promise<User>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('rwd_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (token) {
      setToken(token);
    }
  }, [token]);

  const login = async (usuario: string, clave: string): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await api<{ token: string; usuario: User }>('/api/login', {
        method: 'POST',
        body: JSON.stringify({ usuario, clave }),
      });
      setToken(res.token);
      setTokenState(res.token);
      setUser(res.usuario);
      localStorage.setItem('rwd_user', JSON.stringify(res.usuario));
      return res.usuario;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    localStorage.removeItem('rwd_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
