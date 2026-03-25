from pydantic import BaseModel


class ParsedOption(BaseModel):
    label: str


class ParsedQuestion(BaseModel):
    entry_id: str
    title: str
    question_type: str
    options: list[ParsedOption]


class ParsedForm(BaseModel):
    form_id: str
    title: str
    questions: list[ParsedQuestion]
