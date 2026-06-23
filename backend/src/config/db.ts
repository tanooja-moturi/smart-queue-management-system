import { supabase } from './supabase';

export { supabase };

export const connectDB = async () => {
  try {
    // Simple query to verify connection to the tables
    const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    if (error) {
      if (error.code === 'PGRST205' || error.message.includes('public.users') || error.message.includes('relation "users" does not exist')) {
        throw new Error(
          "Table 'users' not found in Supabase. Please ensure you have executed the schema SQL script (supabase_schema.sql) in your Supabase SQL Editor."
        );
      }
      throw error;
    }
    console.log('Supabase Connected Successfully');
  } catch (error) {
    console.error('========================');
    console.error('FULL SUPABASE ERROR');
    console.error(error);
    console.error('========================');
    process.exit(1);
  }
};
