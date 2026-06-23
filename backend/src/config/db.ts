import { supabase } from './supabase';

export { supabase };

export const connectDB = async () => {
  try {
    // Simple query to verify connection to the tables
    const { error } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (error) {
      // Check if table missing error (PGRST205)
      if (error.code === 'PGRST205' || error.message.includes('public.users') || error.message.includes('relation "users" does not exist')) {
        console.warn(
          "⚠️ WARNING: Table 'users' not found in Supabase. The server has started successfully, but you MUST execute the schema SQL script (supabase_schema.sql) in your Supabase SQL Editor for database operations to work."
        );
        return;
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
