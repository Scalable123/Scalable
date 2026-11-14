using Microsoft.AspNetCore.Identity;

namespace Scalable.Api.Identity;

public sealed class AppUser : IdentityUser
{
    public string DisplayName { get; set; } = "";
}
