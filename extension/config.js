// Fill these two in after creating the Supabase project.
// Both are safe to keep in the extension. The publishable key (Supabase's
// replacement for what used to be called the anon key) grants nothing on its own,
// because every table's access rule requires a signed-in owner.
//
// It is not a JWT, so it only ever goes in the `apikey` header — never in
// `Authorization: Bearer`, which is reserved for the signed-in person's token.
export const SUPABASE_URL = "https://qjqjaeilnwtemyuqltko.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tRADuj-bXTOggblYLPW1FQ_esZArhBl";

export const isConfigured = () =>
  !SUPABASE_URL.includes("PROJECT_REF") && !SUPABASE_PUBLISHABLE_KEY.includes("PASTE");
