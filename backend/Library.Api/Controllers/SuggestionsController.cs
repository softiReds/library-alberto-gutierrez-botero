using Library.Api.Common;
using Library.Api.Data;
using Library.Api.Domain.Entities;
using Library.Api.Email;
using Library.Api.Suggestions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Library.Api.Controllers;

[ApiController]
[Route("api/v1/suggestions")]
public class SuggestionsController(LibraryDbContext db, IEmailService emailService) : ControllerBase
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

        // IEmailService.SendAsync never throws (it logs and swallows failures internally),
        // so a broken/unconfigured SMTP setup can never fail this request — the suggestion
        // is already committed to the database by this point, which is the whole point of
        // the dual save-then-notify flow.
        await emailService.SendAsync(
            "Nueva sugerencia recibida",
            $"""
             Se recibió una nueva sugerencia en la Biblioteca Alberto Gutiérrez Botero.

             Mensaje: {suggestion.Message}
             Nombre: {suggestion.VisitorName ?? "(anónimo)"}
             Correo: {suggestion.VisitorEmail ?? "(no proporcionado)"}
             Fecha: {suggestion.SubmittedAt:yyyy-MM-dd HH:mm} UTC
             """);

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
