"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = exports.supabase = void 0;
const supabase_1 = require("./supabase");
Object.defineProperty(exports, "supabase", { enumerable: true, get: function () { return supabase_1.supabase; } });
const connectDB = async () => {
    try {
        // Simple query to verify connection to the tables
        const { error } = await supabase_1.supabase.from('users').select('count', { count: 'exact', head: true });
        if (error) {
            // Check if table missing error (PGRST205)
            if (error.code === 'PGRST205' || error.message.includes('public.users') || error.message.includes('relation "users" does not exist')) {
                console.warn("⚠️ WARNING: Table 'users' not found in Supabase. The server has started successfully, but you MUST execute the schema SQL script (supabase_schema.sql) in your Supabase SQL Editor for database operations to work.");
                return;
            }
            throw error;
        }
        console.log('Supabase Connected Successfully');
    }
    catch (error) {
        console.error(`Error connecting to Supabase: ${error.message}`);
        process.exit(1);
    }
};
exports.connectDB = connectDB;
