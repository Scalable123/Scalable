import { graphqlRequest } from "./config/graphqlClient.js";

const form = document.querySelector("#update-password-form");
const status = document.querySelector("#update-password-status");
const params = new URLSearchParams(window.location.search);
const email = params.get("email") || "";
const token = params.get("token") || "";

if (!email || !token) {
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
  let result;
  try {
    result = await graphqlRequest(
      `mutation ResetPassword($input: PasswordResetInput!) {
        resetPassword(input: $input) { succeeded message }
      }`,
      { input: { email, token, password } },
    );
  } catch {
    status.textContent =
      "We could not update your password. Request a new recovery link and try again.";
    return;
  }
  if (!result.resetPassword.succeeded) {
    status.textContent = result.resetPassword.message;
    return;
  }
  form.reset();
  status.textContent = result.resetPassword.message;
});
