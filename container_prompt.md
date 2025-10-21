### Task: Design and Implement the `gh-sandbox-container`

Your objective is to create a new, dedicated Cloudflare Worker named `gh-sandbox-container`. This worker will function as a specialized, multi-purpose agent for handling complex repository tasks. It will be built on the **Cloudflare Sandbox SDK** to provide a secure, containerized environment for each task.

The worker will expose a single HTTP endpoint that accepts a JSON payload. This payload will specify which "well-lit pathway" (specialized task) to execute, along with a general-purpose prompt and context.

### 1\. Project Scaffolding

1.  Create the new worker project using the Sandbox SDK minimal template:

    ```sh
    npm create cloudflare@latest gh-sandbox-container --template=cloudflare/sandbox-sdk/examples/minimal
    cd gh-sandbox-container
    ```

2.  Install all necessary client SDKs for AI providers and GitHub:

    ```sh
    npm install @octokit/rest @google/generative-ai openai anthropic
    ```

3.  Create a `Dockerfile` in the project root. This image must be customized to support all pathways.

    ```dockerfile
    # Use the base sandbox image
    FROM docker.io/cloudflare/sandbox:0.3.3

    # Install Playwright and its dependencies for the Tester pathway
    RUN apt-get update && \
        apt-get install -y libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libatspi2.0-0 libxkbcommon0 libdrm2 libgbm1 libasound2 && \
        rm -rf /var/lib/apt/lists/*

    # Install Playwright via npm
    RUN npm install -g playwright
    ```

### 2\. `wrangler.jsonc` Configuration

Update your `wrangler.jsonc` file to include all necessary bindings and secrets.

```jsonc
{
  "name": "gh-sandbox-container",
  "main": "src/index.ts",
  "compatibility_date": "2025-02-11",
  "compatibility_flags": ["nodejs_compat"],
  // 1. Bind the Sandbox Container as a Durable Object
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
  // 2. Bind Workers AI
  "ai": {
    "binding": "AI"
  },
  // 3. Bind Secrets for external AI providers and GitHub
  "secrets": [
    "GITHUB_TOKEN",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY"
  ]
}
```

### 3\. API Design and Core Routing (`src/index.ts`)

The worker will expose a single `/invoke` endpoint that routes to the correct module based on the `pathway` parameter.

**Request Payload (`POST /invoke`):**

```typescript
interface InvokeRequest {
  // A unique ID for tracking this task
  task_id: string;
  
  // Specifies which "well-lit pathway" to use
  pathway: "standardize" | "reproduce_error" | "validate_fix" | "run_tests" | "analyze_data" | "general_prompt";

  // General instructions for the task
  prompt: string;
  
  // Target repository
  repo_url: string;
  branch: string;

  // AI model selection
  ai_provider: "workers-ai" | "gemini" | "openai" | "claude";

  // Flexible context object for pathway-specific data
  context?: {
    // For 'validate_fix'
    patch_content?: string; 
    
    // For 'run_tests'
    openapi_url?: string;
    auth_key?: string;
    test_mode?: "backend" | "frontend" | "both";

    // For 'analyze_data'
    database_download_url?: string; // e.g., a presigned R2 URL
  };
}
```

**Core Router (`src/index.ts`):**

Implement the `fetch` handler to parse the `InvokeRequest`, select the correct AI client, and delegate to the appropriate module.

```typescript
import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
// ... import AI clients
// ... import pathway modules (standardizer, reproducer, etc.)

export { Sandbox } from "@cloudflare/sandbox";

export interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
  AI: Ai;
  GITHUB_TOKEN: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Expected POST", { status: 405 });
    }

    const req: InvokeRequest = await request.json();
    
    // 1. Get a unique sandbox for this task
    const sandbox = getSandbox(env.Sandbox, req.task_id);

    // 2. Initialize the selected AI client
    const aiClient = initializeAiClient(req.ai_provider, env);

    // 3. Route to the correct pathway module
    let result;
    switch (req.pathway) {
      case "standardize":
        result = await runStandardization(sandbox, aiClient, req);
        break;
      case "reproduce_error":
        result = await runErrorReproduction(sandbox, aiClient, req);
        break;
      case "validate_fix":
        result = await runValidation(sandbox, aiClient, req);
        break;
      case "run_tests":
        result = await runTests(sandbox, aiClient, req);
        break;
      case "analyze_data":
        result = await runAnalysis(sandbox, aiClient, req);
        break;
      case "general_prompt":
      default:
        result = await runGeneralPrompt(sandbox, aiClient, req);
        break;
    }

    return Response.json(result);
  }
}
```

### 4\. "Well-Lit Pathway" Modules

Create a separate module (`src/modules/*.ts`) for each pathway.

