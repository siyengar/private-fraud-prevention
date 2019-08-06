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
