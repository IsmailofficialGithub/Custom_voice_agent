'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import authConfig from '../config/auth.json';

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
  setApiKey: (key: string) => void;
  switchUser: (userId: string) => void;
  login: (email: string, role?: string) => boolean;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const DEFAULT_API_KEY = 'dev-secret-key-change-me';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('axirom_user');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return authConfig.demoUsers[0] as UserProfile; // default Sarah Connor (Admin)
  });

  const [apiKey, setApiKeyState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('axirom_api_key') || DEFAULT_API_KEY;
    }
    return DEFAULT_API_KEY;
  });

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    if (typeof window !== 'undefined') {
      localStorage.setItem('axirom_api_key', key);
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

  const login = (email: string, role = 'developer'): boolean => {
    const newUser: UserProfile = {
      id: `u-${Date.now()}`,
      name: email.split('@')[0],
      email,
      role,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
    };
    setCurrentUser(newUser);
    if (typeof window !== 'undefined') {
      localStorage.setItem('axirom_user', JSON.stringify(newUser));
    }
    return true;
  };

  const logout = () => {
    const defaultUser = authConfig.demoUsers[0] as UserProfile;
    setCurrentUser(defaultUser);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('axirom_user');
    }
  };

  const hasPermission = (permission: string): boolean => {
    const userRole = authConfig.roles.find((r) => r.id === currentUser.role);
    if (!userRole) return false;
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
