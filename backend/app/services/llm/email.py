"""Email draft generation."""
import logging

from app.core.errors import ExternalServiceError
from app.services.llm.prompts import INJECTION_DEFENSE_INSTRUCTION
from app.services.llm.validation import (
    check_injection_patterns,
    validate_input_length,
    parse_json_response,
    wrap_user_content,
)
from app.services.llm.schema_builder import build_messages

logger = logging.getLogger(__name__)


async def generate_email_draft(
    client,
    model: str,
    context: str,
    recipient: str,
    purpose: str,
) -> dict:
    """Generate a polished email draft based on context."""
    check_injection_patterns(context, source="email_context")
    context = validate_input_length(context, "email_context")

    system_content = "\n\n".join([
        INJECTION_DEFENSE_INSTRUCTION,
        "Generate a professional email draft based on voice memo context.",
    ])

    user_content = (
        wrap_user_content(context)
        + f"\n\nRecipient: {recipient}\nPurpose: {purpose}\n\n"
        + "Return ONLY valid JSON:\n"
        + "{\n"
        + '  "subject": "Email subject line",\n'
        + '  "body": "Full email body with proper greeting and signature placeholder"\n'
        + "}"
    )

    try:
        response = client.chat.completions.create(
            model=model,
            max_tokens=1000,
            response_format={"type": "json_object"},
            messages=build_messages(system_content, user_content),
        )
    except Exception as e:
        raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

    data = parse_json_response(response.choices[0].message.content)
    if data is None:
        return {
            "subject": f"Re: {purpose}",
            "body": f"[Draft generation failed]\n\nContext: {context[:200]}...",
        }
    return data
