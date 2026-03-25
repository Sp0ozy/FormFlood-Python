import logging

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def _build_form_data(payload: dict) -> list[tuple[str, str]]:
    """
    Convert a payload dict to a list of (key, value) tuples for httpx.
    Checkboxes (list values) are expanded into multiple tuples with the same key.

    payload example:
    {"entry.123": "Option A", "entry.456": ["Choice 1", "Choice 2"]}

    result:
    [("entry.123", "Option A"), ("entry.456", "Choice 1"), ("entry.456", "Choice 2")]
    """
    data: list[tuple[str, str]] = []
    for key, value in payload.items():
        if isinstance(value, list):
            for item in value:
                data.append((key, str(item)))
        else:
            data.append((key, str(value)))
    return data


async def submit_form(form_id: str, payload: dict) -> tuple[bool, str | None]:
    """
    POST one set of responses to a Google Form.
    Returns (success: bool, error_message: str | None).
    """
    url = f"https://docs.google.com/forms/d/e/{form_id}/formResponse"
    form_data = _build_form_data(payload)

    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = await client.post(
                url,
                data=form_data,
                headers={
                    "User-Agent": USER_AGENT,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=15.0,
            )
        if response.status_code in (200, 302):
            return True, None
        return False, f"HTTP {response.status_code}"
    except httpx.TimeoutException:
        return False, "Request timed out"
    except httpx.RequestError as e:
        return False, str(e)
