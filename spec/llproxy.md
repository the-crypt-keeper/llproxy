Let's create a new NodeJS project called LLProxy.

The goal of this project will be a self-configuring proxy that discovers large language model servers and route requests to them in a fleixble way.

# Configuration

A json configuration file will be provided in the following format:

{
    'port': <proxy listen port>
    'endpoints': [
        {
            'hostname': <endpoint hostname or IP>
            'port_start': <first port a server may be listening on>
            'port_end': <last port a serer may be listening on (inlusive)>
            'tags': [<optional list of tags to apply to models from this endpoint>]
        },
        ...
    ]
}

## Data Structures

- Configuration
- Active list of models

## Endpoints

All endpoints start in /v1 to be compliant with open-ai API specification.

The /v1/models endpoint will be special and handled by the proxy itself.

The /v1/completions and /v1/chat/completions endpoints will use the 'model' field of the request body to route the request (more on that later)

## Model Discovery

Every 30 seconds, the following process should run in a background task and rebuild the active list of models:

- Iterate through all endpoints
- Try to make a call to all ports in the range [port_start, port_end] on the /v1/models endpoint
- The /v1/models endpoint, if successfull, returns a payload like this:

```
{"object":"list","data":[{"id":"./Meta-Llama-3.1-70B-Instruct-IQ3_XS.gguf","object":"model","created":1722606296,"owned_by":"llamacpp","meta":{"vocab_type":2,"n_vocab":128256,"n_ctx_train":131072,"n_embd":8192,"n_params":70553711616,"size":29299888128}}]}
```

- The 'id' key of the data list is the most important piece of information returned, you will need this value to route the request
- We also need a cleaned-up version of this field for the user to make requests, lets call that 'name' and strip any file paths and extensions from 'id'
- Finally, apply the `tags` from this endpoint to create the final model names in the form `name:tag`
- Save model details, host, port, id and final model names to the active model list

Emit appropriate debug information as the process runs and a summary when it is complete.

## Model Endpoint

The /v1/models endpoint should return the current active list of models. Our 'id' is the `name:tag` final model name from above, but pass through all other model information from the endpoint itself. 

## Completions endpoints

/v1/completions and /v1/chat/completions proxies should look at 'model' which will be the `name:tag` and use it to look-up in the active list of models the real endpoint and model id.

It should overwrite the 'model' with the true model id and then proxy the request to the backend endpoint.

Note that HTTP response streaming is supported on both of these endpoints, so the proxy should be non-blocking and asyncronous.