# LLProxy

LLProxy is a flexible proxy server for Large Language Models (LLMs) that allows you to discover and interact with multiple LLM endpoints through a unified interface.

## Features

- Automatic discovery of LLM endpoints
- Unified API for multiple LLM models
- Support for both completions and chat completions
- Periodic model discovery updates
- Status page for active models
- SSH-based model discovery
- Support for API keys
- Model filtering

## Prerequisites

- Node.js (v20)
- npm (comes with Node.js)

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
     - `env_var`: The environment variable to search for in SSH-based discovery
     - `tags`: Optional tags to append to model names

  2. HTTP scan discovery:
     - `hostname`: The IP address or hostname of the endpoint
     - `port_start`: The starting port number for the scan range
     - `port_end`: The ending port number for the scan range
     - `tags`: Optional tags to append to model names

  3. Managed provider import:
     - `url`: The URL for the API endpoint of the managed provider
     - `apikey`: The API key for authentication with the managed provider
     - `filter`: An array of strings to filter model names
     - `tags`: Optional tags to append to model names

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

- Better support importing models from managed OpenAI providers

## License

This project is licensed under the MIT License.
