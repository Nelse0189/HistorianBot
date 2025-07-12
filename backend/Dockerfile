# Use an official lightweight Python image
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install dependencies. Using --no-cache-dir keeps the image size smaller.
RUN pip install --no-cache-dir -r requirements.txt

# Copy your application code into the container
COPY . .

# Command to run your app using a production-ready server (Gunicorn)
# Cloud Run automatically sets the PORT environment variable, which Gunicorn respects.
# The default port is 8080.
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "main:app"] 