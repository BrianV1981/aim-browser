# aim-browser Skill

## Overview
This skill provides an interactive, ephemeral headless browser interface using the Chrome DevTools Protocol (CDP). 

Agents use this skill when they need to dynamically explore a webpage, test CSS/XPath selectors, interact with elements, and figure out how a site works before writing a hardcoded deterministic script using the \`AimBrowser\` engine.

## Prerequisites
This skill connects to an existing local Chromium instance. Before running the skill, the Operator or the environment MUST have Chromium running with the remote debugging port exposed:
\`\`\`bash
google-chrome --remote-debugging-port=9222 --remote-allow-origins="*" --headless
\`\`\`

## Available Resources
- \`scripts/run.js\`: A CLI wrapper around the \`AimBrowser\` engine that executes sequential browser actions.

## Command Line Flags
The \`run.js\` script executes arguments sequentially from left to right. This allows you to chain commands in a single run.

- \`--url <url>\`: Navigates to the specified URL and waits for the \`loadEventFired\` event.
- \`--wait <ms>\`: Pauses execution for a specified number of milliseconds (useful for SPAs/AJAX).
- \`--eval "<js>"\`: Executes JavaScript within the page context and prints the result.
- \`--click <selector>\`: Finds the center coordinates of the CSS selector and dispatches a mouse click.
- \`--html\`: Extracts and prints the \`document.documentElement.outerHTML\`.
- \`--screenshot <path>\`: Captures a PNG screenshot and saves it to the specified file path.

## Examples

### 1. Basic Navigation and Extraction
Read the entire DOM of a webpage to discover its structure.
\`\`\`bash
node aim-browser.skill/scripts/run.js --url "https://example.com" --html
\`\`\`

### 2. Interaction and Delay
Navigate, wait for a dynamic element to load, click it, and read the resulting state.
\`\`\`bash
node aim-browser.skill/scripts/run.js \
  --url "https://example.com" \
  --wait 2000 \
  --click "#load-more-btn" \
  --wait 1000 \
  --eval "document.querySelector('.results').innerText"
\`\`\`

### 3. Visual Verification
Take a screenshot to verify what the page looks like or to debug a failing selector.
\`\`\`bash
node aim-browser.skill/scripts/run.js --url "https://example.com" --wait 3000 --screenshot "/tmp/debug.png"
\`\`\`

## Agent Workflows
1. **Discovery:** Use \`--html\` and \`--eval\` to find the CSS selectors you need.
2. **Testing:** Chain \`--url\`, \`--click\`, and \`--wait\` to ensure your interaction sequence successfully triggers the site's logic.
3. **Transition to Production:** Once you have perfectly mapped out the required logic using this Skill, write your deterministic script inside your current project by importing the \`aim-browser\` Node.js package directly.
