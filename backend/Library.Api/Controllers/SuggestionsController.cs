using Library.Api.Common;
using Library.Api.Data;
using Library.Api.Domain.Entities;
using Library.Api.Suggestions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Controllers;

[ApiController]
[Route("api/v1/suggestions")]
public class SuggestionsController(LibraryDbContext db) : ControllerBase
{
    [HttpPost]
    [AllowAnonymous]
    public async Task<ActionResult<SuggestionDto>> CreateSuggestion(CreateSuggestionRequest request)
    {
        var suggestion = new Suggestion
        {
            Message = request.Message,
            VisitorName = request.VisitorName,
            VisitorEmail = request.VisitorEmail
        };

        db.Suggestions.Add(suggestion);
        await db.SaveChangesAsync();

        return Created(
            $"/api/v1/suggestions/{suggestion.Id}",
            SuggestionDto.FromEntity(suggestion));
    }

    [HttpGet]
    [Authorize]
    public async Task<ActionResult<PagedResult<SuggestionDto>>> GetSuggestions(
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery(Name = "page_size")] int pageSize = 20)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        var query = db.Suggestions.AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(s => s.Status == status);
        }

        var total = await query.CountAsync();

        var suggestions = await query
            .OrderByDescending(s => s.SubmittedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new PagedResult<SuggestionDto>
        {
            Data = suggestions.Select(SuggestionDto.FromEntity).ToList(),
            Page = page,
            PageSize = pageSize,
            Total = total
        });
    }

    [HttpPatch("{id:guid}/mark-read")]
    [Authorize]
    public async Task<ActionResult<SuggestionDto>> MarkRead(Guid id)
    {
        var suggestion = await db.Suggestions.FirstOrDefaultAsync(s => s.Id == id);
        if (suggestion is null)
        {
            return NotFound(ErrorResponse.Create("not_found", "La sugerencia solicitada no existe."));
        }

        suggestion.Status = "leída";
        await db.SaveChangesAsync();

        return Ok(SuggestionDto.FromEntity(suggestion));
    }
}
