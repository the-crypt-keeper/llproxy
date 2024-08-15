# LLProxy

LLProxy is a flexible, auto-discovering proxy server for Large Language Models (LLMs).

## Features

- Automatic discovery of LLM models and endpoints
  - HTTP port scan (finds local API endpoints)
  - SSH scan (finds processes with a PORT env var set)
  - HTTPS managed endpoint scan (supports API keys)
- Unified completions and chat completions API for multiple LLM models
  - Clients dont need to worry about keys or where the model is hosted
- Periodic model discovery updates
- Status page for active models
- Model filtering (only import some models into the proxy)
- Hot-reloading of configuration

## Prerequisites

- Node.js (v20)

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/the-crypt-keeper/llproxy.git
   cd llproxy
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure the `config.json` file with your LLM endpoints.

## Configuration

Edit the `config.json` file to set up your LLM endpoints:

```json
{
  "port": 3333,
  "interval": 30000,
  "endpoints": [
    {
      "hostname": "supremacy",
      "ssh_username": "mike",
      "env_var": "PORT",
      "tags": []
    },
    {
      "hostname": "100.106.238.128",
      "port_start": 8080,
      "port_end": 8090,
      "tags": []
    },
    {
      "url": "https://api.groq.com/openai",
      "tags": [],
      "filter": ["llama3","gemma","mixtral"],
      "apikey": "your_api_key_here"
    }
  ]
}
```

- `port`: The port on which LLProxy will run
- `interval`: The interval (in milliseconds) for periodic model discovery
- `endpoints`: An array of LLM endpoints to discover. There are three types of endpoint configurations:

  1. SSH-based discovery:
     - `hostname`: The hostname for SSH connection
     - `ssh_username`: The SSH username for authentication
     - `env_var`: The environment variable to search for a port number in SSH-based discovery

  2. HTTP scan discovery:
     - `hostname`: The IP address or hostname of the endpoint
     - `port_start`: The starting port number for the scan range
     - `port_end`: The ending port number for the scan range

  3. Managed provider import:
     - `url`: The URL for the API endpoint of the managed provider
     - `apikey`: The API key for authentication with the managed provider
     - `filter`: An array of strings to filter model names
     - `models`: An explicit array of model IDs (skip the /v1/models discovery call)

  Common options:
  - `tags`: Optional tags to append to model names (applies to all types)

## Usage

1. Start the server:
   ```
   node app.js
   ```

2. The server will start on the configured port (default: 3333)

3. Access the API endpoints (returns JSON):
   - GET `/v1/models`: List all available models
   - POST `/v1/completions`: Get completions for a prompt
   - POST `/v1/chat/completions`: Get chat completions

4. Access monitoring endpoints (returns HTML):
   - GET `/status`: View the status page for active models

## API Examples

### List Models

```
GET http://localhost:3333/v1/models
```

### Get Completions

```
POST http://localhost:3333/v1/completions
Content-Type: application/json

{
  "model": "model_name",
  "prompt": "Once upon a time",
  "max_tokens": 50
}
```

### Get Chat Completions

```
POST http://localhost:3333/v1/chat/completions
Content-Type: application/json

{
  "model": "model_name",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Tell me a joke."}
  ]
}
```

## TODO

This project is functionally complete, no further features are planned.

## License

This project is licensed under the MIT License.
