using Scalable.Api.GraphQL;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddAuthorization();
builder.Services
    .AddGraphQLServer()
    .AddAuthorization()
    .AddQueryType<Query>();

var app = builder.Build();

app.UseAuthorization();
app.MapGraphQL("/graphql");

app.Run();
