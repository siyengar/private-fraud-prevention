import unittest
from Crypto.Random import (
    get_random_bytes
)
from crypto.crypto import (
    new_rsa_key,
    get_rsa_key,
    get_public_key,
    sign_message,
    validate_signature,
    blind_message,
    unblind_message,
)


class BaseCryptoTest(unittest.TestCase):
    def setUp(self):
        self.domain = 'test-site.com'
        self.click_data_src = 'foobarbaz'
        self.cache_key = (self.domain, self.click_data_src)
        self.message = get_random_bytes(16)  # 'foobarbaz'.encode('utf8')
        self.blinding_factor = get_random_bytes(8)

    def test_get_rsa_key_cache(self):
        key1 = get_rsa_key(self.cache_key)
        key2 = get_rsa_key(self.cache_key)
        self.assertEqual(key1, key2)

    def test_new_rsa_key_distinct(self):
        key1 = new_rsa_key()
        key2 = new_rsa_key()
        self.assertNotEqual(key1, key2)

    def test_get_public_key_cache(self):
        pub_key1 = get_public_key(self.cache_key)
        pub_key2 = get_public_key(self.cache_key)
        self.assertEqual(pub_key1, pub_key2)

    def test_sign_message(self):
        rsa_key = get_rsa_key(self.cache_key)
        sig = sign_message(rsa_key, self.message)
        public_key = get_public_key(self.cache_key)
        valid = validate_signature(public_key, self.message, sig)
        self.assertTrue(valid)

    def test_sign_blind_message(self):
        public_key = get_public_key(self.cache_key)
        blinded_message = blind_message(
            public_key,
            self.message,
            self.blinding_factor
        )

        rsa_key = get_rsa_key(self.cache_key)
        blinded_sig = sign_message(rsa_key, blinded_message)
        unblinded_sig = unblind_message(
            public_key,
            blinded_sig,
            self.blinding_factor
        )
        valid = validate_signature(public_key, self.message, unblinded_sig)
        self.assertTrue(valid)
