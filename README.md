# NSU Course Planner MCP Server

Model Context Protocol (MCP) server for North South University (NSU) course advising, schedule planning, and conflict detection.

## Features
- **Deterministic Time Solver**: Accurate conflict detection for lectures & labs (ST, MW, RA, and single days).
- **Multi-Semester History**: Search current advising catalogs or query archived past semesters to replicate routines.
- **Preferences Engine**: Filter by preferred faculties, avoid early morning or late evening classes, and minimize total class days per week.
- **Server-Sent Events (SSE)**: Ready for Gemini App, Claude Desktop, and Antigravity IDE.
- **100% Free Deployment**: Ready to deploy directly to Vercel Serverless.

## MCP Tools Exposed
1. `list_semesters`: Discover all available active and historical semester catalogs.
2. `search_courses`: Search sections by course code, faculty initials, days, or available seats.
3. `check_conflicts`: Verify if a list of course sections clash in time.
4. `generate_routines`: Generate optimal, clash-free routine combinations for target courses.

## Local Development
```bash
npm install
npm run dev
```
The SSE endpoint will be available at `http://localhost:3000/sse`.

## Deploying to Vercel (Free)
1. In this directory, run:
```bash
vercel
```
2. Once deployed, note your URL (e.g. `https://nsu-planner-mcp.vercel.app/sse`).
3. Connect it in **Gemini Web (`gemini.google.com`)** under **Settings > Connected Apps / Extensions**.
