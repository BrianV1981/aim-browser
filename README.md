# aim-browser: The Persistent Headed CDP Engine

> **AGENT DIRECTIVE:** If you are an AI reading this, you are in the unified `aim-browser` repository. This toolset is your primary mechanism for interacting with the web. It is built on a fundamental paradigm shift in web scraping: **Real browsers don't need to hide.**

## The Paradigm Shift: Why Headless Fails
Traditional web scraping relies on headless browser automation (Puppeteer, Playwright, Selenium). Enterprise anti-bot providers (Akamai, Datadome, Cloudflare Enterprise, PerimeterX / HUMAN Security) spend billions of dollars identifying these tools by fingerprinting `navigator.webdriver`, analyzing WebGL rendering, and looking for missing human entropy.

The `aim-browser` architecture takes a completely different approach. **It does not pretend to be a real browser. It IS a real browser.**

By utilizing a robust background lifecycle daemon, `aim-browser` boots a standard, persistent, **headed** Desktop Chromium instance attached to a genuine user profile (`user-data-dir`). It exposes the Chrome DevTools Protocol (CDP) port and minimizes itself. Because the browser is authentic, it naturally sails through network-level and TLS-fingerprinting bot protections (like Akamai) that hard-block headless scrapers.

## Enterprise Evasion Capabilities
This engine is built to operate in hostile, heavily protected DOM environments:
- **Zero-Dependency CDP:** Pure Node.js WebSocket communication. No heavy driver binaries injected into the page context.
- **Native X/Y Coordinate Interaction:** Instead of generic DOM clicks, the engine calculates the exact bounding box of an element and dispatches native `mouseMoved`, `mousePressed`, and `mouseReleased` events.
- **PerimeterX / DataDome Defeat (`--solve-px`):** Natively detects "Press & Hold" behavioral CAPTCHAs, moves the mouse to the coordinates, and holds the click for 10 seconds to generate requisite human entropy before releasing.
- **Cloudflare Turnstile Bypass:** The headed daemon's natural fingerprint allows it to clear passive JS challenges silently without triggering interactive widgets.

## The Business Logic: "Moat + Delta = Intent"
This tool was not built to scrape generic data. It was built for **B2B and B2B2C Trigger Lead Generation**. 

When a company (like LoopNet, Zillow, or Ticketmaster) spends millions on bot protection, they are creating a **Moat**. That moat proves the data is highly valuable. By breaching the moat daily, `aim-browser` tracks the **Delta** (the state change—e.g., a commercial listing dropping off the market, indicating a signed lease). 

That Delta equals **Intent**. A business that just signed a lease urgently needs telecom, furniture, and insurance. `aim-browser` allows you to extract that Day-1 intent data and sell it to local vendors before the competition even knows the business exists.

---

## The Architecture: A Tale of Two Parts

### 1. The Skill (`aim-browser.skill/`) -> Your "Eyes and Hands"
This is the ephemeral, exploratory tool for AI Agents. It allows agents to interactively poke around websites, discover DOM structures, test CSS/XPath selectors, and solve CAPTCHAs.

**Agentic Installation (How to equip this skill):**
Do not use `cp` to copy the files manually. Use the native CLI command:
\`\`\`bash
# 1. Clone the repository to a temporary workspace
git clone https://github.com/BrianV1981/aim-browser.git /tmp/aim-browser-repo

# 2. Use the native CLI command to link the skill to your agent profile
gemini skills link /tmp/aim-browser-repo/aim-browser.skill
\`\`\`
*(Note: The SKILL.md file contains required YAML frontmatter. Do not remove it).*

**Usage:**
Read `aim-browser.skill/SKILL.md` for execution commands.

### 2. The Engine (`src/`) -> Your "Production Artifact"
Once an agent maps out a site using the Skill, they write a permanent script for a cronjob. **You must use this Engine for that script.**

**Agentic Integration:**
Instruct the project's `package.json` to pull this engine directly from GitHub:
\`\`\`bash
npm install github:BrianV1981/aim-browser
\`\`\`

**Example Output Script:**
\`\`\`javascript
import { AimBrowser, startDaemon, stopDaemon } from 'aim-browser';

// 1. Boot the headed Chromium daemon (bypasses Datadome/Akamai)
startDaemon();

// 2. Connect the engine
const browser = new AimBrowser();
await browser.connect();
await browser.send('Page.enable');

// 3. Open a new tab and connect to it
const tab = await browser.openTab('https://example.com');
await browser.connect(tab.id);

// 4. Wait for page to settle and solve any behavioral captchas
await browser.waitReady();
await browser.solvePerimeterX();

// 5. Extract the accessibility tree
const axTree = await browser.getAccessibilityTree();
console.log(axTree);

// 6. Close the tab, disconnect, and safely kill the browser daemon
await browser.closeTab(tab.id);
await browser.close();
stopDaemon();
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