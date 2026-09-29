'use client';

import React, { createContext, useContext, useState } from 'react';
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
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SESSION_KEY = 'axirom_session';

function readSession(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SESSION_KEY) || '';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string>(() => readSession());
  const [ready] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('axirom_user');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return authConfig.demoUsers[0] as UserProfile;
  });

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
        localStorage.setItem('axirom_user', JSON.stringify(found));
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
      localStorage.setItem('axirom_user', JSON.stringify(user));
    }
    return true;
  };

  const logout = () => {
    setApiKey('');
    const defaultUser = authConfig.demoUsers[0] as UserProfile;
    setCurrentUser(defaultUser);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('axirom_user');
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
