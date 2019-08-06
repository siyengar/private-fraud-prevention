# private-fraud-prevention

this is a proof-of-concept implementation for verified click reporting without linkage between click and reporting event. this repo **should not be considered secure**, and is only a demo.

## pre-requisites

You need to have the following components installed

* Python3
* nodejs
* npm
* browserify : `npm install -g browserify`

## installation

Within a python3 virtual environment, run

```
pip install -r requirements.txt
```

then run

```
make dev
```

to run the tests, run

```
nose2
```

## chrome extension

this relies on a simple chrome extension to handle the flow on the user side. To load the extension open your chrome browser and navigate to

```
chrome://extensions
```

from this page click the slider in the upper right corner to enter "developer mode", if you are not already.

once in dev mode, click 'load unpacked' in the upper left corner, then select the `chrome` directory of this repository.

That's it! the extension is loaded. You should now see it appear on the page with options to see details, remove, refresh, or disable along the bottom.

See the [chrome-dev/README.md](../chrome-dev/README.md) for more development details.

## basic flow

For simplicity, when running locally, all urls below would be prepended with `localhost:5000/`. in reality, `source-domain.com` and `destination-domain.com` would be entirely different domains, and `blinding-service.com` would be internalized in the browser.

To begin:
1. Use Chrome to navigate to [source-domain.com](http://localhost:5000/source-domain.com)
2. Click a button on this page. The following will occur:
    1. user clicks an link to [destination-domain.com](localhost:5000/destination-domain.com) at [source-domain.com](localhost:5000/source-domain.com). this is tagged with a `click_data_src` and a `csrf_token`.
    2. the browser generates random bytes to use as a nonce.
3. Provided you are using the Chrome plugin as per set up above, click binding will then occur:
    1. the browser gets a public RSA key from `source-domain.com/.well-known/public-key/destination-domain.com/<click_data_src>`
    2. the browser generates random bytes to us a blinding factor.
    3. the browser blinds the nonce with the public RSA key and the blinding factor.
    4. the browser posts the destination domain ([destination-domain.com](localhost:5000/destination-domain.com)), click_data_src, blind nonce and the csrf_token to `source-domain.com/.well-known/blind-signing`
    5. source-domain.com verifies the csrf_token and returns a signature of the blind nonce
    6. the browser unblinds the signature and verifies it with the public key
4. When a user clicks an "Event" button on destination-domain.com:
   1. destination-domain.com sends to the browser report interface report data, priority, and a csrf_token
5. Provided you are using the Chrome plugin as per set up above, report binding will then occur:
    1. the browser gets a public RSA key from `destination-domain.com/.well-known/public-key/<report_data_dest>`
    2. the browser generates random bytes to us a blinding factor.
    3. the browser blinds the nonce with the public RSA key and the blinding factor.
    4. the browser posts the report data, blind nonce and the csrf_token to `destination-domain.com/.well-known/blind-signing`
    5. destination-domain.com verifies the csrf_token and returns a signature of the blind nonce
    6. the browser unblinds the signature and verifies it with the public key
6. Finally, report generation will occur:
    1. the browser joins a click to `destination-domain.com` with an event on `destination-domain.com`, and takes the report with the highest priority.
    2. the browser posts the click data, the report data, the nonce, and both unblinded signatures to `source-domain.com/.well-known/report`. source-domain.com is then able to verify both signatures from the public keys.


To validate each of these steps, you can follow in the Flask server logs, in the same terminal window as you ran `make dev`.


## development

The client uses browserify to package js and related components.
If you modify js, you need to run

```
./client/build
```
