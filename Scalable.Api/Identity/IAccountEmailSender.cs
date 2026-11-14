namespace Scalable.Api.Identity;

public interface IAccountEmailSender
{
    Task SendPasswordResetAsync(AppUser user, string resetUrl, CancellationToken cancellationToken = default);
}
