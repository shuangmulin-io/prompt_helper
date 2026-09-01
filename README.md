# ⚡ Prompt Helper

> **A modern, privacy-focused, local-first prompt engineering studio and workbench.**  
> Rapidly construct, optimize, test, structure, and manage high-performing prompts for **Gemini, Claude, ChatGPT, and DeepSeek**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Backend](https://img.shields.io/badge/Backend-100%25%20Local--First-06b6d4.svg)](#privacy--security)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20Ready-10b981.svg)](#-offline--pwa-support)
[![Vanilla JS](https://img.shields.io/badge/Stack-HTML5%20%7C%20CSS3%20%7C%20ES6-f59e0b.svg)](#-technology-stack)

---

## 🌟 Key Features

### 🎨 1. Dual-Mode Prompt Studio
* **3-Step Guided Wizard:** Seamlessly break prompt construction into **1. Goal & Context**, **2. Rules & Format**, and **3. Role & Variables**.
* **Full Form Builder:** All prompt dimensions accessible on a single unified canvas.
* **Raw Markdown Mode:** Direct text editing with instant variable substitution.

### 🧠 2. Model-Tailored Auto-Formatting
Instantly restructures your prompt output for your target AI model:
* **Google Gemini:** Formatted with clean section headers and explicit rule bullets.
* **Anthropic Claude:** Automatically formatted with semantic XML tags (`<role>`, `<context>`, `<instructions>`, `<constraints>`).
* **DeepSeek:** Enriched with structured Chain-of-Thought reasoning triggers.
* **ChatGPT (OpenAI):** Clean Markdown structure optimized for GPT models.

### 🔤 3. Dynamic Variables & Fill-in-the-Blanks
* Type `{{variable_name}}` anywhere in your prompt.
* Prompt Helper instantly generates interactive input boxes with live preview substitution.
* Highlight text and press `Ctrl+B` to create a `{{blank}}` in one keystroke!

### 📚 4. 15 Built-in Production Templates & Template Hub
* Curated, battle-tested templates across 5 categories:
  * **Coding:** Code Refactoring, Debugging Assistant, RFC Architect
  * **AI Agent Specs:** Autonomous Agent, Tool Dispatcher, Multi-Agent Coordinator
  * **Writing & Communication:** Direct Response Copywriter, Technical Blog Post, Executive Summary
  * **Data & Schemas:** JSON Schema Generator, SQL Query Optimizer, Regex Parser
  * **Learning & Strategy:** Socratic Computer Science Tutor, First Principles Thinking, Conversational Language Coach
* **Deep Content Search:** Full-text real-time search across titles, descriptions, roles, rules, and blanks.

### 💾 5. Local Folder Sync (Prompt Vault)
* Connect a real folder on your PC using the browser's native **File System Access API**.
* Prompts save directly to your hard drive as `.json` files.
* Offline localStorage fallback ensures you never lose work if folder sync is disconnected.

### 🕒 6. Version History & Line-by-Line Visual Diff
* Automated and manual snapshot saves.
* Integrated Longest Common Subsequence (LCS) visual diff viewer with green additions (`+`) and red deletions (`-`).
* 1-Click version restore.

### 🛡️ 7. 5-Point Quality & Trust Checklist
* Real-time automated prompt analysis checking for Role Definition, Task Instructions, Rules & Constraints, Output Format, and Variable Safety.
* 1-Click **"🛡️ Add Trust & Accuracy Rules"** to prevent hallucinations.
* Visual Token Allocation bar with word/token/reading-time estimators.

### ⚡ 8. 1-Click Prompt Compression & Token Optimizer
* **Client-Side Heuristic Engine:** Automatically detects and condenses conversational fluff, simplifies wordy directives, and normalizes passive phrasing into direct imperatives.
* **Syntax Safe:** Strictly isolates and protects `{{variables}}`, code blocks, and model XML tags.
* **Live Savings Metrics:** Instant token differential calculation and color-coded line-by-line diff preview.

### ⛓️ 9. Multi-Step Prompt Chain Builder
* **Sequential Workflows:** Build complex multi-stage prompt pipelines with visual step connectors.
* **Dynamic Step Output Linking:** Feed the output of previous steps into subsequent prompts using `{{step1_output}}`, `{{step2_output}}`.
* **Playbook Export:** Export complete end-to-end markdown playbooks with a single click.

### 📱 10. Offline & Touch-Optimized PWA
* **Standalone Installation:** 1-Click desktop and mobile installation via Web App Manifest.
* **Mobile & Tablet Touch Gestures:** Native swipe-to-dismiss bottom-sheet modal drawers and responsive iPad portrait layout stacking.
* **100% Offline Caching:** Powered by `sw.js` (Service Worker) with zero internet requirement.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + K` (or `Cmd + K`) | Open Command Palette |
| `Ctrl + Shift + O` or `O` | Open Prompt Compression & Token Optimizer |
| `Ctrl + Enter` | Add / Toggle Trust & Accuracy Rules |
| `Ctrl + B` (or `Cmd + B`) | Convert highlighted text into a `{{blank}}` variable |
| `Ctrl + Shift + C` | Copy assembled prompt to clipboard |
| `H` | Open Version History & Diff Viewer |
| `?` or `Ctrl + /` | Open Keyboard Shortcuts Cheatsheet |
| `Escape` | Close active modal / dialog / command palette |

---

## 🚀 Quick Start (Zero Dependencies)

Prompt Helper requires **no build step, no npm install, and no complex configuration**.

### Option 1: Direct File
Double-click `index.html` in your file explorer to open it directly in any modern browser (Chrome, Edge, Brave, Firefox, Safari).

### Option 2: Local HTTP Server (Recommended for PWA & Local Folder Sync)
Run any local static server from the project directory:

```bash
# Python 3
python -m http.server 3000

# or Node.js npx serve
npx serve .

# or PHP
php -S localhost:3000
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📁 Project Structure

```text
prompt_helper/
├── index.html         # Semantic HTML5 single-page application structure & modals
├── styles.css         # Responsive design system, themes, and touch optimizations
├── app.js             # Application state, live assembler, compressor, and routing
├── templates.js       # Curated 15 production-ready prompt template library
├── chains.js          # Multi-step prompt chain workflow templates
├── sw.js              # Service worker for offline PWA caching & font pre-caching
├── test.js            # Automated unit test runner (34 tests across 8 suites)
├── manifest.json      # Web App Manifest for desktop & mobile installation
├── LICENSE            # MIT License
├── README.md          # Project documentation
└── .gitignore         # Clean repository ignore patterns
```

---

## 🧪 Testing

Run the built-in zero-dependency unit test suite using Node.js:

```bash
node --test test.js
```

---

## 🔒 Privacy & Security

* **100% Local Execution:** All prompt generation, compression, history snapshots, and folder syncing execute strictly within your local browser runtime.
* **Zero Tracking:** No analytics trackers, no telemetry beacons, and no external tracking cookies.
* **Strict Content Security Policy (CSP):** Defense-in-depth script execution restrictions with zero inline scripts.
* **Zero Cloud Lock-in:** Your prompt data belongs entirely to you in standard `.json` and `.md` formats.

---

## 📄 License

Distributed under the [MIT License](LICENSE). Free for personal and commercial use.

