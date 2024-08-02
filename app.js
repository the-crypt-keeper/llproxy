const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Load configuration
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// Data structures
let activeModels = [];
let isDiscoveryInProgress = false;

// Model discovery function
async function discoverModels() {
  if (isDiscoveryInProgress) {
    console.log('Model discovery already in progress. Skipping.');
    return;
  }

  isDiscoveryInProgress = true;
  console.log('Starting model discovery...');
  const newActiveModels = [];

  try {
    for (const endpoint of config.endpoints) {
    for (let port = endpoint.port_start; port <= endpoint.port_end; port++) {
      try {
        const response = await axios.get(`http://${endpoint.hostname}:${port}/v1/models`);
        const models = response.data.data;

        for (const model of models) {
          const name = model.id.split('/').pop().replace(/\.[^/.]+$/, '');
          const tags = endpoint.tags || [];
          const finalNames = tags.length > 0 ? tags.map(tag => `${name}:${tag}`) : [name];

          finalNames.forEach(finalName => {
            newActiveModels.push({
              name: finalName,
              host: endpoint.hostname,
              port: port,
              id: model.id,
              ...model
            });
          });
        }
      } catch (error) {
        console.log(`No model found at ${endpoint.hostname}:${port}`);
      }
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
cron.schedule('*/30 * * * * *', () => {
  discoverModels().catch(error => console.error('Scheduled model discovery failed:', error));
});

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

// Generate HTML table for status page
function generateStatusTable() {
  let tableHtml = `
    <table border="1">
      <tr>
        <th>Name</th>
        <th>Host</th>
        <th>Port</th>
        <th>ID</th>
      </tr>
  `;

  activeModels.forEach(model => {
    tableHtml += `
      <tr>
        <td>${model.name}</td>
        <td>${model.host}</td>
        <td>${model.port}</td>
        <td>${model.id}</td>
      </tr>
    `;
  });

  tableHtml += '</table>';
  return tableHtml;
}

// Status endpoint
app.get('/status', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>LLProxy Status</title>
      <meta http-equiv="refresh" content="30">
      <style>
        table {
          border-collapse: collapse;
          width: 100%;
        }
        th, td {
          border: 1px solid black;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #f2f2f2;
        }
      </style>
    </head>
    <body>
      <h1>LLProxy Status</h1>
      <p>Last updated: ${new Date().toLocaleString()}</p>
      ${generateStatusTable()}
    </body>
    </html>
  `;
  res.send(html);
});

// Start the server
app.listen(config.port, () => {
  console.log(`LLProxy listening on port ${config.port}`);
  discoverModels(); // Initial model discovery
});
