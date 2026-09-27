// Supabase project configuration for live rooms.
//
// The anon (public) key is SAFE to expose in client-side code — access is
// controlled by the scoped RPCs and grants in supabase/migrations/.
//
// Fill these in from your Supabase dashboard (Settings -> API):
//   Project URL       => url
//   Publishable key   => publishableKey  (the "sb_publishable_..." value)
//
// Optional accounts stay hidden until a provider is listed here. Enable the
// provider in Supabase first (see docs/ACCOUNTS.md), then add 'google',
// 'discord', and/or 'github'. Games and invitations never require an account.
window.SUPABASE_CONFIG = {
    url: 'https://gghixlqrgwwfgramgvon.supabase.co',
    publishableKey: 'sb_publishable_OOZSdrQpGXvBRs_JPpwUEg_On0CyNq2',
    accountProviders: ['google', 'discord', 'github']
};
