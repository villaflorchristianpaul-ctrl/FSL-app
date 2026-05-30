# SignBridge Setup On A New PC

Use this file when copying the project to another computer.

## 1. Install required tools

- Node.js 20.19.4 or newer
- Python 3.11
- Android Studio with Android SDK
- Java from Android Studio JBR, usually:
  `C:\Program Files\Android\Android Studio\jbr`

## 2. Copy the project

Copy the project folder, but do not rely on copied dependency folders.

Do not copy or reuse these from another PC:

- `backend\venv`
- `SignBridgeApp\node_modules`
- `.expo`
- old build/cache folders

They are machine-specific and should be recreated.

## 3. Check the model file

The backend will automatically look for `signbridge_model_v2.h5` in these places:

- `backend\models`
- `backend\signbridge-plus`
- `..\signbridge-plus`
- `..\..\signbridge-plus`

Your current layout uses:

```text
fsl_app\
  signbridge-plus\
    signbridge_model_v2.h5
  fsl_app\
    backend\
    SignBridgeApp\
```

If the model is somewhere else, create `backend\.env` from `backend\.env.example`
and set:

```text
SIGNBRIDGE_MODEL_DIR=C:\path\to\signbridge-plus
```

## 4. Install backend dependencies

Open PowerShell:

```powershell
cd C:\path\to\fsl_app\fsl_app\backend
py -3.11 -m venv venv
.\venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

Run the backend:

```powershell
.\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```

## 5. Install app dependencies

Open another PowerShell terminal:

```powershell
cd C:\path\to\fsl_app\fsl_app\SignBridgeApp
npm install
```

Create `.env` from `.env.example`.

The default value is:

```text
EXPO_PUBLIC_API_URL=auto
```

This tries to use the same host as the Expo development server and port `8000`
for the backend.

If `auto` does not work on the new PC, set the PC's Wi-Fi IPv4 address:

```text
EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:8000
```

Find the PC IPv4 address with:

```powershell
ipconfig
```

Use the IPv4 address from the active Wi-Fi adapter.

## 6. Run the app

If the phone already has the development build installed:

```powershell
npx expo start --dev-client -c
```

If this is the first time on that phone or PC:

```powershell
npx expo run:android --device
```

After the build installs, use:

```powershell
npx expo start --dev-client -c
```

## 7. Common fixes

If the backend says the model is missing, check `SIGNBRIDGE_MODEL_DIR` or put
`signbridge_model_v2.h5` into `backend\models`.

If the phone says it cannot connect to the server, check that:

- backend is running on `0.0.0.0:8000`
- phone and PC are on the same Wi-Fi
- `EXPO_PUBLIC_API_URL=auto`, or it uses the PC's IPv4 address, not `localhost`
- Windows Firewall allows Python on private networks

If Python points to an old user path, delete the broken `backend\venv` folder
and recreate it with Python 3.11.
