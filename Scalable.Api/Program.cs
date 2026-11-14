using Scalable.Api.GraphQL;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Scalable.Api.Data;
using Scalable.Api.Identity;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

var dataProtectionKeysPath = builder.Configuration["DataProtection:KeysPath"];
if (!string.IsNullOrWhiteSpace(dataProtectionKeysPath))
{
    Directory.CreateDirectory(dataProtectionKeysPath);
    builder.Services.AddDataProtection()
        .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeysPath));
}
else if (builder.Environment.IsDevelopment())
{
    var keyDirectory = System.IO.Path.Combine(builder.Environment.ContentRootPath, ".keys");
    Directory.CreateDirectory(keyDirectory);
    builder.Services.AddDataProtection()
        .PersistKeysToFileSystem(new DirectoryInfo(keyDirectory));
}

var databaseConnection = builder.Configuration.GetConnectionString("Default")
    ?? "Data Source=scalable.db";

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

var configuredCorsOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddAuthorization();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.SetIsOriginAllowed(origin =>
        configuredCorsOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase) ||
        (Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
         uri.Scheme == Uri.UriSchemeHttp &&
         (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
          uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
          uri.Host.Equals("::1", StringComparison.OrdinalIgnoreCase))))
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));
builder.Services
    .AddGraphQLServer()
    .AddAuthorization()
    .AddQueryType<Query>()
    .AddTypeExtension<AccountQueries>()
    .AddMutationType<AccountMutations>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var database = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    database.Database.EnsureCreated();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapGraphQL("/graphql");

app.Run();
