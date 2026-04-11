# Backend Face Recognition Implementation Guide

This document explains the backend implementation of face recognition features in the Cipher project.

## Features Implemented

1. **Face Embeddings Storage**
   - Added `faceEmbeddings` field to the Worker model
   - Storage of multiple face embeddings per worker for better recognition accuracy

2. **Face Recognition Endpoint**
   - New API endpoint for face recognition and attendance marking
   - Integration with existing attendance system

3. **Face Data Management**
   - CRUD operations for face embeddings
   - Integration with worker management endpoints

## Technical Details

### Database Schema Changes

#### Worker Model

Added a new field to the Worker schema:
```javascript
faceEmbeddings: {
  type: [[Number]], // Storing arrays of numbers for face embeddings
  default: []
}
```

This field stores multiple face embeddings (arrays of numbers) for each worker, allowing for more accurate face recognition.

### API Endpoints

#### 1. Face Recognition Attendance
- **Endpoint**: `POST /api/attendance/face-recognition`
- **Access**: Private (requires authentication)
- **Function**: Recognizes a face and marks attendance for the matching worker

**Request Body**:
```json
{
  "faceDescriptor": [0.1, 0.2, 0.3, ...], // 128-dimensional face embedding
  "subdomain": "companyname"
}
```

**Response**:
```json
{
  "message": "Attendance marked as in/out",
  "attendance": { /* attendance object */ },
  "worker": { /* worker object */ }
}
```

#### 2. Get Worker by RFID
- **Endpoint**: `POST /api/workers/get-worker-by-rfid`
- **Access**: Public
- **Function**: Retrieves worker information by RFID (used for location validation)

**Request Body**:
```json
{
  "rfid": "AB1234"
}
```

**Response**:
```json
{
  "worker": { /* worker object */ }
}
```

### Controllers

#### Attendance Controller (`attendanceController.js`)

Added new function `recognizeFaceAndMarkAttendance`:
- Receives face descriptor from frontend
- Compares with stored face embeddings using Euclidean distance
- Finds the best matching worker
- Marks attendance for the matched worker
- Returns attendance record and worker information

Key functions:
- `calculateEuclideanDistance`: Calculates distance between two face descriptors
- `recognizeFaceAndMarkAttendance`: Main face recognition logic

#### Worker Controller (`workerController.js`)

Updated existing functions to handle face embeddings:
- `createWorker`: Accepts and stores face embeddings
- `updateWorker`: Updates face embeddings when provided
- `getWorkerById`: Returns worker with face embeddings
- Added `getWorkerByRfid`: New function to retrieve worker by RFID

### Services

#### Location Utils (`locationUtils.js`)

Added `calculateDistance` function:
- Calculates distance between two geographical coordinates using the Haversine formula
- Used for location-based attendance validation

### Routes

#### Attendance Routes (`attedanceRoutes.js`)

Added new routes:
- `POST /face-recognition`: For face recognition attendance
- `POST /worker-last`: For getting worker's last attendance record

#### Worker Routes (`workerRoutes.js`)

Added new route:
- `POST /get-worker-by-rfid`: For retrieving worker by RFID

## Face Recognition Algorithm

The system uses a simple but effective face recognition algorithm:

1. **Face Embedding Comparison**
   - Each face is represented as a 128-dimensional vector (embedding)
   - Stored embeddings are compared with the provided embedding
   - Euclidean distance is used as the similarity metric

2. **Matching Process**
   - For each worker with face embeddings, calculate distance to provided embedding
   - Find the worker with the minimum distance
   - If distance is below threshold (0.4), consider it a match

3. **Threshold**
   - Current threshold is set to 0.4 for balancing accuracy and usability
   - Can be adjusted based on requirements

## Security Considerations

1. **Data Storage**
   - Face embeddings are stored as numerical arrays, not actual images
   - No facial images are stored on the server

2. **Access Control**
   - Face recognition endpoints are protected with authentication
   - Only authorized users can access face data

3. **Privacy**
   - Face data is tied to specific subdomains
   - No cross-company face matching is possible

## Performance

1. **Database Queries**
   - Only workers with face embeddings are loaded for comparison
   - Indexing can be added for better performance with large datasets

2. **Recognition Speed**
   - Euclidean distance calculation is fast
   - Complexity is O(n*m) where n is number of workers and m is average embeddings per worker

## Extensibility

The current implementation can be extended in several ways:

1. **Improved Algorithms**
   - Implement more sophisticated face matching algorithms
   - Add confidence scoring

2. **Performance Optimization**
   - Add database indexing for face embeddings
   - Implement caching for frequently accessed data

3. **Additional Features**
   - Add face verification (1:1 matching) for higher security
   - Implement face clustering for unknown face detection

## Troubleshooting

### No Matching Worker Found

If the system cannot match a face:
1. Verify that face data has been captured for the worker
2. Check that the face embeddings are properly stored
3. Adjust the matching threshold if needed

### Slow Recognition

If face recognition is slow:
1. Check the number of workers with face embeddings
2. Consider implementing database indexing
3. Optimize the matching algorithm

### Location Validation Errors

If location validation fails:
1. Verify that location settings are properly configured
2. Check that the worker's device can access geolocation
3. Ensure the allowed location coordinates are correct