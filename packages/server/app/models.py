from pydantic import BaseModel


class QueryRequest(BaseModel):
    sql: str


class QueryResponse(BaseModel):
    data: list[dict]
    format: str
    rowCount: int


class ErrorResponse(BaseModel):
    error: str
    code: str
    details: dict | None = None
