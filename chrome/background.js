(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
source = require('./source.js');
destination = require('./destination.js');

chrome.storage.onChanged.addListener(function() {
    chrome.storage.local.get("unsigned_link_click", source.signLinkClick);
    chrome.storage.local.get("unsigned_report", destination.signReport);
});

},{"./destination.js":4,"./source.js":5}],2:[function(require,module,exports){
blind_endpoint = 'http://localhost:5000/blinding-service.com/.well-known/blind';
unblind_endpoint = 'http://localhost:5000/blinding-service.com/.well-known/unblind';
random_bytes_endpoint = 'http://localhost:5000/blinding-service.com/.well-known/random-bytes/16';

// note that this script makes requests to a blinding service - this is an
// abstraction, a browser would normally perform these actions internally
module.exports = {

    get_random_bytes: async function() {
        const response = await fetch(random_bytes_endpoint);
        return await response.text();
    },

    // takes a message and 'blinds' it so it can be signed anonymously
    blind_message: async function(
        public_key,
        message,
        blinding_factor
    ) {
        var formData = new URLSearchParams();
        formData.append('public_key', public_key);
        formData.append('message', message);
        formData.append('blinding_factor', blinding_factor);
        const response = await fetch(blind_endpoint, {
            method: 'POST',
            body: formData,
        });
        if (response.ok){
            return await response.text();
        }
    },

    // reverse the blind operation for a message with a signature
    // the unblinded signature is still valid for the unblinded message
    unblind_message: async function(
        public_key,
        message,
        blinded_signature,
        blinding_factor
    ) {
        var formData = new URLSearchParams();
        formData.append('public_key', public_key);
        formData.append('message', message);
        formData.append('blind_message', blinded_signature);
        formData.append('blinding_factor', blinding_factor);
        const response = await fetch(unblind_endpoint, {
            method: 'POST',
            body: formData,
        });
        if (response.ok){
            return await response.text();
        }
    }
}

},{}],3:[function(require,module,exports){
const chrome_storage_local_get_promise = async function(key){
    return new Promise(function(resolve){
        chrome.storage.local.get(key, function(result){
            resolve(result);
        })
    })
}

const chrome_storage_local_set_promise = async function(obj){
    return new Promise(function(resolve){
        chrome.storage.local.set(obj, function(result){
            resolve(result);
        })
    })
}

module.exports = {
    chrome_storage_local_get_promise: chrome_storage_local_get_promise,
    chrome_storage_local_set_promise: chrome_storage_local_set_promise,
}

},{}],4:[function(require,module,exports){
browser = require('./browser.js');
common = require('./common.js');

// hard coded for localhost example from installation instructions
const destination_domain_public_key_endpoint = 'http://localhost:5000/destination-domain.com/.well-known/public-key/'
const destination_domain_blind_signing_endpoint = 'http://localhost:5000/destination-domain.com/.well-known/blind-signing'

// get the public key from the destiantion domain for a specific outcome
const destination_domain_public_key = async function(
    report_data_dest,
) {
    public_key_url = destination_domain_public_key_endpoint + report_data_dest;
    const response = await fetch(public_key_url);
    if (response.ok) {
        return await response.text();
    }
}

// send a request to a destiantion to sign an already blinded nonce
const destination_domain_blind_signing = async function(
    report_data_dest,
    blinded_nonce_dest,
    csrf_token,
) {
    var formData = new URLSearchParams();
    formData.append('report_data_dest', report_data_dest);
    formData.append('blinded_nonce_dest', blinded_nonce_dest);
    formData.append('csrf_token', csrf_token);
    const response = await fetch(destination_domain_blind_signing_endpoint, {
        method: 'POST',
        body: formData,
    });
    if (response.ok) {
        return await response.text();
    }
}

/** creates a nonce if it doesn't already exist from an event in the source
domain blinds the nonce, ask desination to sign, then unblind the response **/
const execute_destination_signatures = async function(
    report_data_dest,
    csrf_token_dest,
    nonce,
) {
    report_blinding_factor_dest = browser.get_random_bytes();
    public_key_dest = destination_domain_public_key(report_data_dest);
    if (nonce === undefined) {
        nonce = browser.get_random_bytes();
    }
    values = await Promise.all(
        [nonce, report_blinding_factor_dest, csrf_token_dest, public_key_dest]);

    nonce = values[0];
    report_blinding_factor_dest = values[1];
    csrf_token_dest = values[2];
    public_key_dest = values[3];


    blinded_nonce_dest = await browser.blind_message(
        public_key_dest,
        nonce,
        report_blinding_factor_dest
    );

    if (blinded_nonce_dest === undefined) {
        throw new Error('destination blind_message failed')
        return
    };

    blinded_signature_dest = await destination_domain_blind_signing(
        report_data_dest,
        blinded_nonce_dest,
        csrf_token_dest
    );

    if (blinded_signature_dest === undefined) {
        throw new Error('destination_domain_blind_signing failed')
        return
    };


    real_signature_dest = await browser.unblind_message(
        public_key_dest,
        nonce,
        blinded_signature_dest,
        report_blinding_factor_dest
    );

    if (real_signature_dest === undefined) {
        throw new Error('destination unblind_message failed')
        return
    };

    return {
        nonce: nonce,
        signature_dest: real_signature_dest,
    };
}

// executes source signature process for outstanding unsigned reports
const signReport = async function(
    report_data
) {
    var report_data = report_data.unsigned_report;
    if (report_data === undefined) {
        return
    }
    var signed_link_clicks = await common.chrome_storage_local_get_promise(
        "signed_link_clicks"
    )
    var matching_response = await matchReportToSignedLinkClicks(
        report_data,
        signed_link_clicks
    )
    var matched_signed_link_clicks = matching_response.matched_signed_link_clicks;
    var unmatched_signed_link_clicks = matching_response.unmatched_signed_link_clicks;
    await chrome.storage.local.remove(
        "unsigned_report",
    )
    if (matched_signed_link_clicks.length === 0) {
        /** make a request for each event, even if no click happened
        note that the current server implementation only provides one csrf
        if there is more than click per event, only the first will succeed **/
        execute_destination_signatures(
            report_data["report_data_dest"],
            report_data["csrf_token_dest"],
            undefined,
        )
    }
    matched_signed_link_clicks.forEach(async function(click){
        var report_signature_response = await execute_destination_signatures(
            report_data["report_data_dest"],
            report_data["csrf_token_dest"],
            click.nonce,
        )
        if (report_signature_response != undefined){
            makeReport(
                matched_signed_link_clicks,
                report_data,
                report_signature_response
            );
        }
        await common.chrome_storage_local_set_promise({
            "signed_link_clicks":
            unmatched_signed_link_clicks
        });
    });
}

// reconciles unsigned events against signed clicks
const matchReportToSignedLinkClicks = async function(
    report_data,
    signed_link_clicks,
) {
    var signed_link_clicks = signed_link_clicks.signed_link_clicks;
    if (signed_link_clicks == undefined) {
        signed_link_clicks = [];
    }
    var matched_signed_link_clicks = [];
    var unmatched_signed_link_clicks = [];
    signed_link_clicks.forEach(function(click){
        if (click.source_domain === report_data["source_domain"] &&
            click.destination_domain === report_data["destination_domain"] &&
            click.click_data_src === report_data["click_data_src"]) {
            matched_signed_link_clicks.push(click);
        } else {
            unmatched_signed_link_clicks.push(click);
        }
    });
    return {
        matched_signed_link_clicks: matched_signed_link_clicks,
        unmatched_signed_link_clicks: unmatched_signed_link_clicks,

    }
}

// posts to source domain -- an unblinded nonce signed by source and desination
const postReport = async function(
    source_domain,
    destination_domain,
    click_data_src,
    report_data_dest,
    nonce,
    signature_src,
    signature_dest,
) {
    let source_domain_report_endpoint = 'http://localhost:5000/' + source_domain + '/.well-known/report'

    var formData = new URLSearchParams();
    formData.append('destination_domain', destination_domain);
    formData.append('click_data_src', click_data_src);
    formData.append('report_data_dest', report_data_dest);
    formData.append('nonce', nonce);
    formData.append('signature_src', signature_src);
    formData.append('signature_dest', signature_dest);
    const response = await fetch(source_domain_report_endpoint, {
        method: 'POST',
        body: formData,
    });
    console.log('Report Sent: ' + formData.toString());
    return await response.text();

}

// post every valid report
const makeReport = function(
    matched_signed_link_clicks,
    report_data,
    report_signature_response,
){
    matched_signed_link_clicks.forEach(
        function(link_click){
            postReport(
                link_click.source_domain,
                link_click.destination_domain,
                link_click.click_data_src,
                report_data["report_data_dest"],
                link_click.nonce,
                link_click.signature_src,
                report_signature_response["signature_dest"]
            )
        }
    );
}

module.exports = {
    signReport: signReport
}

},{"./browser.js":2,"./common.js":3}],5:[function(require,module,exports){
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

},{"./browser.js":2,"./common.js":3}]},{},[1]);