-----

#### Pathway 1: Repo Standardizer (`src/modules/standardizer.ts`)

  * **Goal:** Clones a repo, analyzes its structure, and generates an `AGENTS.md` file and other standard configurations.
  * **Steps:**
    1.  Clone the repo using the `GITHUB_TOKEN`:
        `await sandbox.exec("git clone --depth=1 ...")`
    2.  Scan the repo structure:
        `const structure = await sandbox.exec("ls -R")`
    3.  Feed the repo structure, file samples, and the `prompt` to the AI with a system message: "You are a DevOps expert. Generate an `AGENTS.md` file for this repository...".
    4.  Write the AI-generated content to the sandbox:
        `await sandbox.writeFile("/workspace/repo/AGENTS.md", generated_content)`
    5.  Generate a patch file:
        `const patch = await sandbox.exec("cd /workspace/repo && git diff")`
    6.  Return the patch file as the result.

-----

#### Pathway 2: Error Reproducer (`src/modules/reproducer.ts`)

  * **Goal:** Attempts to reproduce a bug in a clean environment.
  * **Steps:**
    1.  Clone the repo.
    2.  Read `package.json` (or `requirements.txt`) to determine setup.
    3.  Run installation:
        `const installLog = await sandbox.exec("npm install")`
    4.  Run the dev/test command from the `prompt`:
        `const testLog = await sandbox.exec("npm test")`
    5.  Feed the `installLog`, `testLog`, and `prompt` (bug description) to the AI.
    6.  Return an analysis: `{ reproduced: boolean, logs: string, recommended_solution: string }`.

-----

#### Pathway 3: Solution Validator (`src/modules/validator.ts`)

  * **Goal:** Applies a proposed fix (patch) and runs tests to validate it.
  * **Steps:**
    1.  Clone the repo.
    2.  Get the `patch_content` from `req.context.patch_content`.
    3.  Write the patch to the sandbox:
        `await sandbox.writeFile("/workspace/fix.patch", patch_content)`
    4.  Apply the patch:
        `await sandbox.exec("cd /workspace/repo && git apply /workspace/fix.patch")`
    5.  Run installation and tests:
        `await sandbox.exec("cd /workspace/repo && npm install")`
        `const testResult = await sandbox.exec("cd /workspace/repo && npm test")`
    6.  Return a report: `{ applied: boolean, tests_passed: testResult.success, logs: testResult.stdout }`.

-----

#### Pathway 4: Unit Test Applicator (`src/modules/tester.ts`)

  * **Goal:** Runs a full E2E/unit test suite based on a prompt and OpenAPI spec.
  * **Steps:**
    1.  Check `req.context.test_mode` (frontend, backend, both).
    2.  **Backend:**
          * Fetch the `openapi_url`.
          * Feed the OpenAPI spec and `prompt` to the AI: "You are a QA engineer. Write a Playwright script to test the following scenarios...".
          * Write the generated script: `await sandbox.writeFile("/workspace/api_test.spec.ts", ...)`.
          * Run Playwright: `const backend_results = await sandbox.exec("playwright test api_test.spec.ts")`.
    3.  **Frontend:**
          * Clone the repo.
          * `await sandbox.exec("cd /workspace/repo && npm install && npm run build")`.
          * Start the server as a background process: `await sandbox.startProcess("npm run start")`.
          * Generate Playwright tests based on the `prompt`.
          * Run Playwright against the local server or using the Browser Rendering API.
    4.  Return a combined test report.

-----

#### Pathway 5: Data Analyzer (`src/modules/analyzer.ts`)

  * **Goal:** Downloads a D1 database snapshot and runs analysis.
  * **Steps:**
    1.  Get the `database_download_url` from `req.context`.
    2.  Download the database file into the sandbox:
        `await sandbox.exec("curl -L -o /workspace/local_copy.db ${req.context.database_download_url}")`
    3.  Feed the `prompt` to the AI: "You are a data analyst. Write a Python script using sqlite3 and pandas to analyze `/workspace/local_copy.db`...".
    4.  Write the generated Python script:
        `await sandbox.writeFile("/workspace/analyze.py", generated_script)`
    5.  Execute the analysis:
        `const analysis = await sandbox.exec("python /workspace/analyze.py")`
    6.  Return the `analysis.stdout` (which contains the report).

-----

#### Pathway 6: General Prompt Handler (`src/modules/general.ts`)

  * **Goal:** A fallback for any task not covered by a "well-lit pathway."
  * **Steps:**
    1.  Clones the repo.
    2.  Feeds the `prompt` and repo structure to the AI.
    3.  The AI generates a series of shell commands.
    4.  Execute each command sequentially in the sandbox.
    5.  Stream logs back to the caller (or return a final report).
