# Glide - React Native Mobile App

## ⚠️ DUAL FRONTEND ARCHITECTURE

This repository contains **TWO separate frontend applications**:

1. **React Native/Expo** (this directory) - Cross-platform mobile app (iOS/Android)
2. **Native iOS Swift** (`Glide/Glide/`) - Native SwiftUI app (iOS only)

**Both frontends connect to the same backend**: `glide-backend/` (FastAPI Python server)

### Important: Which Frontend to Work On?

- **React Native/Expo features** → Work in the **root directory** (where you are now)
- **Swift/SwiftUI features** → Work in **`Glide/Glide/`** directory
- **Backend API** → Work in **`glide-backend/`** directory

See `Glide/Glide/README.md` for the native iOS Swift app documentation.

---

## About This App (React Native/Expo)

A React Native mobile application built with Expo.

## Development Setup

### Prerequisites

- Node.js 18+ installed
- iOS Simulator (Mac) or Android Emulator
- Backend API server running (see `../glide-backend/README.md`)

### Installation

1. Install dependencies

   ```bash
   npm install
   ```

2. Configure environment variables

   Copy `.env.example` to `.env.local` and configure:

   ```bash
   cp .env.example .env.local
   ```

   Key environment variables:
   - `EXPO_PUBLIC_API_PORT`: Backend API port (default: 8000)
   - `EXPO_PUBLIC_DEV_AUTO_LOGIN`: Auto-login with test credentials (true/false)
   - `EXPO_PUBLIC_DEV_TEST_EMAIL`: Test user email for auto-login
   - `EXPO_PUBLIC_DEV_TEST_PASSWORD`: Test user password for auto-login

3. Start the backend server

   ```bash
   cd ../glide-backend
   source .venv/bin/activate  # or venv/bin/activate
   uvicorn app.main:app --reload --port 8000
   ```

4. Start the Expo app

   ```bash
   npx expo start
   ```

   Press `i` for iOS Simulator or `a` for Android Emulator

## Development Mode (Auto-Login)

By default, `EXPO_PUBLIC_DEV_AUTO_LOGIN=true` is enabled to skip the login screen during development. The app will automatically log in with the test user credentials.

**To test real authentication**, set in `.env.local`:
```
EXPO_PUBLIC_DEV_AUTO_LOGIN=false
```

Then restart the app. You'll see the login screen and can test:
- Login with valid/invalid credentials
- Registration flow
- Apple Sign-In (on iOS devices)

## Testing

### Backend Test User

Ensure the test user exists in the database:
- Email: `devtest@glide.app`
- Password: `test123` (or whatever you set in `EXPO_PUBLIC_DEV_TEST_PASSWORD`)

If the user doesn't exist, register through the app or create via API:
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"devtest@glide.app","password":"test123","full_name":"Dev Test"}'
```

### Error Handling Testing

The app uses a standardized error response format. Test error messages display correctly by:
1. Disabling auto-login (`EXPO_PUBLIC_DEV_AUTO_LOGIN=false`)
2. Attempting to login with invalid credentials
3. Verifying the error message is clear and user-friendly

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
