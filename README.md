# aim-browser

A unified Chrome DevTools Protocol (CDP) headless browser toolset. 

This repository serves a dual purpose, bridging the gap between exploratory LLM-driven navigation and deterministic, high-throughput production scraping.

## The Architecture: A Tale of Two Parts

The `aim-browser` project is split into two perfectly symbiotic components:

### 1. The Production Engine (`src/`)
A zero-dependency, pure CDP Node.js module used for deterministic automation. It does not use Puppeteer or Playwright, keeping it lightweight and fast. It does not use LLM tokens. It simply executes hardcoded navigation and extraction scripts.

**Installation for Production:**
\`\`\`bash
npm install github:BrianV1981/aim-browser
\`\`\`

**Usage in Node:**
\`\`\`javascript
import { AimBrowser } from 'aim-browser';

const browser = new AimBrowser();
await browser.connect();
await browser.send('Page.enable');
await browser.send('Page.navigate', { url: 'https://example.com' });
// ... automation logic
await browser.close();
\`\`\`

### 2. The Gemini CLI Skill (`aim-browser.skill/`)
An ephemeral, exploratory LLM tool. This is a packaged Gemini CLI \`.skill\` directory that wraps the Production Engine. AI agents use this skill to interactively poke around websites, click elements, discover DOM structures, and figure out CSS/XPath selectors. 

The ultimate goal of the skill is to allow an agent to discover how a portal works so that it can write a deterministic script (using the Production Engine) to run in a cronjob.

**Installation for Agents:**
Clone this repository and symlink or copy the \`aim-browser.skill\` folder into your agent's \`.gemini/skills/\` directory.

## Testing
This project follows strict Test-Driven Development (TDD). The core engine logic is tested via Jest by mocking the \`fetch\` and \`ws\` APIs, allowing the test suite to run rapidly without requiring a local Chromium instance.

\`\`\`bash
npm install
npm test
\`\`\`

## Origin
This project is a clean architectural refactor of the original "Clawgle" scripts, separating the LLM "thinking/exploring" phase from the "dumb/reliable execution" phase for maximum stability and cost-efficiency.
