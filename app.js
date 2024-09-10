const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Function to load configuration
function loadConfig() {
  try {
    const configData = fs.readFileSync('config.json', 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Error loading config:', error);
    return null;
  }
}

// Load initial configuration
let config = loadConfig();

// Watch for changes in the config file
fs.watch('config.json', (eventType, filename) => {
  if (eventType === 'change') {
    console.log('Config file changed. Reloading...');
    new_config = loadConfig();
    if (new_config !== null) {
      config = new_config;
      console.log('Config reloaded successfully.');
    } else {
      console.error('Config reload failed!')
    }
  }
});

// Data structures
let activeModels = [];
let isDiscoveryInProgress = false;

// SSH Model discovery function
async function discoverSSH(endpoint) {
  const { hostname, ssh_username, env_var } = endpoint;

  const sshCommand = `ssh ${ssh_username}@${hostname} '
    ps ux | tail -n +2 | awk "{print \\$2}" | while read pid; do
        value=$(grep -z "^${env_var}=" 2>/dev/null </proc/$pid/environ)
        if [[ ! -z "$value" ]]; then
            value_content=$(echo "$value" | cut -d= -f2-)
            echo "$pid,$value_content"
        fi
    done'`;

  try {
    const { stdout, stderr } = await execPromise(sshCommand);
    let results = [];
    let processedPorts = new Set();

    for (result of stdout.trim().split('\n').filter(line => line.length > 0)) {
      const [pid, port] = result.split(',');
      if (!processedPorts.has(port)) {
        console.log('SSH discovery found', result, 'on', hostname)
        const url = `http://${hostname}:${port}/v1`;
        models = await discoverHTTP({ ...endpoint, url });
        if (models.length > 0) { results = results.concat(models); }
        processedPorts.add(port);
      }
    }

    return results;
      
  } catch (error) {
    console.log(`SSH discovery on ${hostname} failed:`, error.message);
    return [];
  }
}

async function discoverHTTP(endpoint) {
  const { url, tags = [], apikey = null, filter = [], models = [] } = endpoint;
  let newActiveModels = [];

  if (models.length > 0) {
    // Use the provided models array directly
    for (const model of models) {
      const name = model.split('/').pop().replace('.gguf', '');
      const finalNames = tags.length > 0 ? tags.map(tag => `${name}:${tag}`) : [name];

      finalNames.forEach(finalName => {
        if (filter === null || filter.length === 0 || filter.some(f => finalName.includes(f))) {
          console.log('Using provided model', name, 'for', url);
          newActiveModels.push({
            name: finalName,
            url: url,
            id: model,
            apikey: apikey,
            ...model
          });
        }
      });
    }
  } else {
    // Fetch models from the API if no models array is provided
    try {
      const headers = apikey ? { Authorization: `Bearer ${apikey}` } : {};
      const response = await axios.get(`${url}/models`, { headers });
      let fetchedModels = response.data.data ? response.data.data : response.data;

      if (fetchedModels[0].owned_by == "tabbyAPI") {
        // tabbyAPI returns all possible models instead of the loaded one
        const response2 = await axios.get(`${url}/model`, { headers });
        fetchedModels = [response2.data];
      }

      for (let model of fetchedModels) {
        // azure models list has useless ids
        if (model.id.startsWith('azureml://')) { 
          model.id = model.name;
        }
        let name = model.id.split('/').pop().replace('.gguf', '').replace(' ','-');
        const finalNames = tags.length > 0 ? tags.map(tag => `${name}:${tag}`) : [name];

        finalNames.forEach(finalName => {
          if (filter === null || filter.length === 0 || filter.some(f => finalName.includes(f))) {
            console.log('HTTP discovery found', name, 'at', url);
            newActiveModels.push({
              name: finalName,
              url: url,
              id: model.id,
              apikey: apikey,
              ...model
            });
          }
        });
      }
    } catch (error) {
      console.log(`No model found at ${url}: ${error}`);
    }
  }

  return newActiveModels;
}

// Function to resolve model ID collisions
function resolveModelIdCollisions(models) {
  const idCounts = {};
  const renamedModels = [];

  models.forEach(model => {
    if (idCounts[model.name]) {
      // Rename the original model if it hasn't been renamed yet
      if (idCounts[model.name] === 1) {
        const originalModel = renamedModels.find(m => m.name === model.name);
        originalModel.name = `${originalModel.name}:0`;
      }
      idCounts[model.name]++;
      model.name = `${model.name}:${idCounts[model.name] - 1}`;
    } else {
      idCounts[model.name] = 1;
    }
    renamedModels.push(model);
  });

  return renamedModels;
}

// HTTP Model discovery function
async function discoverModels() {
  if (isDiscoveryInProgress) {
    console.log('Model discovery already in progress. Skipping.');
    return;
  }

  isDiscoveryInProgress = true;
  console.log('Starting model discovery...');

  try {
    const discoveryPromises = config.endpoints.map(async (endpoint) => {
      if (endpoint.enable === false) return [];
      
      if (endpoint.url) {
        return discoverHTTP(endpoint);
      } else if (endpoint.port_start && endpoint.port_end) {
        const portPromises = [];
        for (let port = endpoint.port_start; port <= endpoint.port_end; port++) {
          const url = `http://${endpoint.hostname}:${port}`;
          portPromises.push(discoverHTTP({ ...endpoint, url }));
        }
        return (await Promise.all(portPromises)).flat();
      } else if (endpoint.env_var) {
        return discoverSSH(endpoint);
      }
      
      return [];
    });

    const allDiscoveredModels = await Promise.all(discoveryPromises);
    const flattenedModels = allDiscoveredModels.flat();
    activeModels = resolveModelIdCollisions(flattenedModels);
    console.log(`Model discovery complete. Found ${activeModels.length} models.`);
  } catch (error) {
    console.error('Error during model discovery:', error);
  } finally {
    isDiscoveryInProgress = false;
  }
}

// Run model discovery every 30 seconds
setInterval(() => {
  discoverModels().catch(error => console.error('Scheduled model discovery failed:', error));
}, config.interval);

// Models endpoint
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: activeModels.map(model => ({
      id: model.name,
      object: model.object,
      created: model.created,
      owned_by: model.owned_by,
      meta: model.meta
    }))
  });
});



