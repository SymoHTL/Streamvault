using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;

namespace StreamVault.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public abstract class BaseController : ControllerBase
{
    protected Guid GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return claim != null ? Guid.Parse(claim) : throw new UnauthorizedAccessException();
    }

    protected Guid GetProfileId()
    {
        var claim = User.FindFirst("ProfileId")?.Value;
        return claim != null ? Guid.Parse(claim) : throw new UnauthorizedAccessException("No profile selected");
    }

    protected Guid? TryGetProfileId()
    {
        var claim = User.FindFirst("ProfileId")?.Value;
        return claim != null && Guid.TryParse(claim, out var id) ? id : null;
    }

    protected string GetUserRole()
    {
        return User.FindFirst(ClaimTypes.Role)?.Value ?? "User";
    }
}
