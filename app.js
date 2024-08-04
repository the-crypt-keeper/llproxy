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

// Load configuration
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// Data structures
let activeModels = [];
let isDiscoveryInProgress = false;

// SSH Model discovery function
async function discoverSSH(hostname, ssh_username, env_var) {

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

    for (result of stdout.trim().split('\n').filter(line => line.length > 0)) {
      console.log('SSH discovery found',result,'on',hostname)
      models = await discoverHTTP(hostname, result.split(',')[1], []);
      if (models.length > 0) { results = results.concat(models); }
    }

    return results;
      
  } catch (error) {
    console.log(`SSH discovery on ${hostname} failed:`, error.message);
    return [];
  }
}

async function discoverHTTP(hostname, port, tags = [], apikey = null) {
  let newActiveModels = [];
  try {
    const headers = apikey ? { Authorization: `Bearer ${apikey}` } : {};
    const response = await axios.get(`http://${hostname}:${port}/v1/models`, { headers });
    const models = response.data.data;

    for (const model of models) {
      const name = model.id.split('/').pop().replace(/\.[^/.]+$/, '');
      const finalNames = tags.length > 0 ? tags.map(tag => `${name}:${tag}`) : [name];

      finalNames.forEach(finalName => {
        console.log('HTTP discovery found',name,'on',hostname+':'+port)
        newActiveModels.push({
          name: finalName,
          host: hostname,
          port: port,
          id: model.id,
          ...model
        });
      });
    }
  } catch (error) {
    console.log(`No model found at ${hostname}:${port}`);
  }
  return newActiveModels;
}

// HTTP Model discovery function
async function discoverModels() {
  if (isDiscoveryInProgress) {
    console.log('Model discovery already in progress. Skipping.');
    return;
  }

  isDiscoveryInProgress = true;
  console.log('Starting model discovery...');
  let newActiveModels = [];

  try {
    for (const endpoint of config.endpoints) {
      if (endpoint.port) {
        newActiveModels = newActiveModels.concat(await discoverHTTP(endpoint.hostname, endpoint.port, endpoint.tags, endpoint.apikey));
      } else if (endpoint.port_start && endpoint.port_end) {
        for (let port = endpoint.port_start; port <= endpoint.port_end; port++) {
          newActiveModels = newActiveModels.concat(await discoverHTTP(endpoint.hostname, port, endpoint.tags, endpoint.apikey));
        }
      } else if (endpoint.env_var) {
        newActiveModels = newActiveModels.concat(await discoverSSH(endpoint.hostname, endpoint.ssh_username, endpoint.env_var));
      }
    }

    activeModels = newActiveModels;
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
    const response = await axios({
      method: 'post',
      url: `http://${model.host}:${model.port}/v1/${endpoint}`,
      data: proxyReq,
      responseType: 'stream'
    });

    response.data.pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'Error proxying request' });
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
