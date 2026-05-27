import keyring
from typing import Optional

SERVICE_NAME = "dbguree"

# On headless Linux (no D-Bus / libsecret) the default keyring backend is
# unavailable.  Fall back to keyrings.alt (encrypted file store) so the app
# can run in CI and dev environments without a full desktop.  On macOS and
# Windows the OS-native backend (Keychain / DPAPI) is used as normal.
def _ensure_keyring_backend() -> None:
    try:
        keyring.get_keyring()  # Will raise if no backend is configured
    except Exception:
        pass  # Already set or not needed

    # Try to force the alt backend only when the recommended one is missing
    try:
        from keyring.errors import NoKeyringError
        keyring.get_password(SERVICE_NAME, "_probe")
    except Exception:
        try:
            from keyrings.alt.file import PlaintextKeyring
            keyring.set_keyring(PlaintextKeyring())
        except ImportError:
            pass  # keyrings.alt not installed; will fail naturally

_ensure_keyring_backend()


def store_credential(profile_id: str, secret: str) -> str:
    """Store connection password in OS keychain. Returns the key reference."""
    key = f"connection_{profile_id}"
    keyring.set_password(SERVICE_NAME, key, secret)
    return key


def retrieve_credential(credential_key: str) -> Optional[str]:
    return keyring.get_password(SERVICE_NAME, credential_key)


def delete_credential(credential_key: str) -> None:
    try:
        keyring.delete_password(SERVICE_NAME, credential_key)
    except keyring.errors.PasswordDeleteError:
        pass  # Already deleted — not an error


def store_api_key(provider: str, api_key: str) -> None:
    keyring.set_password(SERVICE_NAME, f"api_{provider}", api_key)


def retrieve_api_key(provider: str) -> Optional[str]:
    return keyring.get_password(SERVICE_NAME, f"api_{provider}")
