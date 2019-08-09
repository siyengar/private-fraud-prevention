import functools
from typing import Any
import hashlib

from Crypto.PublicKey import RSA

KEY_SIZE = 2048


def new_rsa_key():
    return RSA.generate(KEY_SIZE)


@functools.lru_cache(maxsize=2048)
def get_rsa_key(
        cache_key: Any,
) -> Any:
    rsa_key = new_rsa_key()
    return rsa_key


def get_public_key(
        cache_key: Any
) -> Any:
    rsa_key = get_rsa_key(cache_key)
    return rsa_key.publickey().exportKey()


def import_public_key(
        public_key: bytes
) -> Any:
    return RSA.importKey(public_key)


# TODO: implement Full domain hash, for now hash
# should be fine as it breaks the malleability
def hash_message(message: bytes,  output_len: Any) -> bytes:
    hash_alg = hashlib.sha256() 
    hash_alg.update(message)
    return hash_alg.digest()


def sign_message(
        rsa_key: Any,
        message: bytes,
) -> bytes:
    sig = rsa_key.sign(message, b'')[0].to_bytes(256, 'big')
    return sig


def validate_signature(
        public_key: Any,
        message: bytes,
        sig: bytes,
) -> bool:
    if type(public_key) == bytes:
        public_key = RSA.importKey(public_key)
    valid = public_key.verify(message, (int.from_bytes(sig, 'big'), None))
    return valid


def blind_message(
        public_key: Any,
        message: bytes,
        blinding_factor: bytes,
) -> bytes:
    if type(public_key) == bytes:
        public_key = RSA.importKey(public_key)
    return public_key.blind(message, blinding_factor)


def unblind_message(
        public_key: Any,
        blinded_message: bytes,
        blinding_factor: bytes,
) -> bytes:
    if type(public_key) == bytes:
        public_key = RSA.importKey(public_key)
    return public_key.unblind(blinded_message, blinding_factor)
