const jwt = require('jsonwebtoken');
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZTMxODQyY2NhNzFmMzk4NmViYzk0MSIsInJvbGUiOiJ3b3JrZXIiLCJpYXQiOjE3Nzc5ODQyNjQsImV4cCI6MTc4MDU3NjI2NH0.keBCEJiQwKRrYdziSDcGbABfbjsecw9M4LkA4wJDJD0';
try {
    const decoded = jwt.decode(token);
    console.log(JSON.stringify(decoded, null, 2));
} catch (e) {
    console.error(e);
}
