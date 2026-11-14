using System.Threading.RateLimiting;
using Path = System.IO.Path;
using Scalable.Api.GraphQL;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Scalable.Api.Data;
using Scalable.Api.Identity;
using Scalable.Api;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

var dataRoot = DataRoot(builder.Configuration, builder.Environment);
Directory.CreateDirectory(dataRoot);

var dataProtectionKeysPath = builder.Configuration["DataProtection:KeysPath"];
if (!string.IsNullOrWhiteSpace(dataProtectionKeysPath))
{
    Directory.CreateDirectory(dataProtectionKeysPath);
    builder.Services.AddDataProtection()
        .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeysPath));
}
else if (builder.Environment.IsDevelopment())
{
    var keyDirectory = Path.Combine(dataRoot, "keys");
    Directory.CreateDirectory(keyDirectory);
    builder.Services.AddDataProtection()
        .PersistKeysToFileSystem(new DirectoryInfo(keyDirectory));
}
else
{
    builder.Services.AddOptions<KeyManagementOptions>()
        .Configure<IConfiguration, IWebHostEnvironment, ILoggerFactory>((options, configuration, environment, logger) =>
        {
            var directory = Directory.CreateDirectory(Path.Combine(DataRoot(configuration, environment), "keys"));
            options.XmlRepository = new FileSystemXmlRepository(directory, logger);
        });
}

var databaseConnection = builder.Configuration.GetConnectionString("Default")
    ?? "Data Source=scalable.db";

if (!databaseConnection.StartsWith("Host=", StringComparison.OrdinalIgnoreCase) &&
    !databaseConnection.StartsWith("postgres", StringComparison.OrdinalIgnoreCase))
{
    var databasePath = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(databaseConnection).DataSource;
    if (databasePath != ":memory:")
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(databasePath))!);
}

builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (databaseConnection.StartsWith("Host=", StringComparison.OrdinalIgnoreCase) ||
        databaseConnection.StartsWith("postgres", StringComparison.OrdinalIgnoreCase))
    {
        options.UseNpgsql(databaseConnection);
    }
    else
    {
        options.UseSqlite(databaseConnection);
    }
});

builder.Services
    .AddIdentityCore<AppUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Password.RequiredLength = 8;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders();
builder.Services.AddSingleton<IAccountEmailSender, LoggingAccountEmailSender>();

builder.Services
    .AddAuthentication(IdentityConstants.ApplicationScheme)
    .AddIdentityCookies();
builder.Services.Configure<CookieAuthenticationOptions>(IdentityConstants.ApplicationScheme, options =>
{
    options.Events.OnRedirectToLogin = context =>
    {
        if (context.Request.Path.StartsWithSegments("/api"))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        }

        context.Response.Redirect(context.RedirectUri);
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        if (context.Request.Path.StartsWithSegments("/api"))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        }

        context.Response.Redirect(context.RedirectUri);
        return Task.CompletedTask;
    };
});

builder.Services.AddSingleton(new ProviderRequestBudget(
    builder.Configuration["Wikimedia:BudgetPath"] ?? Path.Combine(dataRoot, "wikimedia-budget.json"),
    TimeProvider.System));
builder.Services.AddSingleton<WikimediaSource>(services => new WikimediaSource(
    new HttpClient(new SocketsHttpHandler
    {
        AllowAutoRedirect = false,
        AutomaticDecompression = System.Net.DecompressionMethods.GZip | System.Net.DecompressionMethods.Deflate,
    }) { Timeout = TimeSpan.FromSeconds(5) },
    services.GetRequiredService<ProviderRequestBudget>(),
    builder.Configuration["Wikimedia:UserAgent"] ?? "Scalable/1.0 (https://github.com/Scalable123/Scalable)"));

if (builder.Configuration.GetValue<bool>("App:CrossSiteCookies"))
{
    builder.Services.Configure<CookieAuthenticationOptions>(
        IdentityConstants.ApplicationScheme,
        options =>
        {
            options.Cookie.SameSite = SameSiteMode.None;
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        });
}

builder.Services.AddAuthorization();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.SetIsOriginAllowed(origin => IsAllowedOrigin(origin, builder.Configuration, builder.Environment.IsDevelopment()))
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "60";
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            error = "rate_limited",
            message = "Scalable's image-source request limit was reached. Wait a minute before retrying."
        }, cancellationToken);
    };
    options.AddPolicy("provider", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 60,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
});
builder.Services
    .AddGraphQLServer()
    .AddAuthorization()
    .AddQueryType<Query>()
    .AddTypeExtension<AccountQueries>()
    .AddMutationType<AccountMutations>();

var app = builder.Build();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";

        if (HttpMethods.IsPost(context.Request.Method) || HttpMethods.IsPut(context.Request.Method) ||
            HttpMethods.IsPatch(context.Request.Method) || HttpMethods.IsDelete(context.Request.Method))
        {
            var origin = context.Request.Headers.Origin.ToString();
            if (origin.Length > 0 && !IsAllowedOrigin(
                origin,
                context.RequestServices.GetRequiredService<IConfiguration>(),
                context.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment()))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new
                {
                    error = "invalid_origin",
                    message = "This request origin is not allowed."
                });
                return;
            }
        }
    }

    try
    {
        await next(context);
    }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
    {
    }
    catch (Exception error) when (error is HttpRequestException or System.Text.Json.JsonException or TaskCanceledException)
    {
        context.Response.StatusCode = StatusCodes.Status502BadGateway;
        await context.Response.WriteAsJsonAsync(new
        {
            error = "provider_unavailable",
            message = "The connection service is unavailable. Please retry."
        });
    }
});

using (var scope = app.Services.CreateScope())
{
    var database = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    database.Database.Migrate();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapPost("/api/image-sources/wikimedia", async (WikimediaInput input, WikimediaSource source, CancellationToken token) =>
{
    var prompt = input.Prompt?.Trim();
    if (string.IsNullOrWhiteSpace(prompt) || prompt.Length > 2000)
        return Results.BadRequest(new { error = "A prompt of 1–2000 characters is required." });
    return Results.Ok(await source.Search(prompt, token));
}).RequireRateLimiting("provider");
app.MapGraphQL("/graphql");

app.Run();

static string DataRoot(IConfiguration configuration, IWebHostEnvironment environment) {
    var path = configuration["DataPath"] ?? "data";
    return Path.GetFullPath(Path.IsPathRooted(path) ? path : Path.Combine(environment.ContentRootPath, path));
}

static bool IsAllowedOrigin(string origin, IConfiguration configuration, bool isDevelopment)
{
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
        !string.IsNullOrEmpty(uri.UserInfo) || uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.Query) ||
        !string.IsNullOrEmpty(uri.Fragment))
        return false;

    var configuredOrigins = configuration
        .GetSection("Cors:AllowedOrigins")
        .Get<string[]>() ?? [];
    if (configuredOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
        return true;

    var configured = configuration["App:FrontendOrigin"];
    if (!string.IsNullOrWhiteSpace(configured) &&
        Uri.TryCreate(configured, UriKind.Absolute, out var allowed) &&
        (isDevelopment || allowed.Scheme == Uri.UriSchemeHttps) &&
        string.Equals(uri.GetLeftPart(UriPartial.Authority), allowed.GetLeftPart(UriPartial.Authority),
            StringComparison.OrdinalIgnoreCase))
        return true;

    return isDevelopment && uri.Scheme == Uri.UriSchemeHttp &&
        (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
         uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
         uri.Host.Equals("::1", StringComparison.OrdinalIgnoreCase));
}

public partial class Program { }

public sealed record WikimediaInput(string? Prompt);
