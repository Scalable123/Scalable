// Keep synthetic login/recovery checks away from the real auth project.
module.exports = async function mockSupabase(context) {
  await context.route("**/js/config/supabaseClient.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: `
      const record = (method, details = {}) => { (window.__authCalls ||= []).push({ method, ...details }); };
      export const supabase = { auth: {
        async signInWithPassword({ email }) { record('signInWithPassword', { email }); return { error: null }; },
        async resetPasswordForEmail(email, { redirectTo }) { record('resetPasswordForEmail', { email, redirectTo }); return { error: null }; },
        async getSession() { record('getSession'); return { data: { session: null }, error: null }; },
        async signOut() { record('signOut'); return { error: null }; }
      } };
    `,
    }),
  );
};
