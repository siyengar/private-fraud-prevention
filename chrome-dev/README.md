# Chrome Extension Development

These JavaScript files are used to build the Chrome Extension.


## Installation
To load the extension open your chrome browser and navigate to

```
chrome://extensions
```

from this page click the slider in the upper right corner to enter "developer mode", if you are not already.

once in dev mode, click 'load unpacked' in the upper left corner, then select the `chrome` directory of this repository.

That's it! the extension is loaded. You should now see it appear on the page with options to see details, remove, refresh, or disable along the bottom.

## Development

Make changes this directory (`private-fraud-prevention/chrome-dev`). To test the changes,

1. run `make build-extension` or `make dev`. This will generate the files needed in the `private-frauld-prevention/chrome` directory. (`make dev` will also start the Flask server.)
2. reload the extension from this extensions manager page

While debugging:
- any hard syntax errors will appear here on the extensions manager page as well - a new button will appear between the remove and refresh buttons that will bring you to an error log
- extensions run in a "background page", in a normally invisible tab. Click on the 'Inspect views background page' link from the extensions manager page to see extension output, most importantly the console log.

## Persistent Data

The extension also retains data, even if reloaded. Run the following command from the console to check what local data you have stored:

`chrome.storage.local.get(null, (resp) => console.log(resp));`

If you wish to clear data to start a fresh run, you can use a command like:

`chrome.storage.local.remove(["unsigned_link_click", "signed_link_clicks", "unsigned_report"], function(){})`
