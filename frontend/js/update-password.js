import { supabase } from "./config/supabaseClient.js";

const form = document.querySelector("#update-password-form");
const status = document.querySelector("#update-password-status");
const { data } = await supabase.auth.getSession();

if (!data.session) {
  form.hidden = true;
  status.textContent =
    "This recovery link is invalid or has expired. Request a new one from the login page.";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#new-password").value;
  const confirmation = document.querySelector("#confirm-password").value;
  if (password !== confirmation) {
    status.textContent = "Passwords do not match.";
    return;
  }
  status.textContent = "Updating password…";
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    status.textContent =
      "We could not update your password. Request a new recovery link and try again.";
    return;
  }
  await supabase.auth.signOut();
  form.reset();
  status.textContent = "Password updated. You can now sign in.";
});
