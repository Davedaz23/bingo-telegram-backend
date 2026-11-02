const http = require('http');

const data = JSON.stringify({ email: 'test2@example.com', password: 'password123', firstName: 'Test2' });
const req = http.request({
  hostname: '127.0.0.1',
  port: 5001,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', body));
});

req.on('error', (e) => console.error('Error:', e));
req.write(data);
req.end();
