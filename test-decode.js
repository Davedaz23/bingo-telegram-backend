const http = require('http');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your_super_secret_jwt_key_change_this_in_production';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2YTZmOWJkYjNmMjIwYmIyNjc5MTgwNmUiLCJlbWFpbCI6InRlc3Q0QGV4YW1wbGUuY29tIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3ODU2OTkyOTMsImV4cCI6MTc4NjMwNDA5M30.MW2Qrb7Z0LPNpABSC0FI1AKYtapm2E76qKLVisfaLeQ';

const decoded = jwt.verify(token, JWT_SECRET);
console.log('Decoded:', JSON.stringify(decoded, null, 2));
console.log('userId type:', typeof decoded.userId);
console.log('userId value:', decoded.userId);
