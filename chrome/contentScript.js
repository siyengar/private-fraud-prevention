(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
function getFakeHost(url_str){
    /**
     * Pull out source-domain.com or destination-domain.com
     * from http://localhost:5000/<domain> structure.
     * Just for local prototyping.
     */
    url = new URL(url_str);
    return url.pathname.split("/").filter(str => str != "")[0]
}

var click_links = Array.prototype.slice.call(document.querySelectorAll("a")).filter(
    link => link.hasAttribute("csrf_token_src")
)

current_host = getFakeHost(document.URL);
click_links.forEach(function(link) {
    var link_data = {
        "unsigned_link_click": {
            "source_domain": current_host,
            "destination_domain": getFakeHost(link.href),
            "click_data_src": link.getAttribute("click_data_src"),
            "csrf_token_src": link.getAttribute("csrf_token_src")
        },

    }
    link.addEventListener('click', function() {
        chrome.storage.local.set(link_data, function(){})
    });
});


var report_links = Array.prototype.slice.call(document.querySelectorAll("a")).filter(
    link => link.hasAttribute("csrf_token_dest")
)

report_links.forEach(function(link){
    var report_data = {
        "unsigned_report" : {
            "source_domain": link.getAttribute("source_domain"),
            "destination_domain": current_host,
            "click_data_src": link.getAttribute("click_data_src"),
            "report_data_dest": link.getAttribute("report_data_dest"),
            "csrf_token_dest": link.getAttribute("csrf_token_dest")
        }
    }
    link.addEventListener('click', function() {
        chrome.storage.local.set(report_data, function(){})
    });
});

},{}]},{},[1]);
