import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);           // { id, email, full_name, phone, role }
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const me = await base44.auth.me();
      setUser(me);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') checkUserAuth();
      if (event === 'SIGNED_OUT') { setUser(null); setIsAuthenticated(false); }
    });
    return () => sub.subscription.unsubscribe();
  }, [checkUserAuth]);

  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    await base44.auth.logout();
  };

  const navigateToLogin = () => base44.auth.redirectToLogin(window.location.href);

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings: false, authError, authChecked,
      appPublicSettings: null, logout, navigateToLogin, checkUserAuth, checkAppState: checkUserAuth,
      isAdmin: user?.role === 'admin', isParent: user?.role === 'parent', isAthlete: user?.role === 'athlete',
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
