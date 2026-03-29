import sys
import os

# Add parent directory to path so we can import main.py
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app

# Vercel expects the FastAPI app to be named 'app' or 'handler'
handler = app
