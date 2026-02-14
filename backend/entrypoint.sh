#!/bin/sh
# Entrypoint script for the backend server

# Default to port 8000 if PORT is not set
PORT=${PORT:-8000}

# Start the application
exec python -m uvicorn server:app --host 0.0.0.0 --port "$PORT"
