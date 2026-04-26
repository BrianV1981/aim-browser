# aim-browser (System Manual & Agent Directives)

> **AGENT DIRECTIVE:** If you are an AI reading this, you are in the unified `aim-browser` repository. This toolset is your primary mechanism for interacting with the web. It is split into two halves: a Skill for your active exploration, and an Engine for the deterministic scripts you write.

## The Origin & Capabilities
This project is a clean architectural refactor of the legacy "Clawgle" project. It brings **100% feature parity** with Clawgle, but splits the LLM "thinking/exploring" phase from the "dumb/reliable execution" phase for maximum stability and cost-efficiency.

**Features include:**
- **Tab & Session Management:** Multi-tab support with persistent state.
- **Advanced Input:** Native CDP typing, keyboard events (keypress, keycombo, keytype), and React-aware textbox clearing.
- **DOM & Interaction:** Native mouse tapping (`x, y`), element indexing, and selector waiting.
- **Extraction:** Screenshots (including fullpage metric overrides), Image extraction to Canvas/Base64, and full Accessibility Tree (`AXTree`) extraction for SPAs.
- **Environment Controls:** Window resizing, maximizing, and automated file downloads/uploads.

## The Architecture: A Tale of Two Parts

This repository bridges the gap between exploratory LLM-driven navigation and deterministic, high-throughput production scraping.

### 1. The Skill (`aim-browser.skill/`) -> Your "Eyes and Hands"
This is your ephemeral, exploratory tool. When the Operator asks you to "figure out how this website works," you must use this skill. It allows you to interactively poke around websites, discover DOM structures, and test CSS/XPath selectors.

**Agentic Installation (How to equip this skill):**
If you need to use the browser but do not have the skill loaded, you must clone this repository and link it using your native `gemini skills` command. Do not use `cp` to copy the files manually.

\`\`\`bash
# 1. Clone the repository to a temporary workspace
git clone https://github.com/BrianV1981/aim-browser.git /tmp/aim-browser-repo

# 2. Use the native CLI command to link the skill to your agent profile
gemini skills link /tmp/aim-browser-repo/aim-browser.skill
\`\`\`
*(Note: The SKILL.md file contains required YAML frontmatter (name/description). Do not remove it, or the CLI will fail to parse the skill).*

**Usage:**
Read `aim-browser.skill/SKILL.md` for specific execution commands, available flags (like `--elements`, `--type`, `--content-ax`), and workflows.

### 2. The Engine (`src/`) -> Your "Production Artifact"
Once you use the Skill to successfully navigate a site and find the correct selectors, your final task is usually to write a permanent script for a cronjob. **You must use this Engine for that script.**

The Engine is a zero-dependency, pure CDP Node.js module. It does not use Puppeteer or Playwright. It does not use LLM tokens. It simply executes the hardcoded navigation logic you wrote.

**Agentic Integration (How to use it in your code):**
When writing a production script (e.g., `leaddeed-loopnet`), instruct the project's `package.json` to pull this engine directly from GitHub:
\`\`\`bash
npm install github:BrianV1981/aim-browser
\`\`\`

**Example Output Script:**
\`\`\`javascript
import { AimBrowser } from 'aim-browser';

const browser = new AimBrowser();
await browser.connect(); // Ensure Chrome is running with --remote-debugging-port=9222
await browser.send('Page.enable');

// Open a new tab
const tab = await browser.openTab('https://example.com');
await browser.connect(tab.id);

// Wait for page to settle
await browser.waitReady();

// Extract the accessibility tree
const axTree = await browser.getAccessibilityTree();
console.log(axTree);

// Close the tab and disconnect
await browser.closeTab(tab.id);
await browser.close();
\`\`\`

## Testing & Maintenance
This project follows strict Test-Driven Development (TDD). If the Operator asks you to modify the core `AimBrowser` engine, you MUST write/update the tests in `tests/cdp-client.test.js` first. The suite mocks `fetch` and `ws` so you can run tests rapidly without needing a local Chromium instance.

\`\`\`bash
npm install
npm test
\`\`\`

## Overarching Project
This tool is a sub-component of the overarching **A.I.M. (Actual Intelligent Memory)** ecosystem. 
For more information on the core agent framework, GitOps guardrails, and DataJack cartridges, visit the main repository:
[BrianV1981/aim](https://github.com/BrianV1981/aim)

## Support
☕ **Support the project:** [Buy Me a Coffee](https://buymeacoffee.com/brianv1981)
