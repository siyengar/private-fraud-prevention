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
