// Test route
import http from 'http';

const options = {
    hostname: 'localhost',
    port: 3002,
    path: '/api/biometrico/escritorio/ITL-ESC-00000000000000000000000000000007',
    method: 'GET',
    headers: {
        // We don't have auth_token but maybe it bypasses or gives 401
        // Let's just see HTTP status code
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Status:', res.statusCode, 'Data:', data));
});
req.on('error', err => console.error(err));
req.end();
