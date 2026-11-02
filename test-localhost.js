const http = require('http');

const data = JSON.stringify({ email: 'test3@example.com', password: 'password123', firstName: 'Test3' });
const req = http.request({
  hostname: 'localhost',
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

req.on('error', (e) => console.error('Error:', e.message, e.code));
req.write(data);
req.end();
