// ==========================================================================
// Prompt Helper — Curated Prompt Chain Starter Templates (chains.js)
// ==========================================================================

const BUILTIN_CHAINS = [
  {
    id: "research-brief",
    title: "📝 Research & Executive Briefing Chain",
    description: "3-step pipeline: Extracts core facts, synthesizes an executive decision memo, and conducts a devil's advocate risk review.",
    steps: [
      {
        id: "step-1",
        name: "Fact Extraction & Core Outlining",
        targetModel: "gemini",
        role: "Senior Research Analyst & Data Synthesizer",
        task: "Analyze the provided source material on {{topic_or_notes}}. Extract key data points, core arguments, timeline milestones, and unresolved questions into clear, structured bullet points.",
        constraints: "Do not speculate or add ungrounded claims.\nGroup findings by theme.\nHighlight statistical metrics.",
        outputFormat: "Structured bullet points with category headers.",
        variables: [
          {
            name: "topic_or_notes",
            label: "Topic Notes / Raw Data",
            default: "Q3 Customer Retention Metrics: Overall churn dropped by 2.4%, but enterprise tier cancellations increased by 8% due to missing SSO and RBAC features. Customer support ticket resolution times averaged 14 hours."
          }
        ],
        output: ""
      },
      {
        id: "step-2",
        name: "Executive Decision Memo Draft",
        targetModel: "claude",
        role: "Chief of Staff & Strategic Communications Director",
        task: "Using the extracted research findings below, draft an executive decision memo for company leadership recommending prioritized action items:\n\n=== EXTRACTED RESEARCH FINDINGS ===\n{{step1_output}}",
        constraints: "Keep memo under 350 words.\nInclude clear Problem, Options Evaluated, and Final Recommendation sections.\nMaintain an objective, decisive tone.",
        outputFormat: "Professional markdown executive memo.",
        variables: [],
        output: ""
      },
      {
        id: "step-3",
        name: "Risk Assessment & Counter-Measures",
        targetModel: "deepseek",
        role: "Principal Risk Auditor & Devil's Advocate Critic",
        task: "Review the proposed executive memo below. Identify 3 potential operational risks, edge cases, or counter-arguments that leadership or stakeholders might raise, and provide concrete mitigation counter-measures for each:\n\n=== DRAFT EXECUTIVE MEMO ===\n{{step2_output}}",
        constraints: "Think step-by-step through execution vulnerabilities.\nProvide actionable, realistic mitigations.",
        outputFormat: "Numbered list of 3 Risks with paired Mitigation Strategies.",
        variables: [],
        output: ""
      }
    ]
  },
  {
    id: "code-tests",
    title: "💻 Developer Clean Architecture & Test Suite Chain",
    description: "3-step pipeline: Designs type contracts & architecture, produces hardened implementation, and generates automated test suites.",
    steps: [
      {
        id: "step-1",
        name: "Architecture & Interface Contract Design",
        targetModel: "claude",
        role: "Principal Software Architect",
        task: "Design the interface, data structures, error boundaries, and type contracts for a {{feature_description}} in {{programming_language}}. Outline critical edge cases before implementation.",
        constraints: "Provide complete TypeScript/type signatures.\nDocument all expected exceptions and failure modes.",
        outputFormat: "Structured markdown with interface code blocks.",
        variables: [
          {
            name: "feature_description",
            label: "Feature Description",
            default: "Rate limiter middleware with sliding window log algorithm and distributed Redis cache backend"
          },
          {
            name: "programming_language",
            label: "Programming Language",
            default: "TypeScript / Node.js"
          }
        ],
        output: ""
      },
      {
        id: "step-2",
        name: "Hardened Production Implementation",
        targetModel: "claude",
        role: "Senior Backend Engineer",
        task: "Implement the complete, production-grade code based on the architecture specification below:\n\n=== ARCHITECTURE SPECIFICATION ===\n{{step1_output}}",
        constraints: "Include comprehensive error handling, input validation, and defensive programming.\nNo placeholder comments or missing logic.",
        outputFormat: "Clean, syntax-highlighted code block.",
        variables: [],
        output: ""
      },
      {
        id: "step-3",
        name: "Automated Unit & Edge Case Test Suite",
        targetModel: "gemini",
        role: "Quality Assurance Lead & Test Automation Engineer",
        task: "Generate a complete unit test suite testing all happy paths, boundary conditions, concurrency limits, and mock failure states for the implementation below:\n\n=== SOURCE IMPLEMENTATION ===\n{{step2_output}}",
        constraints: "Use modern standard testing frameworks (e.g. Jest / Vitest / PyTest).\nAchieve 100% edge case coverage with mock assertions.",
        outputFormat: "Complete runnable test file.",
        variables: [],
        output: ""
      }
    ]
  },
  {
    id: "marketing-launch",
    title: "🎯 Multi-Channel Marketing Campaign Sequence",
    description: "3-step pipeline: Defines target audience persona & value proposition, crafts high-converting ad hooks, and writes an email nurture sequence.",
    steps: [
      {
        id: "step-1",
        name: "Audience Persona & Core Value Proposition",
        targetModel: "gemini",
        role: "Product Marketing Director & Consumer Psychologist",
        task: "Define the primary buyer persona, top 3 emotional pain points, and core value proposition for {{product_service}} targeting {{target_audience}}.",
        constraints: "Focus on psychological triggers and specific friction points.\nIdentify what differentiates this product from alternatives.",
        outputFormat: "Structured persona brief with bulleted pain points.",
        variables: [
          {
            name: "product_service",
            label: "Product / Service Name",
            default: "Prompt Helper Studio — AI Prompt Engineering Workbench"
          },
          {
            name: "target_audience",
            label: "Target Audience",
            default: "Software Engineers, Content Creators, and AI Product Managers"
          }
        ],
        output: ""
      },
      {
        id: "step-2",
        name: "High-Converting Ad Hooks & Hero Copy",
        targetModel: "claude",
        role: "World-Class Direct Response Copywriter",
        task: "Using the audience profile and value propositions below, write 5 high-converting ad hooks (for LinkedIn/X) and a compelling landing page Hero headline + sub-headline + CTA pairing:\n\n=== AUDIENCE PROFILE & VALUE PROPOSITION ===\n{{step1_output}}",
        constraints: "Hook readers in the first 8 words.\nAvoid corporate jargon; use punchy, benefit-driven language.",
        outputFormat: "Numbered list of 5 ad hooks + Hero section copy.",
        variables: [],
        output: ""
      },
      {
        id: "step-3",
        name: "3-Part Automated Email Nurture Sequence",
        targetModel: "gemini",
        role: "Lifecycle Email Marketing Specialist",
        task: "Write a 3-part automated email nurture sequence (Day 1: Welcome & Value, Day 3: Case Study & Proof, Day 5: Irresistible Call-to-Action) continuing the messaging and hooks developed below:\n\n=== CAMPAIGN HOOKS & HEADLINES ===\n{{step2_output}}",
        constraints: "Include compelling Subject Lines, Preview Text, and standard email sign-offs.\nKeep emails under 200 words each.",
        outputFormat: "3 complete formatted emails with Subject Lines and CTAs.",
        variables: [],
        output: ""
      }
    ]
  }
];
