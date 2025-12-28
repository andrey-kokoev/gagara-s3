from fastapi import Header

from app import config


class AuthError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def verify_token(authorization: str | None = Header(default=None)) -> str:
    if not config.SERVICE_TOKEN:
        raise AuthError(500, "Server misconfigured")

    if not authorization:
        raise AuthError(401, "Unauthorized")

    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0] != "Bearer":
        raise AuthError(401, "Unauthorized")

    token = parts[1]
    if token != config.SERVICE_TOKEN:
        raise AuthError(401, "Unauthorized")

    return token
