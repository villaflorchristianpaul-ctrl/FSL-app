# SignBridge App

This is the Expo mobile app for SignBridge.

For moving the project to another PC, read:

```text
..\SETUP_ON_NEW_PC.md
```

That file includes backend setup, model placement, `.env`, and phone deployment
steps.

## Quick Start

Install dependencies:

```bash
npm install
```

Start the development client server:

```bash
npx expo start --dev-client -c
```

If this is the first time installing the app on the phone:

```bash
npx expo run:android --device
```

## Environment

Copy `.env.example` to `.env`, then set:

```text
EXPO_PUBLIC_API_URL=auto
```

If auto-detection does not work on a physical phone, use the PC's Wi-Fi IPv4
address instead:

```text
EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:8000
```
