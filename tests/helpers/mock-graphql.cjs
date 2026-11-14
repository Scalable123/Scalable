module.exports = async function mockGraphql(context) {
  await context.route("**/graphql", (route, request) => {
    const query = request.postDataJSON()?.query || "";
    let data = { requestPasswordReset: { succeeded: true, message: "If an account exists for that email, password reset instructions are on the way." } };
    if (query.includes("register"))
      data = { register: { succeeded: true, message: "", user: { id: "test", username: "test-user", email: "test@example.test", displayName: "Test User" } } };
    else if (query.includes("login"))
      data = { login: { succeeded: true, message: "", user: { id: "test", username: "test-user", email: "test@example.test", displayName: "Test User" } } };
    else if (query.includes("me")) data = { me: null };
    else if (query.includes("logout")) data = { logout: true };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
};
