from fastapi import APIRouter, HTTPException

from app.auth.users import current_active_user
from app.models.user import User
from app.schemas.form import ParsedForm
from app.services.form_parser.parser import parse_form
from fastapi import Depends

router = APIRouter(prefix="/forms", tags=["forms"])


@router.post("/parse", response_model=ParsedForm)
async def parse_form_url(
    body: dict,
    user: User = Depends(current_active_user),
) -> ParsedForm:
    """
    Fetch a Google Form by URL and return its parsed questions.
    Requires authentication.
    """
    url = body.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=422, detail="url is required")

    try:
        return await parse_form(url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch form: {e}")
