"""Passwords, JWTs, and the Ed25519 signature scheme used between peers."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.exceptions import InvalidSignature
from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings
from .errors import unauthorized

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto",
                           bcrypt__rounds=settings.bcrypt_rounds)


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------
def hash_password(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_password(raw: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return pwd_context.verify(raw, hashed)
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------
def create_access_token(subject: str, claims: dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
        "typ": "access",
        **(claims or {}),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token() -> tuple[str, str, datetime]:
    """Returns (token, sha256 hash to store, expiry)."""
    token = secrets.token_urlsafe(48)
    digest = hashlib.sha256(token.encode()).hexdigest()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days)
    return token, digest, expires


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise unauthorized("Token is invalid or expired") from exc


# ---------------------------------------------------------------------------
# Instance keys and peer signatures
# ---------------------------------------------------------------------------
def generate_instance_key() -> str:
    """64 hex characters, the same shape the installer mints."""
    return secrets.token_bytes(32).hex()


def generate_keypair() -> tuple[str, str]:
    private = Ed25519PrivateKey.generate()
    private_pem = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


def signing_payload(method: str, path: str, instance_key: str,
                    timestamp: str, nonce: str, body_hash: str = "") -> bytes:
    """The exact bytes both sides sign. Order is part of the contract."""
    return "\n".join([method.upper(), path, instance_key, timestamp, nonce,
                      body_hash]).encode()


def sign_request(private_pem: str, payload: bytes) -> str:
    key = serialization.load_pem_private_key(private_pem.encode(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("Instance private key is not an Ed25519 key")
    return base64.b64encode(key.sign(payload)).decode()


def verify_signature(public_pem: str, payload: bytes, signature_b64: str) -> bool:
    try:
        key = serialization.load_pem_public_key(public_pem.encode())
        if not isinstance(key, Ed25519PublicKey):
            return False
        key.verify(base64.b64decode(signature_b64), payload)
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


def body_digest(body: bytes) -> str:
    return hashlib.sha256(body or b"").hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
