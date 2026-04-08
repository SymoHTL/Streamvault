using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace StreamVault.Api.Hubs;

[Authorize]
public class NotificationHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier;
        if (!string.IsNullOrEmpty(userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user-{userId}");
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.UserIdentifier;
        if (!string.IsNullOrEmpty(userId))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user-{userId}");
        }
        await base.OnDisconnectedAsync(exception);
    }
}

public static class NotificationHubExtensions
{
    public static Task SendScanProgress(this IHubContext<NotificationHub> hub, Guid libraryId, int progress, string message)
        => hub.Clients.All.SendAsync("ScanProgress", new { libraryId, progress, message });

    public static Task SendTranscodeProgress(this IHubContext<NotificationHub> hub, string sessionId, double progress)
        => hub.Clients.All.SendAsync("TranscodeProgress", new { sessionId, progress });

    public static Task SendLibraryUpdated(this IHubContext<NotificationHub> hub, Guid libraryId)
        => hub.Clients.All.SendAsync("LibraryUpdated", new { libraryId });
}
