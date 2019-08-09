import unittest
from binascii import unhexlify, hexlify
import uuid

from app import (
    app,
    get_public_key,
    build_new_csrf_token,
)
from crypto.crypto import (
    validate_signature,
    blind_message,
    hash_message,
)


class IntegrationFlaskTest(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        self.destination_domain = 'destination-domain.com'
        self.click_data_src = str(uuid.uuid4())
        self.report_data_dest = str(uuid.uuid4())

    def test_public_key(self):
        public_key = self.app.get(
            f'/source-domain.com/.well-known/public-key/'
            f'{self.destination_domain}/{self.click_data_src}'
        ).data

        expected_public_key = get_public_key(
            ('source-domain.com', self.destination_domain, self.click_data_src)
        )
        self.assertEqual(unhexlify(public_key), expected_public_key)

        duplicate_public_key = self.app.get(
            f'/source-domain.com/.well-known/public-key/'
            f'{self.destination_domain}/{self.click_data_src}'
        ).data
        self.assertEqual(public_key, duplicate_public_key)

    def test_random_bytes(self):
        result = self.app.get('blinding-service.com/.well-known/random-bytes/16')
        random_data = unhexlify(result.data)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(random_data), 16)

    def test_click_bind(self):
        # click data
        nonce = self.app.get('blinding-service.com/.well-known/random-bytes/16').data
        click_blinding_factor = self.app.get(
            'blinding-service.com/.well-known/random-bytes/16'
        ).data

        csrf_token = build_new_csrf_token()

        # blind nonce for source-domain.com
        source_domain_public_key_response = self.app.get(
            f'/source-domain.com/.well-known/public-key/'
            f'{self.destination_domain}/{self.click_data_src}'
        )
        self.assertEqual(source_domain_public_key_response.status_code, 200)
        source_domain_public_key = source_domain_public_key_response.data
        self.assertTrue(source_domain_public_key)

        blind_nonce_response = self.app.post(
            'blinding-service.com/.well-known/blind',
            data={
                'public_key': source_domain_public_key,
                'message': nonce,
                'blinding_factor': click_blinding_factor
            }
        )
        self.assertEqual(blind_nonce_response.status_code, 200)
        blind_nonce = blind_nonce_response.data
        self.assertTrue(blind_nonce)

        self.assertEqual(
            unhexlify(blind_nonce),
            blind_message(
                unhexlify(source_domain_public_key),
                hash_message(unhexlify(nonce), 256),
                unhexlify(click_blinding_factor),
            )
        )

        # get signature of blind nonce from source-domain.com
        source_domain_blind_nonce_signature_response = self.app.post(
            'source-domain.com/.well-known/blind-signing',
            data={
                'destination_domain': self.destination_domain,
                'click_data_src': self.click_data_src,
                'blinded_nonce_src': blind_nonce,
                'csrf_token': csrf_token,
            }
        )
        self.assertEqual(source_domain_blind_nonce_signature_response.status_code, 200)
        source_domain_blind_nonce_signature = (
            source_domain_blind_nonce_signature_response.data
        )
        self.assertTrue(source_domain_blind_nonce_signature)

        source_domain_public_key_bytes = unhexlify(source_domain_public_key)
        blind_nonce_bytes = unhexlify(blind_nonce)
        source_domain_blind_nonce_signature_bytes = (
          unhexlify(source_domain_blind_nonce_signature)
        )

        # unblind signature from source-domain.com
        source_domain_nonce_signature_response = self.app.post(
            'blinding-service.com/.well-known/unblind',
            data={
                'public_key': source_domain_public_key,
                'message': nonce,
                'blind_message': source_domain_blind_nonce_signature,
                'blinding_factor': click_blinding_factor,
            }
        )
        self.assertEqual(source_domain_nonce_signature_response.status_code, 200)
        source_domain_nonce_signature = source_domain_nonce_signature_response.data
        self.assertTrue(source_domain_nonce_signature)

        # validate signature from source-domain.com
        self.assertTrue(
            validate_signature(
                unhexlify(source_domain_public_key),
                hash_message(unhexlify(nonce), 256),
                unhexlify(source_domain_nonce_signature),
            )
        )

        # report signing
        report_blinding_factor = self.app.get(
            'blinding-service.com/.well-known/random-bytes/16'
        ).data

        csrf_token = build_new_csrf_token()

        # blind nonce for destination-domain.com
        destination_domain_public_key_response = self.app.get(
            f'/destination-domain.com/.well-known/public-key/{self.report_data_dest}'
        )
        self.assertEqual(destination_domain_public_key_response.status_code, 200)
        destination_domain_public_key = destination_domain_public_key_response.data
        self.assertTrue(destination_domain_public_key)

        blind_nonce_response = self.app.post(
            'blinding-service.com/.well-known/blind',
            data={
                'public_key': destination_domain_public_key,
                'message': nonce,
                'blinding_factor': report_blinding_factor
            }
        )
        self.assertEqual(blind_nonce_response.status_code, 200)
        blind_nonce = blind_nonce_response.data
        self.assertTrue(blind_nonce)

        self.assertEqual(
            unhexlify(blind_nonce),
            blind_message(
                unhexlify(destination_domain_public_key),
                hash_message(unhexlify(nonce), 256),
                unhexlify(report_blinding_factor),
            )
        )

        # get signature of blind nonce from destination-domain.com
        destination_domain_blind_nonce_signature_response = self.app.post(
            'destination-domain.com/.well-known/blind-signing',
            data={
                'report_data_dest': self.report_data_dest,
                'blinded_nonce_dest': blind_nonce,
                'csrf_token': csrf_token,
            }
        )
        self.assertEqual(destination_domain_blind_nonce_signature_response.status_code, 200)
        destination_domain_blind_nonce_signature = (
            destination_domain_blind_nonce_signature_response.data
        )
        self.assertTrue(destination_domain_blind_nonce_signature)


        # unblind signature from destination-domain.com
        destination_domain_nonce_signature_response = self.app.post(
            'blinding-service.com/.well-known/unblind',
            data={
                'public_key': destination_domain_public_key,
                'message': nonce,
                'blind_message': destination_domain_blind_nonce_signature,
                'blinding_factor': report_blinding_factor,
            }
        )
        self.assertEqual(destination_domain_nonce_signature_response.status_code, 200)
        destination_domain_nonce_signature = destination_domain_nonce_signature_response.data
        self.assertTrue(destination_domain_nonce_signature)

        # validate signature from destination-domain.com
        self.assertTrue(
            validate_signature(
                unhexlify(destination_domain_public_key),
                hash_message(unhexlify(nonce), 256),
                unhexlify(destination_domain_nonce_signature),
            )
        )

        source_domain_report_response = self.app.post(
            'source-domain.com/.well-known/report',
            data={
                'destination_domain': self.destination_domain,
                'click_data_src': self.click_data_src,
                'report_data_dest': self.report_data_dest,
                'nonce': nonce,
                'signature_src': source_domain_nonce_signature,
                'signature_dest': destination_domain_nonce_signature,
            },
        )
        self.assertEqual(source_domain_report_response.status_code, 200)
        source_domain_report = source_domain_report_response.data
        self.assertEqual(source_domain_report.decode('utf8'), 'True')
