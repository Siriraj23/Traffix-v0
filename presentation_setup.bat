@echo off
echo 🎬 Setting up Presentation Demo...
echo.

echo 1. Starting MongoDB...
start cmd /k "docker run -d -p 27017:27017 mongo"

echo 2. Starting Backend Server...
cd backend
start cmd /k "npm run dev"

echo 3. Starting Presentation Server...
start cmd /k "node presentation_server.js"

echo 4. Starting Frontend...
cd ../frontend
start cmd /k "npm start"

echo 5. Starting AI Server (Optional)...
cd ../ai_models
start cmd /k "python server.py"

echo.
echo ✅ Presentation setup complete!
echo 📍 Dashboard: http://localhost:3000/cctv
echo 📊 API: http://localhost:5000
echo 🎬 Presentation API: http://localhost:5002
echo 🤖 AI Server: http://localhost:5001
echo.
echo Press any key to open dashboard...
pause
start http://localhost:3000/cctv