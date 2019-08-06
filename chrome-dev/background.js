source = require('./source.js');
destination = require('./destination.js');

chrome.storage.onChanged.addListener(function() {
    chrome.storage.local.get("unsigned_link_click", source.signLinkClick);
    chrome.storage.local.get("unsigned_report", destination.signReport);
});
