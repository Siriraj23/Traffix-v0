@echo off
echo Installing Traffic Violation AI System...

REM Create virtual environment
python -m venv venv

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Upgrade pip
python -m pip install --upgrade pip

REM Install requirements
pip install -r requirements.txt

echo ✅ Installation complete!
echo To activate virtual environment: venv\Scripts\activate.bat
echo To test: python test_yolov8.py