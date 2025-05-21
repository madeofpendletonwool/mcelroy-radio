FROM golang:alpine AS builder

# Set working directory
WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o mcelroy-radio ./cmd/server

# Use a smaller image for the final stage
FROM alpine:latest

# Add necessary system tools
RUN apk --no-cache add ca-certificates

# Set working directory
WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/mcelroy-radio .

# Copy templates and static files
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/static ./static

# Create content directories
RUN mkdir -p /opt/mcelroy-content/show1 \
    /opt/mcelroy-content/show2 \
    /opt/mcelroy-content/show3

# Expose port
EXPOSE 8080

# Command to run
CMD ["./mcelroy-radio"]
