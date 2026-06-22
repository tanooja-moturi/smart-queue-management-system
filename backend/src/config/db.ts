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

export const connectDB = async () => {
  try {
    // Simple query to verify connection to the tables
    const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    if (error) throw error;
    console.log('Supabase Connected Successfully');
  } catch (error) {
    console.error(`Error connecting to Supabase: ${(error as Error).message}`);
    process.exit(1);
  }
};
