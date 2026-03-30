import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://jmbzrbteizvuqwukojzu.supabase.co"
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptYnpyYnRlaXp2dXF3dWtvanp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzgwOTIsImV4cCI6MjA4Njg1NDA5Mn0.Gqu3FeNnhU0X58skdhhX4woSqpk5jVd_mJ2ELxT5bGg"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

export async function rpc(fnName, params = {}) {
  try {
    const { data, error } = await supabase.rpc(fnName, params)
    if (error) throw error
    return data
  } catch (e) {
    console.warn(`RPC ${fnName} failed:`, e.message)
    return null
  }
}
