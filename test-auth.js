const http = require('http');

function testEndpoint(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 5001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  try {
    // Test register
    const reg = await testEndpoint('/api/auth/register', 'POST', {
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test'
    });
    console.log('Register:', reg.status, reg.body);

    // Test login
    const login = await testEndpoint('/api/auth/login', 'POST', {
      email: 'test@example.com',
      password: 'password123'
    });
    console.log('Login:', login.status, login.body);

    // Test me with token
    const loginData = JSON.parse(login.body);
    if (loginData.success) {
      const me = await testEndpoint('/api/auth/me', 'GET');
      // Need to add auth header
      const options = {
        hostname: 'localhost',
        port: 5001,
        path: '/api/auth/me',
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + loginData.token
        }
      };
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => console.log('Me:', res.statusCode, body));
      });
      req.on('error', (e) => console.error('Me error:', e.message));
      req.end();
    }
  } catch (e) {
    console.error('Test error:', e.message);
  }
}

main();
