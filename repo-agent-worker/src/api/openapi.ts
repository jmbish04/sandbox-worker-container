export const getOpenAPISpec = () => ({
  openapi: '3.0.0',
  info: {
    title: 'Repo Agent Worker API',
    version: '1.0.0',
    description: 'Programmatic interface for invoking repo agent workflows and streaming results.',
  },
  servers: [
    {
      url: 'https://repo-agent-worker.example.com',
      description: 'Production',
    },
    {
      url: 'http://localhost:8787',
      description: 'Development',
    },
  ],
  paths: {
    '/api/invoke/{pathway}': {
      post: {
        summary: 'Invoke a repo agent pathway',
        description: 'Starts a background task inside the sandbox to run the requested pathway.',
        parameters: [
          {
            name: 'pathway',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: ['testing', 'standardize', 'reproduce-error', 'analyzer', 'custom'],
            },
            description: 'Identifier for the pathway to execute.',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InvokeRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Task started inside the sandbox.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/InvokeResponse' },
              },
            },
          },
          202: {
            description: 'Task accepted and queued.',
          },
          400: {
            description: 'Invalid request payload.',
          },
          502: {
            description: 'Failed to reach sandbox or upstream.',
          },
        },
      },
    },
    '/api/health': {
      get: {
        summary: 'Run worker health checks',
        description: 'Runs a series of checks against the worker bindings and sandbox runtime.',
        responses: {
          200: {
            description: 'Health check results',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },
    '/ws': {
      get: {
        summary: 'Connect to the real-time log stream',
        description: 'Upgrades the HTTP connection to a WebSocket for streaming task events.',
        responses: {
          101: {
            description: 'Switching protocols to WebSocket.',
          },
        },
      },
    },
  },
  components: {
    schemas: {
      InvokeRequest: {
        type: 'object',
        properties: {
          repo_url: { type: 'string', format: 'uri', description: 'Repository to operate on.' },
          prompt: {
            type: 'string',
            description: 'High-level instructions for the agent.',
          },
          branch: {
            type: 'string',
            description: 'Branch to check out inside the sandbox.',
          },
          test_mode: {
            type: 'string',
            enum: ['frontend', 'backend', 'both'],
            description: 'Which subset of tests to run.',
          },
          metadata: {
            type: 'object',
            additionalProperties: true,
            description: 'Optional metadata for custom routing.',
          },
        },
        required: ['repo_url'],
      },
      InvokeResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['started', 'queued'] },
          pathway: { type: 'string' },
          taskId: { type: 'string' },
          message: { type: 'string' },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded', 'error'] },
          checks: {
            type: 'object',
            properties: {
              sandbox: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  detail: { type: 'string' },
                },
              },
              bindings: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  properties: {
                    present: { type: 'boolean' },
                    note: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});
