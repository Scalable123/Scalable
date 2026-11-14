# Scalable.Api

ASP.NET Core GraphQL backend for Scalable Studio.

## Run

```powershell
dotnet run
```

Open the GraphQL endpoint shown by the terminal, then run:

```graphql
query {
  serviceStatus {
    name
    message
    checkedAt
  }
  boards {
    id
    title
    description
  }
}
```

The current `boards` field is intentionally empty until EF Core persistence and
authenticated ownership are implemented. Do not add secrets to this project or
commit connection strings. Use environment variables or local user secrets.

## Planned layers

- `GraphQL/`: queries, mutations, input types, and authorization boundaries.
- `Data/`: EF Core context, entities, configurations, and migrations.
- `Identity/`: ASP.NET Core Identity, email verification, and password recovery.
- `Integrations/`: server-side AI and provider integrations.
