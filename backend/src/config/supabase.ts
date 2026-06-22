import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('CRITICAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable is missing.');
  process.exit(1);
}

// Strip trailing slash and/or rest/v1 path if present to prevent client errors
let normalizedUrl = supabaseUrl;
if (normalizedUrl.endsWith('/')) {
  normalizedUrl = normalizedUrl.slice(0, -1);
}
if (normalizedUrl.endsWith('/rest/v1')) {
  normalizedUrl = normalizedUrl.slice(0, -8);
}

export const supabase = createClient(normalizedUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

export default supabase;