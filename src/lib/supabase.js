import { createClient } from '@supabase/supabase-js'

// La chiave publishable è pubblica per design (stessa dell'app staff).
// Fallback integrati così l'app funziona anche senza .env su Vercel.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://kiqghrxygraijcozdmkp.supabase.co'
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Xe-A0AblftHuIyHVdI_vpg_-RqQwWON'

export const supabase = createClient(URL, KEY, { auth: { persistSession: false } })
