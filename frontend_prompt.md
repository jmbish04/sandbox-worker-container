Here is a detailed prompt to build the `repo-agent-worker` as you've described.

-----

### Task: Build the `repo-agent-worker`

You are an expert Cloudflare Worker developer specializing in Hono, TypeScript, and modern frontend development. Your task is to build the `repo-agent-worker` project.

The primary requirements are:

1.  The repository root **is** the worker project.
2.  The worker exposes a WebSocket API for real-time streaming.
3.  The worker generates a dynamic `openapi.json` schema.
4.  The worker serves a complete SaaS-like frontend using Tailwind, Flowbite, and an `ASSETS` binding.

-----

### 1\. Project Structure (Repository Root)

First, ensure the project's file structure is flat. The `package.json`, `wrangler.jsonc`, and `src` directory must be at the root of the repository.

The final structure should look like this:

```
/
├── .vscode/
├── public/
│   ├── assets/
│   │   ├── app.js
│   │   ├── nav.js
│   │   └── styles.css
│   ├── features/
│   │   ├── testing.html
│   │   ├── standardize.html
│   │   └── reproduce-error.html
│   ├── health.html
│   ├── dashboard.html
│   ├── openapi.html
│   └── index.html
├── src/
│   ├── api/
│   │   ├── openapi.ts
│   │   └── routes.ts
│   ├── core/
│   │   ├── sandbox.ts
│   │   └── websocket.ts
│   └── index.ts
├── Dockerfile
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
└── wrangler.jsonc
```

-----

### 2\. Backend and API (`wrangler.jsonc` and `src/`)

**A. `wrangler.jsonc` Configuration**

Update `wrangler.jsonc` to include the `ASSETS` binding for the static frontend.

```jsonc
{
  "name": "repo-agent-worker",
  "main": "src/index.ts",
  "compatibility_date": "2025-02-11",
  "compatibility_flags": ["nodejs_compat"],
  // ... (Keep Sandbox DO/Container bindings) ...
  "containers": [
    {
      "class_name": "Sandbox",
      "image": "./Dockerfile"
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "class_name": "Sandbox",
        "name": "Sandbox"
      }
    ]
  },
  "migrations": [
    {
      "new_sqlite_classes": ["Sandbox"],
      "tag": "v1_sandbox_init"
    }
  ],
  // 1. Add the ASSETS binding
  "assets": {
    "binding": "ASSETS",
    "directory": "./public"
  },
  // ... (Keep other bindings: AI, secrets) ...
  "ai": { "binding": "AI" },
  "secrets": [
    "GITHUB_TOKEN",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY"
  ]
}
```

**B. Core Router (`src/index.ts`)**

Use **Hono** for routing. The router must:

1.  Serve the dynamically generated OpenAPI schema at `/openapi.json`.
2.  Handle the WebSocket upgrade at `/ws`.
3.  Serve the static frontend (from `ASSETS`) for all other `GET` requests.
4.  Handle API requests (e.g., `POST /api/invoke`) for the "well-lit pathways."
5.  Call `proxyToSandbox` to handle preview URLs for services running *inside* the container.

<!-- end list -->

```typescript
// src/index.ts
import { Hono } from 'hono';
import { serveStatic } from '@hono/clerk-auth'; // Use Hono's middleware
import { proxyToSandbox, getSandbox, type Sandbox } from '@cloudflare/sandbox';
import { handleWebSocket } from './core/websocket';
import { getOpenAPISpec } from './api/openapi';
import { apiRoutes } from './api/routes';

export { Sandbox }; // Required for Sandbox DO

const app = new Hono<{ Bindings: Env }>();

// 1. OpenAPI Specification
app.get('/openapi.json', (c) => {
  return c.json(getOpenAPISpec());
});

// 2. API Endpoints
app.route('/api', apiRoutes);

// 3. WebSocket Endpoint
app.get('/ws', async (c) => {
  return handleWebSocket(c.req.raw, c.env);
});

// 4. Static Frontend
app.get(
  '*',
  serveStatic({
    root: './',
    binding: 'ASSETS',
  })
);

// 5. Default/Catch-all: Proxy to Sandbox
// This handles preview URLs for services exposed *inside* the container
app.all('*', async (c) => {
  const sandbox = getSandbox(c.env.Sandbox, 'default-sandbox'); // Use a relevant ID
  return proxyToSandbox(c.req.raw, sandbox);
});

export default {
  fetch: app.fetch,
};
```

**C. Dynamic OpenAPI (`src/api/openapi.ts`)**

Create a file that defines the OpenAPI spec. This allows the frontend to dynamically build forms.

