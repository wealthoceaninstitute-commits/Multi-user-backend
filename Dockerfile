# Official Playwright image that includes Chromium preinstalled
FROM mcr.microsoft.com/playwright/python:v1.49.0-focal

# Set work directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Copy all backend code
COPY . .

# Expose port
EXPOSE 8080

# Start your FastAPI app
CMD ["python", "src/MultiBroker_Router.py"]
