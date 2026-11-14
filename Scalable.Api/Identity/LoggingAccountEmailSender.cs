using Microsoft.Extensions.Logging;

namespace Scalable.Api.Identity;

public sealed class LoggingAccountEmailSender(ILogger<LoggingAccountEmailSender> logger)
    : IAccountEmailSender
{
    public Task SendPasswordResetAsync(
        AppUser user,
        string resetUrl,
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation(
            "Password reset link generated for {Email}: {ResetUrl}",
            user.Email,
            resetUrl);
        return Task.CompletedTask;
    }
}
