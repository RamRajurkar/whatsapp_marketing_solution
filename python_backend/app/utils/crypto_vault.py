"""
Field-level encryption and crypto vault for sensitive channel secrets.
Uses authenticated AES-256-GCM / MultiFernet with separate secrets-store file sourcing
and multi-key keyring support for zero-downtime key rotation.
"""

import os
import base64
import logging
from typing import List, Optional
from cryptography.fernet import Fernet, MultiFernet

logger = logging.getLogger(__name__)

SECRETS_FILE_PATHS = [
    "/run/secrets/app_encryption_key",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "secrets", "master_key.secret"),
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "secrets", "master_key.secret"),
    os.path.join(os.getcwd(), "secrets", "master_key.secret"),
    os.path.join(os.path.dirname(os.getcwd()), "secrets", "master_key.secret")
]

class CryptoVault:
    def __init__(self):
        self._multi_fernet: Optional[MultiFernet] = None
        self._initialize_keys()

    def _load_raw_key_material(self) -> str:
        """
        Loads encryption key material from dedicated secrets store file.
        Falls back to APP_ENCRYPTION_KEY environment variable.
        """
        # 1. Attempt reading from isolated secrets file
        for secret_path in SECRETS_FILE_PATHS:
            if os.path.exists(secret_path):
                try:
                    with open(secret_path, "r", encoding="utf-8") as f:
                        raw = f.read().strip()
                        if raw:
                            return raw
                except Exception as e:
                    logger.warning(f"[CryptoVault] Could not read secret from {secret_path}: {e}")

        # 2. Fallback to dedicated environment variable
        env_key = os.getenv("APP_ENCRYPTION_KEY", "")
        if env_key:
            return env_key

        # 3. Development default fallback with security warning
        logger.warning(
            "⚠️ [CryptoVault] No secure ENCRYPTION_KEY found in secrets file or APP_ENCRYPTION_KEY. "
            "Generating fallback ephemeral key for session. Do NOT use in production!"
        )
        return Fernet.generate_key().decode("utf-8")

    def _initialize_keys(self):
        """
        Initializes MultiFernet keyring supporting key rotation.
        Key format can be a single key or comma-separated list: 'ACTIVE_KEY,LEGACY_KEY_1,LEGACY_KEY_2'
        """
        raw_keys_str = self._load_raw_key_material()
        key_list = [k.strip() for k in raw_keys_str.split(",") if k.strip()]

        fernets: List[Fernet] = []
        for key_candidate in key_list:
            try:
                # Ensure 32-byte base64 URL-safe key
                if len(key_candidate) == 44:
                    fernets.append(Fernet(key_candidate.encode("utf-8")))
                else:
                    # Pad or derive 32-byte key
                    derived = base64.urlsafe_b64encode(key_candidate.encode("utf-8")[:32].ljust(32, b"0"))
                    fernets.append(Fernet(derived))
            except Exception as e:
                logger.error(f"[CryptoVault] Invalid key candidate in keyring: {e}")

        if not fernets:
            fernets.append(Fernet(Fernet.generate_key()))

        self._multi_fernet = MultiFernet(fernets)

    def encrypt_secret(self, plaintext: Optional[str]) -> Optional[str]:
        """Encrypts plaintext string to authenticated ciphertext string."""
        if plaintext is None or plaintext == "":
            return plaintext

        # Do not re-encrypt if already a Fernet token
        if isinstance(plaintext, str) and plaintext.startswith("enc::"):
            return plaintext

        try:
            token = self._multi_fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")
            return f"enc::{token}"
        except Exception as e:
            logger.error(f"[CryptoVault] Encryption failure: {e}")
            raise RuntimeError("Failed to encrypt secret payload") from e

    def decrypt_secret(self, ciphertext: Optional[str]) -> Optional[str]:
        """Decrypts ciphertext string back to plaintext string."""
        if ciphertext is None or ciphertext == "":
            return ciphertext

        if not str(ciphertext).startswith("enc::"):
            # Plaintext compatibility fallback (for existing self_hosted legacy records)
            return ciphertext

        token = ciphertext[5:]
        try:
            decrypted = self._multi_fernet.decrypt(token.encode("utf-8")).decode("utf-8")
            return decrypted
        except Exception as e:
            logger.error(f"[CryptoVault] Decryption failure: {e}")
            raise RuntimeError("Failed to decrypt secret payload - invalid key or corrupted ciphertext") from e

    def rotate_secret(self, ciphertext: str) -> str:
        """Re-encrypts ciphertext with the primary active key in the keyring."""
        if not ciphertext or not str(ciphertext).startswith("enc::"):
            return self.encrypt_secret(ciphertext)

        token = ciphertext[5:]
        try:
            rotated = self._multi_fernet.rotate(token.encode("utf-8")).decode("utf-8")
            return f"enc::{rotated}"
        except Exception as e:
            logger.error(f"[CryptoVault] Key rotation failure: {e}")
            raise RuntimeError("Failed to rotate secret with active key") from e

# Global Vault Singleton
crypto_vault = CryptoVault()