```typescript
// src/api/openapi.ts
export const getOpenAPISpec = () => ({
  openapi: '3.0.0',
  info: {
    title: 'Repo Agent Worker API',
    version: '1.0.0',
  },
  paths: {
    '/api/invoke/{pathway}': {
      post: {
        summary: 'Invoke a repo agent pathway',
        parameters: [/* ... */],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InvokeRequest' },
            },
          },
        },
        responses: { '200': { description: 'Task started' } },
      },
    },
    '/ws': {
      get: {
        summary: 'Connect to the real-time log stream',
        description: 'Upgrades connection to WebSocket.',
      },
    },
  },
  components: {
    schemas: {
      InvokeRequest: {
        type: 'object',
        properties: {
          // ... Define your request properties ...
          repo_url: { type: 'string' },
          prompt: { type: 'string' },
          test_mode: { type: 'string', enum: ['frontend', 'backend', 'both'] }
        },
      },
    },
  },
});
```

-----

### 3\. Frontend (`/public`)

Build a static frontend using **Tailwind CSS** and **Flowbite**.

**A. Setup (Tailwind, etc.)**

1.  Initialize Tailwind: `npx tailwindcss init -p`
2.  Configure `tailwind.config.js` to scan `public/**/*.html` and `public/**/*.js` and to include the Flowbite plugin.
3.  Create `public/assets/styles.css` with the core Tailwind directives.
4.  Build the CSS: `npx tailwindcss -i ./public/assets/styles.css -o ./public/assets/main.css --watch` (Add this to `package.json` scripts).

**B. Shared Client-Side JavaScript**

  * **`public/assets/nav.js`**:

      * On `DOMContentLoaded`, fetches a common `_nav.html` partial.
      * Injects the nav HTML into a placeholder element (e.g., `<header id="nav-placeholder"></header>`).
      * This ensures all pages (index.html, testing.html, etc.) share one nav bar.
      * The nav bar must include links to: Home, Features (Dropdown), Health, and API Docs (`/openapi.html`).

  * **`public/assets/app.js` (The "server.js" you mentioned)**:

      * This is the main client-side application logic.
      * Contains the master WebSocket connection logic.
      * `connectWebSocket()`: Establishes and maintains the `/ws` connection.
      * `onmessage` handler: Parses incoming JSON messages.
          * `if (msg.type === 'ai_thought')`: Routes `msg.content` to the "Agent Thinking" UI pane.
          * `if (msg.type === 'terminal_log')`: Routes `msg.content` to the "Container Console" UI pane.
          * `if (msg.type === 'status_update')`: Updates the sticky status bar text.
      * Provides helper functions for forms to send API requests (e.g., `async function invokePathway(pathway, body)`).

**C. Global UI Components**

  * **Sticky Status Bar**:

      * A `div` at the top of `<body>` (`position: sticky`, `top: 0`).
      * Contains text: "Status: Idle" and a spinner (hidden by default).
      * The `app.js` WebSocket listener updates this text.
      * `onclick`, it opens the `dashboard.html` page or a modal.

  * **Dashboard (`dashboard.html`)**:

      * A full-page view dedicated to the real-time log.
      * Implements the side-by-side view:
          * Left Pane (`<div id="ai-thoughts-log">`): A scrolling log for AI agent messages.
          * Right Pane (`<div id="terminal-log">`): A scrolling, `pre-formatted` log for container console output.

**D. Page: Landing (`index.html`)**

1.  Standard HTML5 boilerplate, includes `main.css`, `app.js`, `nav.js`, and Flowbite scripts.
2.  SaaS-style hero section: "Welcome to Repo-Agent-Worker".
3.  A grid of "Features" / "User Journeys" using Flowbite "Card" components.
4.  Each card has an icon, a title, a description, and a "Learn More" link.
      * **Card 1: Run Tests** -\> `features/testing.html`
      * **Card 2: Standardize Repo** -\> `features/standardize.html`
      * **Card 3: Reproduce Error** -\> `features/reproduce-error.html`
      * **Card 4: Analyze Data** -\> `features/analyzer.html`

**E. Page: Feature Example (`features/testing.html`)**

This page is the template for all feature journeys.

1.  **Form Section**:
      * `input` for "GitHub URL".
      * Toggles (Flowbite) for "Test Mode": [Frontend], [Backend], [Both].
      * **Conditional Inputs**:
          * If [Frontend] or [Both] is checked, show `textarea` for "Frontend Test Prompt".
          * If [Backend] or [Both] is checked, show `textarea` for "Backend Test Prompt".
      * **Prompt Suggestions**:
          * Below each `textarea`, include 1-3 buttons with example prompts (e.g., "Test all buttons", "Check all API endpoints for 401").
      * "Run Test" submit button.
2.  **Real-time View Section**:
      * A side-by-side layout (using Tailwind grid `grid-cols-2`).
      * Left Pane: "Agent Thinking" (`<div id="ai-thoughts-log">`).
      * Right Pane: "Container Console" (`<div id="terminal-log">`).
      * The `app.js` WebSocket listener will automatically populate these.

**F. Page: Health (`health.html`)**

1.  A page to show the status of the worker and its services.
2.  Include a button "Run Health Checks".
3.  Clicking it calls an `/api/health` endpoint, which runs internal tests (e.g., pings sandbox, checks AI keys) and returns results.

**G. Page: API Docs (`openapi.html`)**

1.  A simple page that uses a library like **Swagger UI** or **Redoc**.
2.  Point the library to fetch its specification from `/openapi.json`.
