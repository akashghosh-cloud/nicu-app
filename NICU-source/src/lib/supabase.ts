import { createClient } from '@supabase/supabase-js';

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
// Strip trailing /rest/v1/ if present
if (supabaseUrl.endsWith('/rest/v1/')) {
  supabaseUrl = supabaseUrl.replace('/rest/v1/', '');
}
if (supabaseUrl.endsWith('/rest/v1')) {
  supabaseUrl = supabaseUrl.replace('/rest/v1', '');
}
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

const isPlaceholder = supabaseUrl.includes('placeholder.supabase.co') || supabaseUrl === '' || supabaseAnonKey === 'placeholder';

if (isPlaceholder) {
  console.error('Supabase configuration is missing or using placeholders. Please set your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your deployment environment variables (e.g., Netlify settings).');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
