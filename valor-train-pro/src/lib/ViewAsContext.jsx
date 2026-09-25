import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';

const ViewAsContext = createContext(null);

/**
 * Admin "View as athlete" mode. An admin picks ONE athlete and the parent-side
 * screens render scoped to just that kid, read-only. The athlete id lives in
 * the URL (/admin/view-as-athlete/:athleteId/...), set by the ViewAsAthlete
 * shell, so back/forward, refresh and switching athletes all behave; leaving
 * the shell clears it. (A sessionStorage version kept the old athlete stuck
 * after the browser back button, 9/24/2026.)
 */
export function ViewAsProvider({ children }) {
  const [viewAsAthleteId, setViewAsAthleteId] = useState(null);
  const [athlete, setAthlete] = useState(null);

  const enterViewAs = useCallback((athleteId) => { setViewAsAthleteId(athleteId || null); }, []);
  const exitViewAs = useCallback(() => { setViewAsAthleteId(null); setAthlete(null); }, []);

  useEffect(() => {
    if (!viewAsAthleteId) { setAthlete(null); return; }
    let cancelled = false;
    setAthlete(null);
    supabase.from('athletes').select('*').eq('id', viewAsAthleteId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setAthlete(data || { id: viewAsAthleteId, missing: true }); });
    return () => { cancelled = true; };
  }, [viewAsAthleteId]);

  const basePath = viewAsAthleteId ? `/admin/view-as-athlete/${viewAsAthleteId}` : '';
  const ready = !!athlete && athlete.id === viewAsAthleteId;

  return (
    <ViewAsContext.Provider value={{ isActive: !!viewAsAthleteId, viewAsAthleteId, athlete: ready ? athlete : null, loading: !!viewAsAthleteId && !ready, basePath, enterViewAs, exitViewAs }}>
      {children}
    </ViewAsContext.Provider>
  );
}

const fallback = { isActive: false, viewAsAthleteId: null, athlete: null, loading: false, basePath: '', enterViewAs: () => {}, exitViewAs: () => {} };
export const useViewAs = () => useContext(ViewAsContext) || fallback;
