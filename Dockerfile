FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    chromium chromium-driver \
    fonts-liberation \
    libcurl4 \
    libgconf-2-4 \
    libxi6 \
    libxss1 \
    libappindicator3-1 \
    libnspr4 \
    libnss3 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "CT_FastAPI:app", "--host", "0.0.0.0", "--port", "8080"]
