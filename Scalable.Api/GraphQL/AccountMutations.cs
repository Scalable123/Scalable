using System.Security.Claims;
using System.ComponentModel.DataAnnotations;
using HotChocolate.Authorization;
using HotChocolate;
using HotChocolate.Types;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Scalable.Api.Identity;

namespace Scalable.Api.GraphQL;

public sealed class AccountMutations
{
    public async Task<AuthPayload> Register(
        RegisterInput input,
        [Service] UserManager<AppUser> users,
        [Service] SignInManager<AppUser> signIn)
    {
        if (string.IsNullOrWhiteSpace(input.Username) || input.Username.Length is < 3 or > 32)
            return AuthPayload.Failure("Choose a username between 3 and 32 characters.");

        if (string.IsNullOrWhiteSpace(input.DisplayName) || input.DisplayName.Length > 80)
            return AuthPayload.Failure("Choose a display name of 80 characters or fewer.");

        if (!new EmailAddressAttribute().IsValid(input.Email.Trim()))
            return AuthPayload.Failure("Enter a valid email address.");

        if (input.Password.Length < 8)
            return AuthPayload.Failure("Choose a password with at least 8 characters.");

        var normalizedUsername = input.Username.Trim();
        var normalizedEmail = input.Email.Trim();
        if (await users.FindByNameAsync(normalizedUsername) is not null ||
            await users.FindByEmailAsync(normalizedEmail) is not null)
            return AuthPayload.Failure("That username or email is already in use.");

        var user = new AppUser
        {
            UserName = normalizedUsername,
            Email = normalizedEmail,
            DisplayName = input.DisplayName.Trim(),
        };

        IdentityResult result;
        try
        {
            result = await users.CreateAsync(user, input.Password);
        }
        catch (DbUpdateException)
        {
            return AuthPayload.Failure("That username or email is already in use.");
        }

        if (!result.Succeeded)
        {
            if (result.Errors.Any(error => error.Code == nameof(IdentityErrorDescriber.DuplicateUserName)))
                return AuthPayload.Failure("That username is already in use.");

            if (result.Errors.Any(error => error.Code == nameof(IdentityErrorDescriber.DuplicateEmail)))
                return AuthPayload.Failure("That email is already in use.");

            var passwordRequirements = new List<string>();
            if (result.Errors.Any(error => error.Code == nameof(IdentityErrorDescriber.PasswordRequiresDigit)))
                passwordRequirements.Add("a number");
            if (result.Errors.Any(error => error.Code == nameof(IdentityErrorDescriber.PasswordRequiresLower)))
                passwordRequirements.Add("a lowercase letter");
            if (result.Errors.Any(error => error.Code == nameof(IdentityErrorDescriber.PasswordRequiresUpper)))
                passwordRequirements.Add("an uppercase letter");
            if (result.Errors.Any(error => error.Code == nameof(IdentityErrorDescriber.PasswordRequiresNonAlphanumeric)))
                passwordRequirements.Add("a special character");

            if (passwordRequirements.Count > 0)
                return AuthPayload.Failure(
                    $"Password must include at least 8 characters and {string.Join(", ", passwordRequirements)}.");

            if (result.Errors.Any(error => error.Code == nameof(IdentityErrorDescriber.InvalidUserName)))
                return AuthPayload.Failure("Use only letters, numbers, dots, dashes, or underscores in the username.");

            return AuthPayload.Failure("The account details could not be accepted.");
        }

        await signIn.SignInAsync(user, isPersistent: false);
        return AuthPayload.Success(UserSummary.From(user));
    }

    public async Task<AuthPayload> Login(
        LoginInput input,
        [Service] UserManager<AppUser> users,
        [Service] SignInManager<AppUser> signIn)
    {
        var identifier = input.Identifier.Trim();
        var user = identifier.Contains('@')
            ? await users.FindByEmailAsync(identifier)
            : await users.FindByNameAsync(identifier);

        if (user is null)
            return AuthPayload.Failure("Invalid username/email or password.");

        var result = await signIn.PasswordSignInAsync(
            user,
            input.Password,
            isPersistent: false,
            lockoutOnFailure: true);

        return result.Succeeded
            ? AuthPayload.Success(UserSummary.From(user))
            : AuthPayload.Failure("Invalid username/email or password.");
    }

    public async Task<bool> Logout([Service] SignInManager<AppUser> signIn)
    {
        await signIn.SignOutAsync();
        return true;
    }

    public async Task<PasswordResetPayload> RequestPasswordReset(
        PasswordResetRequestInput input,
        [Service] UserManager<AppUser> users,
        [Service] IAccountEmailSender emailSender,
        [Service] IConfiguration configuration)
    {
        var email = input.Email.Trim();
        var user = await users.FindByEmailAsync(email);
        if (user is not null)
        {
            var token = await users.GeneratePasswordResetTokenAsync(user);
            var baseUrl = configuration["App:PublicBaseUrl"]?.TrimEnd('/')
                ?? "http://localhost:3000/frontend";
            var resetUrl = $"{baseUrl}/update-password.html?email={Uri.EscapeDataString(user.Email ?? email)}&token={Uri.EscapeDataString(token)}";
            await emailSender.SendPasswordResetAsync(user, resetUrl);
        }

        return PasswordResetPayload.Accepted();
    }

    public async Task<PasswordResetPayload> ResetPassword(
        PasswordResetInput input,
        [Service] UserManager<AppUser> users)
    {
        var user = await users.FindByEmailAsync(input.Email.Trim());
        if (user is null || string.IsNullOrWhiteSpace(input.Token))
            return PasswordResetPayload.Failure("The password reset link is invalid or has expired.");

        var result = await users.ResetPasswordAsync(user, input.Token, input.Password);
        return result.Succeeded
            ? PasswordResetPayload.Successful()
            : PasswordResetPayload.Failure("The password reset link is invalid or has expired.");
    }
}

[ExtendObjectType<Query>]
public sealed class AccountQueries
{
    [Authorize]
    public async Task<UserSummary?> Me(
        ClaimsPrincipal principal,
        [Service] UserManager<AppUser> users)
    {
        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = userId is null ? null : await users.FindByIdAsync(userId);
        return user is null ? null : UserSummary.From(user);
    }
}

public sealed record RegisterInput(string Username, string Email, string DisplayName, string Password);

public sealed record LoginInput(string Identifier, string Password);

public sealed record PasswordResetRequestInput(string Email);

public sealed record PasswordResetInput(string Email, string Token, string Password);

public sealed record AuthPayload(bool Succeeded, string Message, UserSummary? User)
{
    public static AuthPayload Success(UserSummary user) => new(true, "", user);
    public static AuthPayload Failure(string message) => new(false, message, null);
}

public sealed record PasswordResetPayload(bool Succeeded, string Message)
{
    public static PasswordResetPayload Accepted() =>
        new(true, "If an account exists for that email, password reset instructions are on the way.");

    public static PasswordResetPayload Successful() =>
        new(true, "Password updated. You can now sign in.");

    public static PasswordResetPayload Failure(string message) => new(false, message);
}

public sealed record UserSummary(string Id, string Username, string Email, string DisplayName)
{
    public static UserSummary From(AppUser user) => new(
        user.Id,
        user.UserName ?? "",
        user.Email ?? "",
        user.DisplayName);
}
