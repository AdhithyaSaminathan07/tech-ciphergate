# Face Recognition Implementation Guide

This document explains how to use the face recognition features implemented in the Cipher project.

## Features Implemented

1. **Face Capture for Employee Registration**
   - Admins can capture face data for employees during registration
   - Employees can have their face data updated at any time
   - System captures 5 different face angles for better recognition accuracy

2. **Face Attendance for Employees**
   - Employees can mark attendance using face recognition
   - Admins can also mark attendance for employees using face recognition
   - Real-time face detection with visual feedback

3. **Location-based Attendance Validation**
   - Attendance can be restricted to specific locations
   - Geolocation checking before allowing face attendance

## How to Use

### 1. Adding Face Data to an Employee

1. Navigate to the Admin Dashboard
2. Go to "Employee Management"
3. Either add a new employee or edit an existing one
4. Click the "Capture Face" button
5. Position the employee's face within the circular frame
6. Capture 5 different face angles
7. Save the employee data

### 2. Marking Attendance with Face Recognition

#### For Admins:
1. Navigate to the Admin Dashboard
2. Click on "Face Attendance" in the dashboard cards
3. Position an employee's face within the circular frame
4. The system will automatically detect and match the face
5. Attendance will be marked automatically

#### For Employees:
1. Navigate to the Employee Dashboard
2. Click on the "Face Attendance" card
3. Position your face within the circular frame
4. The system will automatically detect and match your face
5. Attendance will be marked automatically

## Technical Details

### Models Used

The system uses the following face-api.js models:
- **SSD MobileNet V1** - For face detection
- **Face Landmark 68 Net** - For facial landmark detection
- **Face Recognition Net** - For face embedding generation

### Model Files

All required model files are located in the `frontend/public/models` directory:
- `ssd_mobilenetv1_model-shard1`
- `ssd_mobilenetv1_model-shard2`
- `face_landmark_68_model-shard1`
- `face_recognition_model-shard1`
- `face_recognition_model-shard2`
- And other supporting model files

### Face Data Storage

Face embeddings are stored in the Worker model in the database:
- Field name: `faceEmbeddings`
- Type: Array of arrays of numbers
- Each face capture generates 128-dimensional embeddings

### Components

1. **FaceCapture.jsx** - Component for capturing face data
2. **FaceAttendance.jsx** - Component for face recognition and attendance marking
3. **FaceAttendancePage.jsx** - Page component for both admin and employee interfaces

### Services

1. **faceRecognitionService.js** - Handles face recognition API calls
2. **attendanceService.js** - Extended to include face recognition functions
3. **workerService.js** - Updated to handle face embeddings

## Troubleshooting

### Model Loading Issues

If you encounter model loading errors:
1. Clear your browser cache
2. Ensure all model files are present in `frontend/public/models`
3. Restart the development server

### Face Not Detected

If faces are not being detected:
1. Ensure good lighting conditions
2. Position face clearly within the circular frame
3. Remove sunglasses or face coverings
4. Ensure the camera is working properly

### Attendance Not Marking

If attendance is not being marked:
1. Verify that face data has been captured for the employee
2. Check that the employee has a valid RFID
3. Ensure location settings (if enabled) are correct

## Testing

A test component is available at `/admin/face-test` to verify that face detection is working correctly.