browser = require('./browser.js');
common = require('./common.js');

// hard coded for localhost example from installation instructions
const source_domain_public_key_endpoint = 'http://localhost:5000/source-domain.com/.well-known/public-key/'
const source_domain_blind_signing_endpoint = 'http://localhost:5000/source-domain.com/.well-known/blind-signing'

// get the public key from the source domain for a specific click data
const source_domain_public_key = async function(
    domain,
    click_data_src,
) {
    public_key_url = source_domain_public_key_endpoint + domain + '/' + click_data_src;
    const response = await fetch(public_key_url);
    return await response.text();
}

// send a request to a source to sign an already blinded nonce
const source_domain_blind_signing = async function(
    destination_domain,
    click_data_src,
    blinded_nonce_src,
    csrf_token,
) {
    var formData = new URLSearchParams();
    formData.append('destination_domain', destination_domain);
    formData.append('click_data_src', click_data_src);
    formData.append('blinded_nonce_src', blinded_nonce_src);
    formData.append('csrf_token', csrf_token);
    const response = await fetch(source_domain_blind_signing_endpoint, {
        method: 'POST',
        body: formData,
    });
    if (response.ok) {
        return await response.text();
    }
}

// create a nonce, blind it, ask source to sign, then unblind the response
const execute_source_signatures = async function(
    source_domain,
    click_data_src,
    csrf_token_src,
) {
    nonce = browser.get_random_bytes();
    click_blinding_factor_src = browser.get_random_bytes();
    public_key_src = source_domain_public_key(source_domain, click_data_src);
    values = await Promise.all(
        [nonce, click_blinding_factor_src, csrf_token_src, public_key_src]);

    nonce = values[0];
    click_blinding_factor_src = values[1];
    csrf_token_src = values[2];
    public_key_src = values[3];

    blinded_nonce_src = await browser.blind_message(
        public_key_src,
        nonce,
        click_blinding_factor_src
    );

    if (blinded_nonce_src === undefined) {
        throw new Error('source blind_message failed')
    };

    blinded_signature_src = await source_domain_blind_signing(
        source_domain,
        click_data_src,
        blinded_nonce_src,
        csrf_token_src
    );

    if (blinded_signature_src === undefined) {
        throw new Error('source_domain_blind_signing failed')
    };

    real_signature_src = await browser.unblind_message(
        public_key_src,
        nonce,
        blinded_signature_src,
        click_blinding_factor_src
    );

    if (real_signature_src === undefined) {
        throw new Error('source unblind_message failed')
    };

    return {
        nonce: nonce,
        signature_src: real_signature_src,
    };
}

// executes source signature process for outstanding unsigned clicks
const signLinkClick = async function(
    link_click_data,
) {
    var link_click_data = link_click_data.unsigned_link_click;
    if (link_click_data === undefined) {
        return
    }
    await chrome.storage.local.remove(
        "unsigned_link_click",
    )
    var click_signature_response = await execute_source_signatures(
        link_click_data["destination_domain"],
        link_click_data["click_data_src"],
        link_click_data["csrf_token_src"],
    )
    if (click_signature_response != undefined){
        var signed_link_clicks = await common.chrome_storage_local_get_promise(
            "signed_link_clicks"
        )
        storeSignedLinkClick(
            link_click_data,
            click_signature_response,
            signed_link_clicks
        );
    }
}

// stores fully executed source signature information
const storeSignedLinkClick = function(
    link_click_data,
    click_signature_response,
    signed_link_clicks,
){
    var signed_link_clicks = signed_link_clicks.signed_link_clicks;
    if (signed_link_clicks == undefined) {
        signed_link_clicks = [];
    };
    signed_link_clicks = signed_link_clicks.concat({
        "source_domain": link_click_data["source_domain"],
        "destination_domain": link_click_data["destination_domain"],
        "click_data_src": link_click_data["click_data_src"],
        "nonce": click_signature_response["nonce"],
        "signature_src": click_signature_response["signature_src"]
    })
    common.chrome_storage_local_set_promise(
        {"signed_link_clicks": signed_link_clicks}
    )

};

module.exports = {
    signLinkClick: signLinkClick
}
