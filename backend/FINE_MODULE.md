# Fine Module Documentation

## Overview
The fine module allows administrators to deduct amounts from employee salaries for various reasons such as late coming, misconduct, or other policy violations.

## Features
1. Add fines to employee salaries
2. Automatically deduct fine amounts from employee's final salary
3. Track fine history with date and reason
4. Remove fines if needed (with automatic salary adjustment)

## API Endpoints

### Add Fine
**POST** `/api/fines/add-fine/:workerId`
- Adds a fine to a worker's record and deducts the amount from their salary
- Request Body:
  ```json
  {
    "amount": 100,
    "date": "2023-10-10",
    "reason": "Late coming"
  }
  ```

### Remove Fine
**POST** `/api/fines/remove-fine/:workerId/:fineId`
- Removes a fine from a worker's record and adds the amount back to their salary

### Get Worker Fines
**GET** `/api/fines/worker-fines/:workerId`
- Retrieves all fines for a specific worker

## Frontend Integration

### Salary Management Page
1. A "Fine" button has been added next to the "Reset Salary" button
2. Clicking the "Fine" button opens a modal with:
   - Employee search functionality
   - Employee selection
   - Fine amount input
   - Date selection
   - Reason text area
3. After submitting, the fine is added to the employee's record and their salary is automatically adjusted

## Database Schema

### Worker Model Updates
The Worker model now includes a `fines` array with the following structure:
```javascript
fines: [{
  amount: Number,
  date: Date,
  reason: String,
  createdAt: Date
}]
```

## Implementation Details

### Backend
- New controller: `fineController.js`
- New routes: `fineRoutes.js`
- Updated Worker model with fines array
- Automatic salary adjustment when adding/removing fines

### Frontend
- New service: `fineService.js`
- Updated `SalaryManagement.jsx` component with fine modal
- Added "Fine" button to salary management page

## Usage Instructions

1. Navigate to the Salary Management page
2. Click the "Fine" button
3. Search and select an employee
4. Enter the fine amount, date, and reason
5. Click "Add Fine"
6. The employee's salary will be automatically adjusted

## Error Handling
- Validation for fine amount (must be a positive number)
- Validation for date (required)
- Validation for reason (required and non-empty)
- Proper error messages for all failure cases