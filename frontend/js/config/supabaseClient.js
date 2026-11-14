import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
import { supabaseConfig } from "./supabase-config.js";

const supabaseUrl = supabaseConfig.url;
const supabasePublishableKey = supabaseConfig.publishableKey;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing Supabase URL or publishable key. " +
      "Set them in frontend/js/config/supabase-config.js.",
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
