# ============================================================================
# Optimized Dockerfile for Cloudflare Workers Sandbox Container
# ============================================================================
#
# OPTIMIZATION SUMMARY:
# - Removed ALL Playwright installations (browsers, system deps, npm package)
# - Browser automation handled by Cloudflare's Browser Rendering API via
#   @cloudflare/puppeteer in the Worker (NOT in this container)
# - This container only provides the sandbox execution environment
# - Base image (cloudflare/sandbox:0.3.3) already includes all necessary
#   dependencies for code execution in the sandbox
#
# SIZE REDUCTION: ~2470MB → ~400-600MB (estimated)
# ============================================================================

# Use the official Cloudflare sandbox base image
# This image includes:
# - Node.js runtime for JavaScript/TypeScript execution
# - Python runtime for Python code execution
# - Essential system utilities for sandbox environment
# - Security isolation and resource management capabilities
FROM docker.io/cloudflare/sandbox:0.3.3

# ============================================================================
# NO ADDITIONAL PACKAGES REQUIRED
# ============================================================================
#
# The base image provides everything needed for:
# ✓ Code execution in isolated sandbox environment
# ✓ Node.js package installations and runtime
# ✓ Python package installations and runtime
# ✓ File system operations within sandbox
# ✓ Network access (when permitted)
#
# Browser automation is handled externally by:
# - Cloudflare Browser Rendering API
# - @cloudflare/puppeteer in the Worker code
# - NOT in this container image
# ============================================================================
