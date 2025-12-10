##############################################
# 1) PYTHON BASE + SYSTEM LIBS FOR PLAYWRIGHT
##############################################
FROM python:3.12-slim AS python_env

# System dependencies needed by Playwright Chromium
RUN apt-get update && apt-get install -y \
    wget gnupg curl \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libasound2 libxshmfence1 libgtk-3-0 libfontconfig1 \
    libx11-xcb1 libxcb-dri3-0 libxinerama1 libxtst6 libu2f-udev \
    fonts-liberation \
    && apt-get clean

WORKDIR /app

# Install backend dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Chromium for Playwright
RUN python3 -m playwright install --with-deps chromium


##############################################
# 2) BUILD NEXT.JS FRONTEND
##############################################
FROM node:18 AS frontend_builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build


##############################################
# 3) FINAL RUNTIME IMAGE
##############################################
FROM python_env

WORKDIR /app

# Copy backend source
COPY ./src ./src
COPY MultiBroker_Router.py .
COPY Broker_dhan.py .
COPY Broker_motilal.py .
COPY MOFSLOPENAPI.py .

# Copy built frontend
COPY --from=frontend_builder /app/.next ./.next
COPY --from=frontend_builder /app/public ./public
COPY --from=frontend_builder /app/node_modules ./node_modules
COPY --from=frontend_builder /app/package.json ./package.json

# Expose FastAPI port
EXPOSE 8000

# Run backend server
CMD ["python3", "-m", "uvicorn", "MultiBroker_Router:app", "--host", "0.0.0.0", "--port", "8000"]
