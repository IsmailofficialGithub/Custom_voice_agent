'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import authConfig from '../config/auth.json';
import { apiClient } from '../lib/api-client';

export interface UserRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
}

interface AuthContextType {
  currentUser: UserProfile;
  roles: UserRole[];
  demoUsers: UserProfile[];
  apiKey: string;
  ready: boolean;
  setApiKey: (key: string) => void;
  switchUser: (userId: string) => void;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithApiKey: (key: string) => boolean;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SESSION_KEY = 'axiomra_session';
const DEFAULT_KEY = process.env.NEXT_PUBLIC_DEFAULT_API_KEY || 'dev-secret-key-change-me';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string>('');
  const [ready, setReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile>(authConfig.demoUsers[0] as UserProfile);

  useEffect(() => {
    const savedKey = localStorage.getItem(SESSION_KEY);
    const activeKey = savedKey !== null && savedKey !== '' ? savedKey : DEFAULT_KEY;
    if (activeKey) {
      setApiKeyState(activeKey);
      if (!savedKey && typeof window !== 'undefined') {
        localStorage.setItem(SESSION_KEY, activeKey);
      }
    }
    const saved = localStorage.getItem('axiomra_user');
    if (saved) {
      try {
        setCurrentUser(JSON.parse(saved));
      } catch {}
    }
    setReady(true);
  }, []);

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    if (typeof window !== 'undefined') {
      if (key) localStorage.setItem(SESSION_KEY, key);
      else localStorage.removeItem(SESSION_KEY);
    }
  };

  const switchUser = (userId: string) => {
    const found = authConfig.demoUsers.find((u) => u.id === userId);
    if (found) {
      setCurrentUser(found as UserProfile);
      if (typeof window !== 'undefined') {
        localStorage.setItem('axiomra_user', JSON.stringify(found));
      }
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    const res = await apiClient.login(email, password);
    setApiKey(res.token);
    const user: UserProfile = {
      id: 'env-user',
      name: email.split('@')[0],
      email: res.email,
      role: 'admin',
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(res.email)}`,
    };
    setCurrentUser(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('axiomra_user', JSON.stringify(user));
    }
    return true;
  };

  const loginWithApiKey = (key: string): boolean => {
    const trimmed = (key || '').trim();
    if (!trimmed) throw new Error('API key cannot be empty');
    setApiKey(trimmed);
    const user: UserProfile = {
      id: 'api-key-user',
      name: 'Developer',
      email: 'dev@axiomra.ai',
      role: 'admin',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus',
    };
    setCurrentUser(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('axiomra_user', JSON.stringify(user));
    }
    return true;
  };

  const logout = () => {
    setApiKey('');
    const defaultUser = authConfig.demoUsers[0] as UserProfile;
    setCurrentUser(defaultUser);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('axiomra_user');
      localStorage.removeItem(SESSION_KEY);
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!apiKey) return false;
    const userRole = authConfig.roles.find((r) => r.id === currentUser.role);
    if (!userRole) return true;
    if (userRole.permissions.includes('all')) return true;
    return userRole.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        roles: authConfig.roles as UserRole[],
        demoUsers: authConfig.demoUsers as UserProfile[],
        apiKey,
        ready,
        setApiKey,
        switchUser,
        login,
        loginWithApiKey,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
