import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';

const STORAGE_KEY = 'vtp.viewAsAthleteId';
const ViewAsContext = createContext(null);

/**
 * Admin "View as athlete" mode. An admin picks ONE athlete and the parent-side
 * screens render scoped to just that kid — their results, their workouts,
 * their nutrition, their progress, their enrollment lock — with no sibling
 * picker or "all" option, since many kids don't have a full family or a
 * parent login. Read-only by design — nothing here ever writes. The chosen
 * athlete id lives in sessionStorage so a refresh keeps the view.
 */
export function ViewAsProvider({ children }) {
  const [viewAsAthleteId, setViewAsAthleteId] = useState(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) || null; } catch { return null; }
  });
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(false);

  const enterViewAs = useCallback((athleteId) => {
    try { sessionStorage.setItem(STORAGE_KEY, athleteId); } catch { /* ignore */ }
    setAthlete(null);
    setViewAsAthleteId(athleteId);
  }, []);

  const exitViewAs = useCallback(() => {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setViewAsAthleteId(null);
    setAthlete(null);
  }, []);

  useEffect(() => {
    if (!viewAsAthleteId) { setAthlete(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase.from('athletes').select('*').eq('id', viewAsAthleteId).maybeSingle();
      if (!cancelled) { setAthlete(data || null); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [viewAsAthleteId]);

  return (
    <ViewAsContext.Provider value={{ isActive: !!viewAsAthleteId, viewAsAthleteId, athlete, loading, enterViewAs, exitViewAs }}>
      {children}
    </ViewAsContext.Provider>
  );
}

const fallback = { isActive: false, viewAsAthleteId: null, athlete: null, loading: false, enterViewAs: () => {}, exitViewAs: () => {} };
export const useViewAs = () => useContext(ViewAsContext) || fallback;
