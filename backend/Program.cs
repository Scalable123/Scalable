using Microsoft.Extensions.FileProviders;
using Scalable.Api;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 16_384);
var frontend = Path.GetFullPath(builder.Configuration["FrontendPath"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "../frontend"));
var budgetPath = builder.Configuration["Unsplash:BudgetPath"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "data/unsplash-budget.json");
builder.Services.AddSingleton(new RequestBudget(budgetPath, TimeProvider.System));
builder.Services.AddSingleton(services => new UnsplashSource(
    new HttpClient(new SocketsHttpHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(5) },
    services.GetRequiredService<RequestBudget>(), builder.Configuration["Unsplash:AccessKey"]));
var app = builder.Build();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.Headers.CacheControl = "no-store";
        var origin = context.Request.Headers.Origin.ToString();
        if (context.Request.Headers["Sec-Fetch-Site"] == "cross-site" ||
            origin.Length > 0 && origin != $"{context.Request.Scheme}://{context.Request.Host}")
        {
            context.Response.StatusCode = 403;
            return;
        }
    }
    await next();
});
app.MapPost("/api/image-sources/unsplash", async (SearchInput input, UnsplashSource source, CancellationToken token) =>
{
    var prompt = input.Prompt?.Trim();
    if (string.IsNullOrWhiteSpace(prompt) || prompt.Length > 2000)
        return Results.BadRequest(new { error = "A prompt of 1–2000 characters is required." });
    return Results.Ok(await source.Search(prompt, token));
});
// Serve only public assets, never the repository, .env, quota state, or server files.
var files = new PhysicalFileProvider(frontend);
app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
app.UseStaticFiles(new StaticFileOptions { FileProvider = files });
app.Run();
public sealed record SearchInput(string? Prompt);
