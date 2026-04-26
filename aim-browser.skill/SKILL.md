---
name: aim-browser
description: Interactive, ephemeral headless browser interface using the Chrome DevTools Protocol (CDP) for exploring web pages, testing CSS/XPath selectors, and interacting with elements.
---

# aim-browser Skill

## Overview
This skill provides an interactive, ephemeral headless browser interface using the Chrome DevTools Protocol (CDP). 

Agents use this skill when they need to dynamically explore a webpage, test CSS/XPath selectors, interact with elements, and figure out how a site works before writing a hardcoded deterministic script using the `AimBrowser` engine.

## Prerequisites
This skill connects to an existing local Chromium instance. Before running the skill, the Operator or the environment MUST have Chromium running with the remote debugging port exposed:
```bash
google-chrome --remote-debugging-port=9222 --remote-allow-origins="*" --headless
```

## Available Resources
- `scripts/run.js`: A CLI wrapper around the `AimBrowser` engine that executes sequential browser actions.

## Command Line Flags
The `run.js` script executes arguments sequentially from left to right, maintaining state across tabs.

### Tab Management
- `--list` / `--tabs`: Lists all open browser tabs and highlights the current active tab.
- `--open <url>`: Opens a new tab with the given URL and sets it as the active tab.
- `--use <index>`: Switches the active tab to the given index.
- `--close [<index>]`: Closes the specified tab, or the active tab if no index is given.

### Navigation & Waiting
- `--url <url>`: Navigates the current tab to the specified URL and waits for readiness.
- `--wait-ready`: Waits until `document.readyState` is `complete`.
- `--wait-selector <css>`: Polls the page until the CSS selector exists.
- `--wait <ms>`: Hard pauses execution for the given milliseconds.

### DOM Discovery & Extraction
- `--elements`: Scans the DOM for all visible, interactable elements (buttons, inputs, links) and prints their index, type, coordinates, and text content.
- `--content`: Extracts and prints the visible text of the page.
- `--content-ax`: Extracts and prints the Accessibility Tree (useful for complex SPAs).
- `--html`: Extracts and prints `document.documentElement.outerHTML`.
- `--screenshot <path> [--fullpage]`: Captures a PNG screenshot to the given path. Add `--fullpage` to resize the viewport to capture the entire scrollable area.
- `--imgsave <path>`: Finds the largest image on the page and extracts it to the given path natively.

### Interaction & Input
- `--click <target>`: Clicks an element. Target can be an exact CSS selector (starts with `#` or `.`) or an element `<index>` found via `--elements`.
- `--tap <index>`: Directly taps the x/y center of the element at the given index.
- `--tapxy <x> <y>`: Dispatches a native mouse click at the exact coordinates.
- `--taptestid <id>`: Taps the element with the matching `data-testid` attribute.
- `--type <index> <text>`: Focuses and clears the element at the index, then natively types the text.
- `--textbox <text>`: Auto-discovers the primary textbox/textarea on the page and types into it.
- `--keytype <text>`: Blindly types characters as native keyboard events.
- `--keypress <key>`: Dispatches a native keydown/keyup event (supports: `enter`, `tab`, `backspace`, `escape`).
- `--keycombo <combo>`: Dispatches a keyboard combination (supports: `ctrl+enter`).

### Environment Management
- `--dlpath <dir>`: Sets the browser's download path to the specified directory.
- `--upload <css> <file>`: Injects the given local file into the file input matching the CSS selector.
- `--resize <w> <h>`, `--maximize`, `--minimize`: Manipulates the browser window bounds.
- `--eval "<js>"`: Executes arbitrary JavaScript within the page context and prints the result.

## Examples

### 1. Advanced Discovery
Find all clickable elements on the screen.
```bash
node aim-browser.skill/scripts/run.js --elements
```

### 2. Interaction Chain
Navigate, type into a specific input index, and press enter.
```bash
node aim-browser.skill/scripts/run.js \
  --url "https://example.com" \
  --type 2 "search query" \
  --keypress enter \
  --wait-selector ".results-container" \
  --screenshot "/tmp/results.png"
```