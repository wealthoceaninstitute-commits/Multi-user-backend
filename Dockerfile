# Correct Playwright image (includes Chromium, Firefox, WebKit)
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

# Copy requirements
COPY requirements.txt .

RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Copy backend source
COPY . .

# Expose port
EXPOSE 8080

CMD ["python", "src/MultiBroker_Router.py"]
