const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const defaultEndpoint = localHosts.has(window.location.hostname)
  ? "http://localhost:5078/graphql"
  : "https://scalable-5rgd.onrender.com/graphql";
const endpoint = window.GRAPHQL_ENDPOINT || defaultEndpoint;

export async function graphqlRequest(query, variables = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) throw new Error("The GraphQL server is unavailable.");

  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors[0].message);
  return payload.data;
}
