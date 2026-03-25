import json
import logging
import re

import httpx

from app.schemas.form import ParsedForm, ParsedOption, ParsedQuestion

logger = logging.getLogger(__name__)

QUESTION_TYPE_MAP = {
    2: "multiple_choice",
    3: "dropdown",
    4: "checkbox",
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def _extract_form_id(url: str) -> str:
    """Extract the form ID from a Google Forms URL."""
    match = re.search(r"/forms/d/e/([^/]+)/", url)
    if not match:
        match = re.search(r"/forms/d/([^/]+)/", url)
    if not match:
        raise ValueError(f"Could not extract form ID from URL: {url}")
    return match.group(1)


def _parse_raw_data(data: list) -> tuple[str, list[ParsedQuestion]]:
    """Parse FB_PUBLIC_LOAD_DATA_ structure into title and questions."""
    try:
        title = data[1][8][0] if data[1][8] else "Untitled Form"
    except (IndexError, TypeError):
        title = "Untitled Form"

    raw_questions = data[1][1]
    questions: list[ParsedQuestion] = []

    for q in raw_questions:
        try:
            entry_id = str(q[4][0][0])
            question_title = q[1]
            type_int = q[3]
            question_type = QUESTION_TYPE_MAP.get(type_int)

            if question_type is None:
                logger.debug("Skipping unsupported question type %d: %s", type_int, question_title)
                continue

            raw_options = q[4][0][1] if q[4][0][1] else []
            options = [ParsedOption(label=opt[0]) for opt in raw_options if opt and opt[0]]

            questions.append(ParsedQuestion(
                entry_id=entry_id,
                title=question_title,
                question_type=question_type,
                options=options,
            ))
        except (IndexError, TypeError, KeyError) as e:
            logger.warning("Failed to parse question: %s", e)
            continue

    return title, questions


async def parse_form(url: str) -> ParsedForm:
    """Fetch and parse a Google Form by URL."""
    async with httpx.AsyncClient(follow_redirects=True) as client:
        response = await client.get(url, headers={"User-Agent": USER_AGENT})
        response.raise_for_status()

    html = response.text

    match = re.search(r"FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.+?\]);\s*</script>", html, re.DOTALL)
    if not match:
        raise ValueError("Could not find FB_PUBLIC_LOAD_DATA_ in form HTML. The URL may not be a valid Google Form.")

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse form data JSON: {e}") from e

    form_id = _extract_form_id(url)
    title, questions = _parse_raw_data(data)

    if not questions:
        raise ValueError("No supported questions found in this form (only multiple choice, dropdown, and checkbox are supported).")

    return ParsedForm(form_id=form_id, title=title, questions=questions)
