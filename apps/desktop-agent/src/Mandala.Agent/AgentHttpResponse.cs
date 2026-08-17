using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;

namespace Mandala.Agent;

internal static class AgentHttpResponse
{
    public static async Task EnsureSuccessAsync(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var message = await response.Content.ReadAsStringAsync();
        throw new HttpRequestException(string.IsNullOrWhiteSpace(message)
            ? "Mandala could not complete the request."
            : message);
    }

    public static async Task<T> ReadRequiredJsonAsync<T>(
        HttpResponseMessage response,
        JsonSerializerOptions options)
    {
        await EnsureSuccessAsync(response);

        var payload = await response.Content.ReadFromJsonAsync<T>(options);
        if (payload is null)
        {
            throw new HttpRequestException("Mandala returned an empty response.");
        }

        return payload;
    }
}
