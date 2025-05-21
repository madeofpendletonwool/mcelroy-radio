#!/bin/bash

echo "Starting McElroy Radio..."

# Check if Docker is installed
if ! [ -x "$(command -v docker)" ]; then
  echo "Error: Docker is not installed. Please install Docker first." >&2
  exit 1
fi

# Check if Docker Compose is installed
if ! [ -x "$(command -v docker-compose)" ]; then
  echo "Error: Docker Compose is not installed. Please install Docker Compose first." >&2
  exit 1
fi

# Build the Docker image
echo "Building the Docker image..."
docker-compose build

# Start the containers
echo "Starting the containers..."
docker-compose up -d

echo "McElroy Radio is now broadcasting at http://localhost:8080"
echo "Enjoy the endless goofs and laughs!"

# Show logs if requested
if [ "$1" == "--logs" ]; then
  echo "Showing logs (press Ctrl+C to exit logs, the service will continue running)..."
  docker-compose logs -f
fi
