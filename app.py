from binascii import hexlify, unhexlify
from dataclasses import dataclass
import random
import uuid

from flask import (
    Flask,
    Blueprint,
    request,
    render_template,
)
from Crypto.Random import (
    get_random_bytes
)

from crypto.crypto import (
    get_rsa_key,
    get_public_key,
    sign_message,
    validate_signature,
    blind_message,
    unblind_message,
)


app = Flask(__name__)

if app.config['DEBUG']:
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0


source_domain = Blueprint('source_domain', __name__)
destination_domain = Blueprint('destination_domain', __name__)

# normally everything handled by 'blinding_service' would be a browser internal
blinding_service = Blueprint('blinding_service', __name__)

# list of oustanding unredeemed csrf tokens
csrf_tokens = set()


# basic data structure for linked items
@dataclass
class LinkedItem:
    name: str
    _id: int
    value: int
    click_data_src: str
    report_data_dest: str


all_linked_items = [
    LinkedItem('Cool LinkedItem 1', 1, 10, uuid.uuid4(), uuid.uuid4()),
    LinkedItem('Cool LinkedItem 2', 2, 25, uuid.uuid4(), uuid.uuid4()),
    LinkedItem('Cool LinkedItem 3', 3, 55, uuid.uuid4(), uuid.uuid4()),
    LinkedItem('Cool LinkedItem 4', 4, 125, uuid.uuid4(), uuid.uuid4()),
    LinkedItem('Cool LinkedItem 5', 5, 1150, uuid.uuid4(), uuid.uuid4()),
]


def build_new_csrf_token():
    csrf_token = get_random_bytes(16).hex()
    csrf_tokens.add(csrf_token)
    return csrf_token


def validate_csrf_token(csrf_token):
    if csrf_token in csrf_tokens:
        csrf_tokens.remove(csrf_token)
        return True
    else:
        return False


@app.context_processor
def utility_processor():
    return {
        'build_new_csrf_token': build_new_csrf_token
    }


@app.route('/')
def hello_world():
    return 'Hello, World!'


@source_domain.route('/')
def source_domain_index():
    ads = random.sample(all_linked_items, 2)
    return render_template('source.html', ads=ads)


@source_domain.route('/.well-known/public-key/<string:destination_domain>/<string:click_data_src>')
def source_domain_public_key(
        destination_domain: str,
        click_data_src: str,
):
    return hexlify(get_public_key(
        ('source-domain.com', destination_domain, click_data_src)
    ))


@source_domain.route('/.well-known/blind-signing', methods=['POST'])
def source_domain_blind_signing():
    destination_domain = request.form['destination_domain']
    click_data_src = request.form['click_data_src']
    blinded_nonce_src = unhexlify(request.form['blinded_nonce_src'])
    csrf_token = request.form['csrf_token']

    if not validate_csrf_token(csrf_token):
        raise Exception('invalid csrf token')

    return hexlify(sign_message(
        get_rsa_key(('source-domain.com', destination_domain, click_data_src)),
        blinded_nonce_src
    ))


@source_domain.route('/.well-known/report', methods=['POST'])
def source_domain_report():
    destination_domain = request.form['destination_domain']
    click_data_src = request.form['click_data_src']
    report_data_dest = request.form['report_data_dest']
    nonce = unhexlify(request.form['nonce'])
    signature_src = unhexlify(request.form['signature_src'])
    signature_dest = unhexlify(request.form['signature_dest'])

    source_domain_public_key = get_public_key(
        ('source-domain.com', destination_domain, click_data_src)
    )

    # this would normally make an http request out to a service like key transparency
    destination_domain_public_key = get_public_key(('destination-domain.com', report_data_dest))

    signature_src_valid = validate_signature(
        source_domain_public_key,
        nonce,
        signature_src
    )
    signature_dest_valid = validate_signature(
        destination_domain_public_key,
        nonce,
        signature_dest
    )
    valid = str(signature_src_valid and signature_dest_valid)
    app.logger.info(
        f'report recieved: valid: {valid} \n'
        f'click_data_src: {click_data_src}, \n'
        f'report_data_dest: {report_data_dest}\n'
        f'signature_src_valid: {signature_src_valid} \n'
        f'signature_dest_valid: {signature_dest_valid}'
    )
    return valid


@destination_domain.route('/', defaults={'linked_item_id': None})
@destination_domain.route('/linked_items/<int:linked_item_id>')
def destination_domain_linked_items(
        linked_item_id: int
):
    if linked_item_id is None:
        linked_items = all_linked_items
    else:
        linked_items = [
            linked_item for linked_item in all_linked_items
            if linked_item._id == linked_item_id
        ]
    return render_template('destination.html', linked_items=linked_items)


@destination_domain.route('/.well-known/public-key/<string:report_data_dest>')
def destination_domain_public_key(
        report_data_dest: str,
):
    return hexlify(get_public_key(('destination-domain.com', report_data_dest)))


@destination_domain.route('/.well-known/blind-signing', methods=['POST'])
def destination_domain_blind_signing():
    report_data_dest = request.form['report_data_dest']
    blinded_nonce_dest = unhexlify(request.form['blinded_nonce_dest'])
    csrf_token = request.form['csrf_token']

    if not validate_csrf_token(csrf_token):
        raise Exception('invalid csrf token')

    return hexlify(sign_message(
        get_rsa_key(('destination-domain.com', report_data_dest)),
        blinded_nonce_dest
    ))

# normally everything handled by 'blinding_service' would be a browser internal
@blinding_service.route('/')
def hello_blinding_service():
    return 'Hello from blinding-service.com!'


@blinding_service.route('/.well-known/blind', methods=['POST'])
def blinding_service_blind_message():
    public_key = unhexlify(request.form['public_key'])
    message = unhexlify(request.form['message'])
    blinding_factor = unhexlify(request.form['blinding_factor'])
    return hexlify(blind_message(public_key, message, blinding_factor))


@blinding_service.route('/.well-known/unblind', methods=['POST'])
def blinding_service_unblind_message():
    public_key = unhexlify(request.form['public_key'])
    message = unhexlify(request.form['message'])
    blinded_message = unhexlify(request.form['blind_message'])
    blinding_factor = unhexlify(request.form['blinding_factor'])
    unblinded = unblind_message(public_key, blinded_message, blinding_factor)
    valid = validate_signature(public_key, message, unblinded)
    if not valid:
        raise Exception('unblinded signature is invalid')
    return hexlify(unblinded)


@blinding_service.route('/.well-known/random-bytes/<int:bytecount>')
def random_bytes(bytecount):
    return hexlify(get_random_bytes(bytecount))


app.register_blueprint(source_domain, url_prefix='/source-domain.com')
app.register_blueprint(destination_domain, url_prefix='/destination-domain.com')
app.register_blueprint(blinding_service, url_prefix='/blinding-service.com')

if __name__ == '__main__':
    app.run(
        extra_files=['.client/*']
    )
