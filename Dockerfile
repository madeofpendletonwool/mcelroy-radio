# Build stage
FROM golang:alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main cmd/server/main.go

# Runtime stage
FROM alpine:latest

# Install runtime dependencies including ffmpeg for metadata parsing
RUN apk update
RUN apk add --no-cache \
    ca-certificates \
    ffmpeg \
    wget \
    curl \
    tzdata

# Create app user
RUN addgroup -g 1001 app && \
    adduser -D -s /bin/sh -u 1001 -G app app

# Set working directory
WORKDIR /app

# Copy binary from builder stage
COPY --from=builder /app/main .

# Copy static files and templates
COPY --chown=app:app static/ ./static/
COPY --chown=app:app templates/ ./templates/

# Create content directories
RUN mkdir -p /opt/mcelroy-content/show1 \
    /opt/mcelroy-content/show2 \
    /opt/mcelroy-content/show3 && \
    chown -R app:app /opt/mcelroy-content

# Switch to app user
USER app

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --spider -q http://localhost:8080/ || exit 1

# Run the application
CMD ["./main"]
