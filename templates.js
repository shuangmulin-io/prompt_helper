// ==========================================================================
// Prompt Helper — Curated Production Prompt Templates Library (15 Curated)
// ==========================================================================

const BUILTIN_TEMPLATES = [
  // --- Category: Coding (3 Templates) ---
  {
    id: "tpl-code-refactor",
    title: "Senior Code Refactoring Architect",
    category: "coding",
    targetModel: "claude",
    description: "Refactors legacy code for readability, performance, type safety, and clean architecture without altering behavior.",
    role: "Senior Software Architect & Code Quality Expert",
    context: "I have legacy code that needs refactoring to meet modern standards, clean architecture principles, and maintainability.",
    task: "Refactor the following {{language}} code snippet. Maintain original functional behavior while enhancing readability, error handling, and performance.",
    constraints: [
      "Do not change external function signatures or breaking public APIs.",
      "Add explicit type annotations and docstrings/comments for complex logic.",
      "Ensure proper error boundaries and guard statements.",
      "Provide a summary of key refactoring improvements made."
    ],
    outputFormat: "Markdown with syntax-highlighted code blocks followed by a concise summary table.",
    fewShot: "Input: function add(a,b){return a+b}\nOutput: /**\n * Adds two numbers safely.\n * @param {number} a\n * @param {number} b\n * @returns {number}\n */\nexport function add(a: number, b: number): number {\n  if (typeof a !== 'number' || typeof b !== 'number') throw new TypeError('Expected numbers');\n  return a + b;\n}",
    variables: [
      { name: "language", label: "Programming Language", default: "TypeScript" },
      { name: "code_snippet", label: "Target Code Snippet", default: "function processData(d) { let res = []; for(let i=0; i<d.length; i++) { if(d[i].active == true) { res.push(d[i].val * 2); } } return res; }" }
    ]
  },
  {
    id: "tpl-code-debug",
    title: "Root Cause Bug Investigator",
    category: "coding",
    targetModel: "gemini",
    description: "Traces error tracebacks, uncovers root causes, and provides step-by-step bug fixes with prevention tips.",
    role: "Principal Systems Debugger & Security Auditor",
    context: "An unexpected error occurred during execution. I need to identify why the failure happened and how to patch it permanently.",
    task: "Analyze the provided stack trace and source snippet in {{framework_environment}}. Identify the exact line of failure, root cause mechanism, and provide the fix.",
    constraints: [
      "Explain the exact failure cause in plain developer terms before code.",
      "Provide both a minimal quick-fix and a robust long-term architectural solution.",
      "Identify any edge cases that could re-trigger this failure."
    ],
    outputFormat: "Structured markdown: 1. Root Cause 2. Patched Code 3. Prevention Guidelines.",
    fewShot: "",
    variables: [
      { name: "framework_environment", label: "Framework / Runtime", default: "Node.js (Express) + PostgreSQL" },
      { name: "error_trace", label: "Error Log / Stacktrace", default: "TypeError: Cannot read properties of undefined (reading 'user_id') at /app/routes/auth.js:42:15" }
    ]
  },
  {
    id: "tpl-code-rfc-architect",
    title: "Technical Architecture RFC Generator",
    category: "coding",
    targetModel: "claude",
    description: "Drafts comprehensive Request for Comments (RFC) and technical design documents for engineering proposals.",
    role: "Staff Infrastructure Engineer & Systems Architect",
    context: "Our engineering team is proposing a new system architecture for {{project_name}} to solve {{technical_problem}}.",
    task: "Draft a formal engineering RFC outlining the background, requirements, proposed architecture, data models, trade-offs, and rollout plan.",
    constraints: [
      "Include clear ASCII/Mermaid architecture diagrams where helpful.",
      "Explicitly analyze alternative approaches and why they were rejected.",
      "Detail failure modes, scalability limits, and observability strategies."
    ],
    outputFormat: "Standard Technical RFC Markdown document with structured headings.",
    fewShot: "",
    variables: [
      { name: "project_name", label: "Project / Service Name", default: "Real-Time Event Ingestion Engine" },
      { name: "technical_problem", label: "Core Technical Problem", default: "High latency and dropped messages during peak 50k req/s traffic spikes" }
    ]
  },

  // --- Category: AI Agent Specs (3 Templates) ---
  {
    id: "tpl-agent-system-prompt",
    title: "Autonomous Agent System Instruction",
    category: "agent",
    targetModel: "claude",
    description: "Crafts a rock-solid system prompt for an autonomous AI agent with tool usage boundaries and step-by-step reasoning rules.",
    role: "AI Systems Prompt Engineer & Agent Specialist",
    context: "Building an autonomous AI agent for {{agent_domain}} that requires strict system instructions, tool execution rules, and anti-hallucination guardrails.",
    task: "Generate a complete system prompt for an AI agent named {{agent_name}}. Define its persona, core capabilities, step-by-step reasoning cycle, and strict behavioral boundaries.",
    constraints: [
      "Structure the system prompt using clear XML tags (<persona>, <workflow>, <tools>, <constraints>).",
      "Include explicit fallback instructions when tools fail or required data is missing.",
      "Enforce strict non-hallucination rules."
    ],
    outputFormat: "XML-tagged System Prompt ready for deployment in LLM agent framework.",
    fewShot: "",
    variables: [
      { name: "agent_name", label: "Agent Name", default: "DataForge Analytics Bot" },
      { name: "agent_domain", label: "Domain / Specialty", default: "Financial Data Analysis & Reporting" }
    ]
  },
  {
    id: "tpl-agent-tool-dispatcher",
    title: "Tool Calling & Function Dispatcher Spec",
    category: "agent",
    targetModel: "gpt4",
    description: "Defines strict tool-selection logic, argument validation criteria, and schema enforcement for function-calling LLMs.",
    role: "LLM Function Calling & Dispatch Specialist",
    context: "An agent has access to multiple tools and must determine the minimal, exact sequence of function calls required to resolve {{user_goal}}.",
    task: "Write system instructions that guide the model to select tools, validate parameter types before invocation, and gracefully handle tool error responses.",
    constraints: [
      "Never call destructive tools without explicit prior user confirmation.",
      "Output function call payloads in strictly valid JSON format.",
      "Handle partial failures with defensive retries or informative error messages."
    ],
    outputFormat: "Structured markdown containing Dispatch Rules, Error Handlers, and Parameter Checklist.",
    fewShot: "",
    variables: [
      { name: "user_goal", label: "Primary Workflow Goal", default: "Automating customer refund approvals and database balance reconciliation" }
    ]
  },
  {
    id: "tpl-agent-multi-coordinator",
    title: "Multi-Agent Workflow Coordinator",
    category: "agent",
    targetModel: "claude",
    description: "Designs orchestrator instructions for hierarchical multi-agent teams with task delegation and synthesis protocols.",
    role: "Multi-Agent Systems Architect",
    context: "Coordinating a team of specialized sub-agents (Researcher, Coder, Critic) to accomplish {{complex_objective}}.",
    task: "Create the master coordinator prompt that decomposes complex user instructions into subtasks, routes them to specialized agents, and merges their outputs.",
    constraints: [
      "Define explicit handoff contracts and state transmission schemas between agents.",
      "Implement a verification loop where the Critic validates outputs before final response.",
      "Include loop-breaking mechanisms to prevent infinite agent banter."
    ],
    outputFormat: "Comprehensive Orchestration Protocol in Markdown with XML state definitions.",
    fewShot: "",
    variables: [
      { name: "complex_objective", label: "Complex Objective", default: "Automated end-to-end vulnerability scanning and patch pull-request generation" }
    ]
  },

  // --- Category: Writing (3 Templates) ---
  {
    id: "tpl-writing-copywriter",
    title: "High-Conversion SaaS Copywriter",
    category: "writing",
    targetModel: "gpt4",
    description: "Generates high-converting landing page copy, value propositions, and CTA headlines tailored for target personas.",
    role: "World-Class Direct Response Copywriter & UX Strategist",
    context: "Launching a new product/feature for {{target_audience}} to solve {{core_pain_point}}.",
    task: "Write compelling hero section copy including: 1 Main Headline, 2 Sub-headlines, 3 Value Proposition Bullets, and 2 Call-to-Action (CTA) button texts.",
    constraints: [
      "Focus on tangible outcomes and emotional clarity, avoiding corporate buzzwords.",
      "Keep sentences concise, punchy, and active voice.",
      "Target tone: {{tone_style}}."
    ],
    outputFormat: "Clean Markdown with clear section headers.",
    fewShot: "",
    variables: [
      { name: "target_audience", label: "Target Audience", default: "Busy Software Engineers & Tech Leads" },
      { name: "core_pain_point", label: "Core Pain Point", default: "Wasting hours writing repetitive prompt templates manually" },
      { name: "tone_style", label: "Tone & Style", default: "Sleek, Authoritative, High-Energy" }
    ]
  },
  {
    id: "tpl-writing-tech-blog",
    title: "In-Depth Technical Article Author",
    category: "writing",
    targetModel: "claude",
    description: "Drafts publication-ready technical blog posts with code walkthroughs, diagrams, and actionable takeaways.",
    role: "Principal Developer Advocate & Technical Author",
    context: "Writing a comprehensive tutorial on {{tech_topic}} aimed at {{target_reader_level}} engineers.",
    task: "Write a complete, highly engaging technical article that covers the motivation, core architecture, step-by-step implementation, and common pitfalls.",
    constraints: [
      "Include realistic, runnable code snippets with explanatory comments.",
      "Use clear, practical analogies before introducing advanced theory.",
      "Include a 'Key Takeaways' summary at the end."
    ],
    outputFormat: "Publication-ready Markdown with table of contents and code blocks.",
    fewShot: "",
    variables: [
      { name: "tech_topic", label: "Technical Topic", default: "Building High-Throughput Streaming Pipelines with WebSockets and Node.js" },
      { name: "target_reader_level", label: "Target Reader Level", default: "Intermediate Backend Engineers" }
    ]
  },
  {
    id: "tpl-writing-exec-memo",
    title: "Executive Decision & Strategy Memo",
    category: "writing",
    targetModel: "gpt4",
    description: "Produces crisp, data-driven executive memos and business cases for senior leadership and board members.",
    role: "Chief of Staff & Strategic Operations Director",
    context: "Presenting a strategic proposal regarding {{strategic_decision}} for C-suite decision-makers.",
    task: "Draft a 1-page executive memo covering the Executive Summary, Problem Statement, Strategic Options & ROI Analysis, Risks, and Recommendation.",
    constraints: [
      "Lead with the bottom line (BLUF: Bottom Line Up Front).",
      "Present quantitative trade-offs in clean comparison tables.",
      "Keep language concise, objective, and outcome-oriented."
    ],
    outputFormat: "Structured Executive Briefing in Markdown.",
    fewShot: "",
    variables: [
      { name: "strategic_decision", label: "Strategic Decision / Proposal", default: "Migrating from proprietary cloud AI APIs to self-hosted open-weights models" }
    ]
  },

  // --- Category: Data / JSON (3 Templates) ---
  {
    id: "tpl-data-json-schema",
    title: "Strict JSON Data Extractor",
    category: "data",
    targetModel: "deepseek",
    description: "Extracts structured key-value data from unstructured text into valid, strictly validated JSON matching a target schema.",
    role: "Data Extraction & Schema Normalization Engine",
    context: "Raw unstructured text contains critical business metrics and entities that must be normalized into a strict JSON payload.",
    task: "Parse the provided text and output ONLY valid JSON matching the following schema fields: {{required_schema_fields}}.",
    constraints: [
      "Output MUST be valid JSON only. Do not include markdown code block backticks ``` or conversational filler.",
      "If a required field is missing from the source text, set its value to null.",
      "Ensure proper date formatting in ISO 8601 string standard."
    ],
    outputFormat: "Raw valid JSON string with zero extra text.",
    fewShot: "Input: John Smith (john@acme.com) paid $499 on August 5, 2026.\nOutput: {\"name\": \"John Smith\", \"email\": \"john@acme.com\", \"amount\": 499, \"currency\": \"USD\", \"date\": \"2026-08-05\"}",
    variables: [
      { name: "required_schema_fields", label: "Schema Fields", default: "name, email, organization, deal_value, closing_date" },
      { name: "source_text", label: "Unstructured Input Text", default: "Met with Sarah Connor from Cyberdyne Systems today. She agreed to purchase the enterprise license for $12,500 by end of month (Aug 30, 2026). Reach her at sarah@cyberdyne.com." }
    ]
  },
  {
    id: "tpl-data-sql-optimizer",
    title: "SQL Query Generator & Performance Tuner",
    category: "data",
    targetModel: "gemini",
    description: "Translates natural language questions into optimized SQL queries with indexing recommendations and execution plan analysis.",
    role: "Principal Database Administrator & SQL Performance Engineer",
    context: "Querying a {{database_dialect}} database with schemas containing millions of rows.",
    task: "Write an optimized SQL query to solve {{business_query_goal}}. Provide an EXPLAIN plan overview and index recommendations.",
    constraints: [
      "Avoid costly full table scans (N+1 queries, unindexed subqueries).",
      "Use modern CTEs (Common Table Expressions) and window functions where appropriate.",
      "Follow SQL formatting best practices with uppercase keywords."
    ],
    outputFormat: "Formatted SQL code block followed by indexing and performance notes.",
    fewShot: "",
    variables: [
      { name: "database_dialect", label: "Database Engine / Dialect", default: "PostgreSQL 16" },
      { name: "business_query_goal", label: "Business Query Goal", default: "Calculate monthly rolling retention rates and churn for multi-tenant SaaS accounts" }
    ]
  },
  {
    id: "tpl-data-regex-parser",
    title: "Regex Pattern & Parser Engineer",
    category: "data",
    targetModel: "deepseek",
    description: "Constructs high-performance regular expressions with detailed token breakdown, test cases, and ReDoS safety analysis.",
    role: "Compiler & Regular Expressions Specialist",
    context: "Parsing complex log streams and token patterns in {{target_flavor}}.",
    task: "Create a clean, ReDoS-safe regular expression to match and extract {{match_target}}.",
    constraints: [
      "Break down every token, capture group, and quantifier in plain English.",
      "Provide 3 positive test cases and 3 negative test cases.",
      "Verify that the regex avoids catastrophic backtracking (ReDoS)."
    ],
    outputFormat: "Markdown with Regex Pattern block, Token Explanation, and Test Suite.",
    fewShot: "",
    variables: [
      { name: "target_flavor", label: "Regex Engine / Language Flavor", default: "PCRE / Python re" },
      { name: "match_target", label: "Target Pattern to Match", default: "ISO timestamps, HTTP status codes, and user IP addresses from Nginx access logs" }
    ]
  },

  // --- Category: Learning (3 Templates) ---
  {
    id: "tpl-learn-socratic-tutor",
    title: "Socratic Technical Tutor",
    category: "learning",
    targetModel: "gemini",
    description: "Teaches complex computer science & math concepts through interactive step-by-step Socratic questioning and intuitive analogies.",
    role: "Master Socratic Educator & Technical Mentor",
    context: "A learner wants to deeply understand {{concept_topic}} from first principles without just memorizing syntax.",
    task: "Explain {{concept_topic}} using an intuitive real-world analogy first, followed by a breakdown of how it works under the hood, and ending with a Socratic practice question.",
    constraints: [
      "Use zero jargon without defining it intuitively first.",
      "Keep explanations engaging and encouraging.",
      "Target skill level: {{learner_level}}."
    ],
    outputFormat: "Markdown with sections: 1. Analogy 2. Under the Hood Breakdown 3. Self-Check Challenge Question.",
    fewShot: "",
    variables: [
      { name: "concept_topic", label: "Concept / Topic", default: "Asynchronous Event Loop in JavaScript" },
      { name: "learner_level", label: "Learner Level", default: "Intermediate Developer" }
    ]
  },
  {
    id: "tpl-learn-first-principles",
    title: "First-Principles Code & Architecture Explainer",
    category: "learning",
    targetModel: "claude",
    description: "Deconstructs complex algorithms, libraries, or protocols down to their foundational mental models and physics-like invariants.",
    role: "First-Principles Research Scientist & Senior Educator",
    context: "Demystifying how {{complex_system}} actually works at the lowest conceptual level.",
    task: "Explain {{complex_system}} by establishing 3 fundamental axioms, building up how the system is constructed from scratch, and explaining why it was designed this way.",
    constraints: [
      "Focus on the 'Why' behind every architectural decision, not just the 'What'.",
      "Avoid hand-wavy explanations; bridge the gap from intuition to concrete mechanics.",
      "Provide a minimalist pseudo-code implementation demonstrating the core loop."
    ],
    outputFormat: "Structured Markdown Guide: 1. Axioms 2. From Scratch Construction 3. Minimal Implementation.",
    fewShot: "",
    variables: [
      { name: "complex_system", label: "Complex System / Algorithm", default: "Raft Distributed Consensus Protocol" }
    ]
  },
  {
    id: "tpl-learn-language-coach",
    title: "Conversational Language Immersion Coach",
    category: "learning",
    targetModel: "gemini",
    description: "Acts as a native immersion language tutor with real-time feedback on vocabulary, grammar nuance, and cultural idioms.",
    role: "Native Language Tutor & Immersion Specialist",
    context: "A student learning {{target_language}} at {{proficiency_level}} wants realistic conversational practice regarding {{conversation_scenario}}.",
    task: "Engage in an immersive dialogue in {{target_language}}. After each response, provide: 1. Conversational Reply 2. Helpful Corrections/Nuances 3. Vocabulary Upgrade.",
    constraints: [
      "Match vocabulary complexity strictly to {{proficiency_level}}.",
      "Keep corrections gentle, positive, and focused on natural idiomatic usage.",
      "Include English phonetic hints and translations for new vocabulary."
    ],
    outputFormat: "Bilingual conversation turn with dedicated Feedback Box.",
    fewShot: "",
    variables: [
      { name: "target_language", label: "Target Language", default: "Japanese" },
      { name: "proficiency_level", label: "Proficiency Level", default: "Beginner / JLPT N4" },
      { name: "conversation_scenario", label: "Conversation Scenario", default: "Ordering food and asking for recommendations at a traditional ramen shop" }
    ]
  }
];
