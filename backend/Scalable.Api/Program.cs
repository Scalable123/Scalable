using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.FileProviders;
using Scalable.Api;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDataProtection().SetApplicationName("Scalable.Pinterest");
builder.Services.AddOptions<KeyManagementOptions>().Configure<IConfiguration, IWebHostEnvironment, ILoggerFactory>((options, configuration, environment, logger) => {
    var directory = Directory.CreateDirectory(Path.Combine(DataRoot(configuration, environment), "keys"));
    options.XmlRepository = new FileSystemXmlRepository(directory, logger);
});
builder.Services.AddSingleton(services => new PinterestStore(Path.Combine(DataRoot(
    services.GetRequiredService<IConfiguration>(), services.GetRequiredService<IWebHostEnvironment>()), "pinterest.db")));
builder.Services.AddSingleton<PinterestIntegration>();
builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);
builder.Services.AddHttpClient("Pinterest", c => {
    c.BaseAddress = new Uri("https://api.pinterest.com/v5/");
    c.Timeout = TimeSpan.FromSeconds(25);
    c.MaxResponseContentBufferSize = 4 * 1024 * 1024;
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddHttpClient("Supabase", c => { c.Timeout = TimeSpan.FromSeconds(15); })
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddAuthentication("Supabase").AddScheme<AuthenticationSchemeOptions, SupabaseAuthentication>("Supabase", _ => { });
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options => {
    options.RejectionStatusCode = 429;
    options.OnRejected = async (context, cancel) => {
        context.HttpContext.Response.Headers.RetryAfter = "60";
        await context.HttpContext.Response.WriteAsJsonAsync(new { error = "rate_limited", message = "Scalable's Pinterest request limit was reached. Wait a minute before retrying." }, cancel);
    };
    options.AddPolicy("pinterest", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

var app = builder.Build();
// Never log query strings: the OAuth callback contains an authorization code.
app.Use(async (context, next) => {
    if (context.Request.Path.StartsWithSegments("/api")) {
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    }
    try { await next(context); }
    catch (IntegrationException error) {
        if (error.RetryAfter is not null) context.Response.Headers.RetryAfter = error.RetryAfter;
        context.Response.StatusCode = error.Status;
        await context.Response.WriteAsJsonAsync(new { error = error.Code, message = error.Message });
    }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
    catch (Exception error) when (error is HttpRequestException or System.Text.Json.JsonException or TaskCanceledException) {
        context.Response.StatusCode = 502;
        await context.Response.WriteAsJsonAsync(new { error = "provider_unavailable", message = "The connection service is unavailable. Please retry." });
    }
});
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
var group = app.MapGroup("/api/integrations/pinterest").RequireAuthorization().RequireRateLimiting("pinterest");
app.MapGet("/api/integrations/pinterest/availability", (PinterestIntegration integration) =>
    Results.Ok(new { available = integration.Available, researchAllowed = false })).RequireRateLimiting("pinterest");
group.MapGet("", async (HttpContext context, PinterestIntegration integration) =>
    Results.Ok(await integration.Status(UserId(context), context.RequestAborted)));
group.MapPost("/authorize", async (HttpContext context, PinterestIntegration integration) =>
    Results.Ok(await integration.Authorize(context, UserId(context))));
group.MapDelete("", async (HttpContext context, PinterestIntegration integration) => {
    await integration.Disconnect(UserId(context), context.RequestAborted);
    return Results.Ok(new { status = "disconnected", providerRevocationRequired = true,
        message = "Disconnected from Scalable. Remove Scalable in Pinterest account settings to revoke Pinterest's grant." });
});
group.MapGet("/boards", async (HttpContext context, PinterestIntegration integration, string? bookmark) =>
    Results.Ok(await integration.Boards(UserId(context), bookmark, context.RequestAborted)));
group.MapGet("/boards/{id}/pins", async (HttpContext context, PinterestIntegration integration, string id, string? bookmark) =>
    Results.Ok(await integration.Pins(UserId(context), id, bookmark, context.RequestAborted)));
app.MapGet("/api/integrations/pinterest/callback", async (HttpContext context, PinterestIntegration integration) =>
    await integration.Callback(context)).RequireRateLimiting("pinterest");

var frontend = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
if (!Directory.Exists(frontend)) frontend = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "../../frontend"));
if (Directory.Exists(frontend)) {
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = new PhysicalFileProvider(frontend), RequestPath = "/frontend" });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(frontend), RequestPath = "/frontend" });
}
app.MapGet("/", () => Results.Redirect("/frontend/index.html"));
app.Run();

static string UserId(HttpContext context) => context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
static string DataRoot(IConfiguration configuration, IWebHostEnvironment environment) =>
    Path.GetFullPath(configuration["DataPath"] ?? Path.Combine(environment.ContentRootPath, "data"));
public partial class Program { }
