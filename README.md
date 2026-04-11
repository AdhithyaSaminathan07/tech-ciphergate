# CipherGate - Facial Recognition Security System

## Overview
CipherGate is a comprehensive security system that uses facial recognition technology to provide secure access control.

## Prerequisites
- Node.js (v14 or higher)
- MongoDB Atlas account (for database)
- npm or yarn

## Setup Instructions

### 1. Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Environment Variables

The application requires several environment variables to be set. Check the `.env` files in both frontend and backend directories.

#### Backend (.env)
- `MONGO_URI`: MongoDB connection string
- `JWT_SECRET`: Secret for JWT token generation
- `PORT`: Server port (default: 5000)

### 3. Running the Application

#### Option 1: Using Batch Files (Windows)
Double-click on the following batch files:
- `backend/start.bat` - Starts the backend server
- `frontend/start.bat` - Starts the frontend development server
- `start-all.bat` - Starts both servers simultaneously

#### Option 2: Using Terminal/Command Line
```bash
# Start backend
cd backend
npm start

# Start frontend (in a separate terminal)
cd frontend
npm run dev
```

### 4. Accessing the Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Project Structure
- `/backend` - Express.js API server
- `/frontend` - React/Vite frontend application

## Features
- Facial recognition authentication
- Secure access control
- Real-time monitoring
- Admin dashboard
- Employee management