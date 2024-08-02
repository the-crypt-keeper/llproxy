# LLProxy

LLProxy is a flexible proxy server for Large Language Models (LLMs) that allows you to discover and interact with multiple LLM endpoints through a unified interface.

## Features

- Automatic discovery of LLM endpoints
- Unified API for multiple LLM models
- Support for both completions and chat completions
- Periodic model discovery updates
- Status page for active models

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
  "endpoints": [
    {
      "hostname": "100.106.238.128",
      "port_start": 8080,
      "port_end": 8090,
      "tags": []
    },
    {
      "hostname": "100.109.96.89",
      "port_start": 8080,
      "port_end": 8090,
      "tags": []
    }
  ]
}
```

- `port`: The port on which LLProxy will run
- `endpoints`: An array of LLM endpoints to discover
  - `hostname`: The IP address or hostname of the endpoint
  - `port_start` and `port_end`: The range of ports to scan for models
  - `tags`: Optional tags to append to model names

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

- Support endpoints with API keys
- Better support importing models from managed OpenAI providers

## License

This project is licensed under the MIT License.