// Proxy function for completions endpoints
async function proxyCompletionRequest(req, res, endpoint) {
  const modelName = req.body.model;
  const model = activeModels.find(m => m.name === modelName);

  if (!model) {
    return res.status(404).json({ error: 'Model not found' });
  }

  const proxyReq = {
    ...req.body,
    model: model.id
  };

  try {
    const headers = {};
    if (model.apikey) {
      headers['Authorization'] = `Bearer ${model.apikey}`;
    }
    const proxyUrl = `${model.url}/${endpoint}`

    console.log('PROXY to', proxyUrl,'request body', proxyReq)

    const response = await axios({
      method: 'post',
      url: proxyUrl,
      data: proxyReq,
      headers: headers,
      responseType: 'stream'
    });

    // Set the content type based on the response
    const contentType = response.headers['content-type'];
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // Pipe the response data
    response.data.pipe(res);

    // Handle any errors that occur while piping
    response.data.on('error', (err) => {
      console.error('Error while piping response:', err);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Error while streaming response',
          streamError: err.message
        });
      }
    });

  } catch (error) {
    console.error('Error proxying request:', error.message);
    if (error.response) {
      // If the error has a response, set the status and content type
      res.status(error.response.status);
      const contentType = error.response.headers['content-type'];
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      error.response.data.pipe(res);
    } else {
      // If there's no response, send a generic 500 error
      res.status(500).json({
        error: 'Error proxying request',
        proxyError: error.message
      });
    }
  }
}

// Completions endpoint
app.post('/v1/completions', (req, res) => {
  proxyCompletionRequest(req, res, 'completions');
});

// Chat completions endpoint
app.post('/v1/chat/completions', (req, res) => {
  proxyCompletionRequest(req, res, 'chat/completions');
});

// Status endpoint
app.get('/status', async (req, res) => {
  await discoverModels();
  res.render('status', {
    activeModels: activeModels,
    lastUpdated: new Date().toLocaleString()
  });
});

// Start the server
app.listen(config.port, () => {
  console.log(`LLProxy listening on port ${config.port}`);
  discoverModels(); // Initial model discovery
});
