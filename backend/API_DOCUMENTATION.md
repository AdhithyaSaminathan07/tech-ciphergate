# CipherGate API Service Documentation

This document explains how to use the CipherGate secure API service to integrate external applications with your attendance system.

## 1. Authentication

All requests to the external API must include your unique API key in the request headers.

**Header Name:** `x-api-key`  
**Header Value:** `cg_your_unique_api_key_here`

## 2. Base URL

The external API is accessible at:
`https://your-domain.com/api/external`

## 3. Endpoints

### GET /attendance
Retrieve all attendance records for your company.

**Example Request (Axios):**
```javascript
const axios = require('axios');

async function getAttendance() {
  try {
    const response = await axios.get('https://your-domain.com/api/external/attendance', {
      headers: {
        'x-api-key': 'cg_1234567890abcdef'
      }
    });
    console.log(response.data);
  } catch (error) {
    console.error('API Error:', error.response.data);
  }
}
```

### POST /attendance
Mark attendance for a worker.

**Body Parameters:**
- `rfid` (String, Required): The RFID/ID of the worker.
- `presence` (Boolean, Optional): `true` for IN, `false` for OUT. If omitted, it toggles based on last punch.

**Example Request (Fetch):**
```javascript
fetch('https://your-domain.com/api/external/attendance', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'cg_1234567890abcdef'
  },
  body: JSON.stringify({
    rfid: 'WORKER_RFID_123',
    presence: true
  })
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));
```

### GET /report
Retrieve today's attendance summary (percentage, total workers, present workers).

**Example Request:**
```javascript
const response = await axios.get('https://your-domain.com/api/external/report', {
  headers: { 'x-api-key': 'cg_1234567890abcdef' }
});
```

## 4. Rate Limiting
- Each API key is limited to **100 requests per 15 minutes**.
- If exceeded, you will receive a `429 Too Many Requests` response.

## 5. Security Best Practices
1. **Keep your API key secret**: Never share it or include it in client-side code (frontend) if possible. Use a backend proxy.
2. **Rotate keys**: Periodically revoke old keys and generate new ones via the Admin Dashboard.
3. **Use HTTPS**: Always call the API over HTTPS to ensure your key is encrypted in transit.

## 6. Admin Management (Internal)
Admins can manage API keys via:
- `GET /api/admin/keys`: List all keys.
- `POST /api/admin/keys`: Generate a new key.
  - Body: `{ "clientName": "System A", "subdomain": "company_name", "permissions": ["read", "write"], "expiryDays": 30 }`
- `DELETE /api/admin/keys/:id`: Revoke a key.
- `PATCH /api/admin/keys/:id/toggle`: Enable/Disable a key.
