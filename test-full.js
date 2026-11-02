const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  // Register
  const regData = JSON.stringify({ email: 'test4@example.com', password: 'password123', firstName: 'Test4' });
  const regRes = await request({
    hostname: 'localhost', port: 5001, path: '/api/auth/register', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(regData) }
  }, regData);
  console.log('Register:', regRes.status, regRes.body);

  // Login
  const loginData = JSON.stringify({ email: 'test4@example.com', password: 'password123' });
  const loginRes = await request({
    hostname: 'localhost', port: 5001, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginData) }
  }, loginData);
  console.log('Login:', loginRes.status, loginRes.body);

  // Get profile
  const loginBody = JSON.parse(loginRes.body);
  if (loginBody.success) {
    const meRes = await request({
      hostname: 'localhost', port: 5001, path: '/api/auth/me', method: 'GET',
      headers: { 'Authorization': 'Bearer ' + loginBody.token }
    });
    console.log('Me:', meRes.status, meRes.body);
  }
}

main().catch(e => console.error(e));
