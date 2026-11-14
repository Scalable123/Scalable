using System.Security.Claims;
using HotChocolate.Authorization;
using HotChocolate;
using HotChocolate.Types;
using Microsoft.AspNetCore.Identity;
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

        var result = await users.CreateAsync(user, input.Password);
        if (!result.Succeeded)
            return AuthPayload.Failure("The account could not be created.");

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

public sealed record AuthPayload(bool Succeeded, string Message, UserSummary? User)
{
    public static AuthPayload Success(UserSummary user) => new(true, "", user);
    public static AuthPayload Failure(string message) => new(false, message, null);
}

public sealed record UserSummary(string Id, string Username, string Email, string DisplayName)
{
    public static UserSummary From(AppUser user) => new(
        user.Id,
        user.UserName ?? "",
        user.Email ?? "",
        user.DisplayName);
}
