import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_ORAKL_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_ORAKL_SUPABASE_ANON_KEY!;

export const supabaseOrakl = createClient(url, anon);
