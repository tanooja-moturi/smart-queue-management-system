"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
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
exports.supabase = (0, supabase_js_1.createClient)(normalizedUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    }
});
exports.default = exports.supabase;
