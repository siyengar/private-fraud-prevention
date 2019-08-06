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
