const http = require('http');

const data = JSON.stringify({ email: 'test@example.com', password: 'password123', firstName: 'Test' });
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
  res.on('end', () => console.log('Register Status:', res.statusCode, 'Body:', body));
});

req.on('error', (e) => console.error('Register Error:', e.message));
req.write(data);
req.end();
