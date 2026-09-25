import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';

const STORAGE_KEY = 'vtp.viewAsAthleteId';
const ViewAsContext = createContext(null);

/**
 * Admin "View as family" mode. An admin picks one athlete; we resolve the
 * whole family (every athlete sharing that parent_id) and the parent's
 * profile, then the parent-side screens render scoped to that family instead
 * of the signed-in admin. Read-only by design — nothing here ever writes.
 * The chosen athlete id lives in sessionStorage so a refresh keeps the view.
 */
export function ViewAsProvider({ children }) {
  const [viewAsAthleteId, setViewAsAthleteId] = useState(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) || null; } catch { return null; }
  });
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(false);

  const enterViewAs = useCallback((athleteId) => {
    try { sessionStorage.setItem(STORAGE_KEY, athleteId); } catch { /* ignore */ }
    setFamily(null);
    setViewAsAthleteId(athleteId);
  }, []);

  const exitViewAs = useCallback(() => {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setViewAsAthleteId(null);
    setFamily(null);
  }, []);

  useEffect(() => {
    if (!viewAsAthleteId) { setFamily(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: seed } = await supabase.from('athletes').select('*').eq('id', viewAsAthleteId).maybeSingle();
      if (!seed) { if (!cancelled) { setFamily(null); setLoading(false); } return; }
      // The family is every athlete sharing the same parent_id; no parent_id → just this athlete.
      let athletes = [seed];
      if (seed.parent_id) {
        const { data: sibs } = await supabase.from('athletes').select('*').eq('parent_id', seed.parent_id).order('first_name');
        if (sibs?.length) athletes = sibs;
      }
      let parent = null;
      if (seed.parent_id) {
        const { data: p } = await supabase.from('profiles').select('id, full_name, email').eq('id', seed.parent_id).maybeSingle();
        parent = p;
      }
      if (!cancelled) {
        setFamily({ parentId: seed.parent_id || null, parent, athletes, athleteIds: athletes.map((a) => a.id) });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewAsAthleteId]);

  return (
    <ViewAsContext.Provider value={{ isActive: !!viewAsAthleteId, viewAsAthleteId, family, loading, enterViewAs, exitViewAs }}>
      {children}
    </ViewAsContext.Provider>
  );
}

const fallback = { isActive: false, viewAsAthleteId: null, family: null, loading: false, enterViewAs: () => {}, exitViewAs: () => {} };
export const useViewAs = () => useContext(ViewAsContext) || fallback;
