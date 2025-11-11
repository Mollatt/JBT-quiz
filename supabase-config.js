// Supabase Configuration
const SUPABASE_URL = 'https://jmfqxsnvfucaczwcwiih.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZnF4c252ZnVjYWN6d2N3aWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2OTY2NDIsImV4cCI6MjA3ODI3MjY0Mn0.enptbwW3m_XRKGO_lAjcDJoWIQ_OMVHvQ7ui3c3LDH4'; 

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.supabase = supabase;
