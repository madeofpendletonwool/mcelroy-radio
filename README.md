# McElroy Radio

A Go-powered internet radio station that streams McElroy family podcast content 24/7.

![McElroy Radio Banner](static/img/default-cover.png)

## About

McElroy Radio is a fun personal project that creates an internet radio-style experience for fans of the McElroy family's podcasts. The application continuously plays episodes from a collection of audio files, serving them as a radio stream to listeners.

Key features:
- 24/7 streaming of podcast episodes
- Continuous playback regardless of whether users are connected
- Recently played history
- Random McElroy fun facts
- Docker containerization for easy deployment

## Getting Started

### Prerequisites

- [Go](https://golang.org/dl/) 1.16+
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) (optional, for containerized deployment)

### Running Locally

1. Clone the repository:
   ```
   git clone https://github.com/madeofpendletonwool/mcelroy-radio.git
   cd mcelroy-radio
   ```

2. Install dependencies:
   ```
   go mod download
   ```

3. Build and run:
   ```
   go run cmd/server/main.go
   ```

4. Visit `http://localhost:8080` in your browser.

### Running with Docker

1. Update the volume paths in `docker-compose.yml` to point to your podcast collections.

2. Run the startup script:
   ```
   chmod +x startup.sh
   ./startup.sh
   ```

3. To see logs:
   ```
   ./startup.sh --logs
   ```

### Directory Structure for Audio Files

The application expects a specific directory structure for the audio files:

```
/opt/mcelroy-content/
  ├── show1/        # e.g., MBMBAM episodes
  │   ├── episode1.mp3
  │   ├── episode2.mp3
  │   └── ...
  ├── show2/        # e.g., The Adventure Zone episodes
  │   ├── episode1.mp3
  │   ├── episode2.mp3
  │   └── ...
  └── show3/        # e.g., Sawbones episodes
      ├── episode1.mp3
      ├── episode2.mp3
      └── ...
```

The directories are mounted in the Docker container, so you can update your collection without rebuilding the image.

## Configuration

You can configure the application through environment variables:

- `PORT`: The port to listen on (default: `8080`)
- `CONTENT_DIRS`: Comma-separated list of content directories (default: `/opt/mcelroy-content/show1,/opt/mcelroy-content/show2,/opt/mcelroy-content/show3`)

## Development

### Project Structure

The project follows a standard Go application layout:

- `/cmd/server`: Application entry point
- `/internal`: Private application code
  - `/config`: Configuration
  - `/handlers`: HTTP handlers
  - `/models`: Data models
  - `/player`: Radio player logic
  - `/server`: Server setup and routing
  - `/storage`: File discovery and management
- `/static`: Static assets (CSS, JS, images)
- `/templates`: HTML templates

### Adding Features

1. Fork the repository
2. Create a feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This is a fan project and is not affiliated with the McElroy family or their podcasts. All content played through this application should be legally obtained and used in accordance with copyright laws.
