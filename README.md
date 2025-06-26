![McElroy Radio Banner](static/img/default-cover.png)

## About

McElroy Radio is a fun personal project that creates an internet radio-style experience for fans of the McElroy family's podcasts. The application continuously plays episodes by parsing RSS feeds and directing users to stream directly from the original sources, ensuring proper download tracking for the creators.

Key features:
- 24/7 streaming experience using RSS feeds
- Continuous playback with radio-style synchronization
- Recently played history
- Random McElroy fun facts
- Direct streaming from RSS sources (respects creator analytics)
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

1. Configure RSS feeds by setting the `RSS_FEEDS` environment variable in `docker-compose.yml`.

2. Run the startup script:
   ```
   chmod +x startup.sh
   ./startup.sh
   ```

3. To see logs:
   ```
   ./startup.sh --logs
   ```

### RSS Feed Configuration

The application now streams directly from RSS feeds instead of hosting files locally. Configure your RSS feeds using the `RSS_FEEDS` environment variable:

```bash
export RSS_FEEDS="My Brother My Brother and Me:https://feeds.simplecast.com/wjQvV_54,The Adventure Zone:https://feeds.simplecast.com/cYQVV__c,Sawbones:https://feeds.simplecast.com/y1N13_qC"
```

This approach ensures:
- Download tracking works properly for creators
- No local storage of copyrighted content
- Real-time access to new episodes
- Reduced server bandwidth requirements

## Configuration

You can configure the application through environment variables:

- `PORT`: The port to listen on (default: `8080`)
- `RSS_FEEDS`: Comma-separated list of RSS feeds in format "ShowName:URL" (e.g., "MBMBAM:https://feeds.simplecast.com/wjQvV_54,TAZ:https://feeds.simplecast.com/cYQVV__c")

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
