import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, UserRole } from '../types';

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, session.user);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string, userAuth: any) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('Profiles table fetch error or record missing, using auth metadata:', error.message);
        
        // Try to get info from auth metadata
        const metadata = userAuth?.user_metadata || {};
        const email = userAuth?.email || 'user@example.com';
        const name = metadata.full_name || metadata.name || email.split('@')[0];
        
        setProfile({
          id: userId,
          email: email,
          name: name,
          emp_id: metadata.emp_id || 'E-' + userId.slice(0, 4).toUpperCase(),
          roles: metadata.roles || ['RN'] as UserRole[]
        });
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error('Profile fetch failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return { user, profile, loading };
}
