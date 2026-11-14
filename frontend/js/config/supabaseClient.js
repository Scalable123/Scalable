import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./supabase-config.js";

const supabaseUrl = supabaseConfig.url;
const supabasePublishableKey = supabaseConfig.publishableKey;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing Supabase URL or publishable key. " +
      "Set them in frontend/js/config/supabase-config.js."
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
