// ==========================================================================
// Prompt Helper — Main Application State & Logic Manager
// ==========================================================================

/**
 * @typedef {Object} PromptDraft
 * @property {string} role System instructions or persona definition
 * @property {string} context Background information or reference material
 * @property {string} task Core objective and task description
 * @property {string} constraints Negative guardrails and output restrictions
 * @property {string} outputFormat Desired output structure or schema
 * @property {string} fewShot Example inputs and expected responses
 * @property {string} rawText Raw Markdown content when editing in raw mode
 */

/**
 * @typedef {Object} VariableItem
 * @property {string} name Unique variable identifier (e.g. "target_audience")
 * @property {string} label Human-readable input label
 * @property {string} default Default placeholder value
 */

/**
 * @typedef {Object} TemplateItem
 * @property {string} id Unique template ID
 * @property {string} title Display name of the template
 * @property {string} description Brief summary of what the template accomplishes
 * @property {string} category Category classification (e.g. "writing", "coding")
 * @property {string} [role] System persona
 * @property {string} [context] Background context
 * @property {string} [task] Task instructions
 * @property {string|string[]} [constraints] Guardrails
 * @property {string} [outputFormat] Output format
 * @property {string} [fewShot] Example demonstration
 * @property {VariableItem[]} [variables] Array of placeholder variables
 * @property {string} [targetModel] Suggested target LLM
 * @property {number} [rating] 1-5 star user quality rating
 * @property {string} [notes] User performance notes
 */

/**
 * @typedef {Object} ChainStep
 * @property {string} id Step ID
 * @property {string} name Step title
 * @property {string} targetModel Assigned AI model
 * @property {string} role System persona for this step
 * @property {string} task Step instructions (may reference {{stepX_output}})
 * @property {string} constraints Restrictions for this step
 * @property {string} outputFormat Desired step output format
 * @property {VariableItem[]} variables Step-specific variables
 * @property {string} output Captured AI response
 */

/**
 * @typedef {Object} HistoryItem
 * @property {string} id Unique history entry ID
 * @property {string} timestamp Formatted timestamp
 * @property {string} title Snapshot label
 * @property {string} model Target model used
 * @property {string} modelId Specific model ID string
 * @property {string} studioMode "form" or "raw"
 * @property {PromptDraft} prompt Complete prompt state snapshot
 * @property {Record<string, string>} variableValues Variable values at save time
 * @property {string} assembledText Compiled prompt string
 */

document.addEventListener('DOMContentLoaded', () => {

  // --- Safe Storage & Error Boundary Utilities ---
  /**
   * Safe localStorage wrapper that catches QuotaExceededError and private-browsing security errors.
   * Gracefully degrades with console warnings rather than throwing unhandled fatal exceptions.
   */
  const SafeStorage = {
    /**
     * Safely retrieves an item from localStorage.
     * @param {string} key Storage key
     * @param {string|null} [defaultValue=null] Fallback value if retrieval fails or key is missing
     * @returns {string|null}
     */
    getItem(key, defaultValue = null) {
      try {
        const val = localStorage.getItem(key);
        return val !== null ? val : defaultValue;
      } catch (err) {
        console.warn(`[SafeStorage] Failed to read "${key}" from localStorage:`, err);
        return defaultValue;
      }
    },

    /**
     * Safely stores a string item into localStorage.
     * @param {string} key Storage key
     * @param {string} value Value to store
     * @returns {boolean} True if successfully stored, false otherwise
     */
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (err) {
        console.warn(`[SafeStorage] Failed to write "${key}" to localStorage:`, err);
        if (err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22)) {
          console.error('[SafeStorage] Storage quota exceeded. Attempting self-healing history prune.');
          try {
            const rawHist = localStorage.getItem('ph_history');
            if (rawHist) {
              const parsed = JSON.parse(rawHist);
              if (Array.isArray(parsed) && parsed.length > 15) {
                localStorage.setItem('ph_history', JSON.stringify(parsed.slice(0, 15)));
                localStorage.setItem(key, value);
                return true;
              }
            }
          } catch (pruneErr) {
            console.error('[SafeStorage] Self-healing storage prune failed:', pruneErr);
          }
        }
        return false;
      }
    },

    /**
     * Safely removes an item from localStorage.
     * @param {string} key Storage key
     */
    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch (err) {
        console.warn(`[SafeStorage] Failed to remove "${key}" from localStorage:`, err);
      }
    },

    /**
     * Safely parses a JSON string with a fallback default value.
     * @template T
     * @param {string|null} raw JSON string
     * @param {T} fallback Fallback value if parsing fails
     * @returns {T}
     */
    parseJson(raw, fallback) {
      if (!raw || typeof raw !== 'string') return fallback;
      try {
        return JSON.parse(raw);
      } catch (err) {
        console.warn('[SafeStorage] JSON parse error, returning fallback value:', err);
        return fallback;
      }
    },

    /**
     * Calculates the total bytes and formatted KB currently utilized by Prompt Helper localStorage keys.
     * @returns {{bytes: number, kb: string}}
     */
    getStorageUsage() {
      let totalBytes = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('ph_')) {
            const val = localStorage.getItem(key) || '';
            totalBytes += (key.length + val.length) * 2;
          }
        }
      } catch (err) {
        console.warn('[SafeStorage] Could not calculate storage usage:', err);
      }
      return {
        bytes: totalBytes,
        kb: (totalBytes / 1024).toFixed(1) + ' KB'
      };
    },

    /**
     * Purges all prompt drafts, vault items, history records, and preferences stored in localStorage.
     * @returns {boolean} True if successfully cleared
     */
    clearAllPromptHelperData() {
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('ph_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        return true;
      } catch (err) {
        console.warn('[SafeStorage] Storage purge encountered error:', err);
        return false;
      }
    }
  };

  // --- State Initialization ---
  const state = {
    theme: SafeStorage.getItem('ph_theme', 'cyberpunk'),
    devMode: SafeStorage.getItem('ph_dev_mode') === 'true',
    colorblindMode: SafeStorage.getItem('ph_colorblind_mode') === 'true',
    viewMode: SafeStorage.getItem('ph_view_mode', 'wizard'), // 'wizard' or 'full'
    wizardStep: 1,
    selectedTone: null,
    selectedToneRule: '',
    rolePresetIndex: -1,
    activeTab: 'tab-studio',
    targetModel: 'gemini',
    studioMode: 'form', // 'form' or 'raw'
    exportType: 'markdown',
    vault: SafeStorage.parseJson(SafeStorage.getItem('ph_vault'), []),
    history: SafeStorage.parseJson(SafeStorage.getItem('ph_history'), []),
    selectedHistoryIndex: -1,

    variableValues: {},
    directoryHandle: null,
    vaultFileHandles: {},
    currentPrompt: {
      role: '',
      context: '',
      task: '',
      constraints: '',
      outputFormat: '',
      fewShot: '',
      rawText: ''
    },
    activeChain: null
  };

  // --- DOM Elements ---
  const dom = {
    // Navigation & Header
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    themeIcon: document.getElementById('themeIcon'),
    themeText: document.getElementById('themeText'),
    openSettingsModalBtn: document.getElementById('openSettingsModalBtn'),
    closeSettingsModalBtn: document.getElementById('closeSettingsModalBtn'),
    settingsModal: document.getElementById('settingsModal'),
    openShortcutsModalBtn: document.getElementById('openShortcutsModalBtn'),
    closeShortcutsModalBtn: document.getElementById('closeShortcutsModalBtn'),
    shortcutsModal: document.getElementById('shortcutsModal'),
    devModeCheckbox: document.getElementById('devModeCheckbox'),
    colorblindModeCheckbox: document.getElementById('colorblindModeCheckbox'),
    quickStartGuideCheckbox: document.getElementById('quickStartGuideCheckbox'),
    storageSizeLabel: document.getElementById('storageSizeLabel'),
    clearAllStorageBtn: document.getElementById('clearAllStorageBtn'),
    modelSelect: document.getElementById('modelSelect'),
    modelIdInput: document.getElementById('modelIdInput'),
    navItems: document.querySelectorAll('.nav-item'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    // Studio Mode Pills & Views
    wizardToggleGroup: document.getElementById('wizardToggleGroup'),
    viewStepPill: document.getElementById('viewStepPill'),
    viewFullPill: document.getElementById('viewFullPill'),
    modeFormPill: document.getElementById('modeFormPill'),
    modeRawPill: document.getElementById('modeRawPill'),
    formBuilderView: document.getElementById('formBuilderView'),
    rawMarkdownView: document.getElementById('rawMarkdownView'),
    
    // Step Sections
    stepSection1: document.getElementById('stepSection1'),
    stepSection2: document.getElementById('stepSection2'),
    stepSection3: document.getElementById('stepSection3'),
    
    // Wizard Controls
    wizardControls: document.getElementById('wizardControls'),
    wizardBackBtn: document.getElementById('wizardBackBtn'),
    wizardNextBtn: document.getElementById('wizardNextBtn'),
    progressDots: document.querySelectorAll('.wizard-progress-dots .progress-dot'),
    
    // Form Inputs
    promptRole: document.getElementById('promptRole'),
    promptContext: document.getElementById('promptContext'),
    promptTask: document.getElementById('promptTask'),
    promptConstraints: document.getElementById('promptConstraints'),
    promptOutputFormat: document.getElementById('promptOutputFormat'),
    promptFewShot: document.getElementById('promptFewShot'),
    rawMarkdownTextarea: document.getElementById('rawMarkdownTextarea'),
    insertRolePreset: document.getElementById('insertRolePreset'),
    
    // Dynamic Fillers
    variablesFillingPanel: document.getElementById('variablesFillingPanel'),
    dynamicVariableInputs: document.getElementById('dynamicVariableInputs'),
    
    // Preview & Actions
    promptLivePreview: document.getElementById('promptLivePreview'),
    modelExplanationBanner: document.getElementById('modelExplanationBanner'),
    statTokens: document.getElementById('statTokens'),
    statWords: document.getElementById('statWords'),
    statReadTime: document.getElementById('statReadTime'),
    statHealthBadge: document.getElementById('statHealthBadge'),
    enhancePromptBtn: document.getElementById('enhancePromptBtn'),
    copyPromptBtn: document.getElementById('copyPromptBtn'),
    headerCopyPromptBtn: document.getElementById('headerCopyPromptBtn'),
    draftSavedStatus: document.getElementById('draftSavedStatus'),
    
    // Template Hub
    templateSearchInput: document.getElementById('templateSearchInput'),
    categoryPills: document.querySelectorAll('.cat-pill[data-category]'),
    templateGridContainer: document.getElementById('templateGridContainer'),
    
    // Vault
    vaultGridContainer: document.getElementById('vaultGridContainer'),
    saveCurrentPromptBtn: document.getElementById('saveCurrentPromptBtn'),
    connectFolderBtn: document.getElementById('connectFolderBtn'),
    connectFolderBtnVault: document.getElementById('connectFolderBtnVault'),
    vaultSyncStatus: document.getElementById('vaultSyncStatus'),
    vaultReconnectBanner: document.getElementById('vaultReconnectBanner'),
    vaultLastFolderName: document.getElementById('vaultLastFolderName'),
    reconnectFolderBtn: document.getElementById('reconnectFolderBtn'),
    dismissReconnectFolderBtn: document.getElementById('dismissReconnectFolderBtn'),
    vaultSearchInput: document.getElementById('vaultSearchInput'),
    vaultSortSelect: document.getElementById('vaultSortSelect'),
    vaultFilterPills: document.querySelectorAll('.vault-filter-pills .cat-pill'),
    
    // Save to Vault Modal
    savePromptModal: document.getElementById('savePromptModal'),
    savePromptTitleInput: document.getElementById('savePromptTitleInput'),
    savePromptDescInput: document.getElementById('savePromptDescInput'),
    savePromptRatingGroup: document.getElementById('savePromptRatingGroup'),
    savePromptRatingText: document.getElementById('savePromptRatingText'),
    savePromptNotesInput: document.getElementById('savePromptNotesInput'),
    savePromptConfirmBtn: document.getElementById('savePromptConfirmBtn'),
    savePromptCancelBtn: document.getElementById('savePromptCancelBtn'),
    closeSavePromptModalBtn: document.getElementById('closeSavePromptModalBtn'),
    saveCategoryPills: document.querySelectorAll('#saveCategoryPills .cat-pill'),
    
    // Prompt Chain Builder
    chainPresetSelect: document.getElementById('chainPresetSelect'),
    addChainStepBtn: document.getElementById('addChainStepBtn'),
    exportChainBtn: document.getElementById('exportChainBtn'),
    resetChainBtn: document.getElementById('resetChainBtn'),
    chainTrackerBar: document.getElementById('chainTrackerBar'),
    chainStepsContainer: document.getElementById('chainStepsContainer'),
    
    // Health & Analytics
    healthChecklistContainer: document.getElementById('healthChecklistContainer'),
    

    
    // Export Modal
    openExportModalBtn: document.getElementById('openExportModalBtn'),
    exportModal: document.getElementById('exportModal'),
    closeExportModalBtn: document.getElementById('closeExportModalBtn'),
    exportOptionsTabs: document.querySelectorAll('.export-options-tabs .cat-pill'),
    exportFormattedCode: document.getElementById('exportFormattedCode'),
    copyExportCodeBtn: document.getElementById('copyExportCodeBtn'),
    downloadExportFileBtn: document.getElementById('downloadExportFileBtn'),
    
    // History Modal
    openHistoryModalBtn: document.getElementById('openHistoryModalBtn'),
    historyModal: document.getElementById('historyModal'),
    closeHistoryModalBtn: document.getElementById('closeHistoryModalBtn'),
    saveVersionBtn: document.getElementById('saveVersionBtn'),
    cleanHistoryBtn: document.getElementById('cleanHistoryBtn'),
    versionListContainer: document.getElementById('versionListContainer'),
    restoreVersionBtn: document.getElementById('restoreVersionBtn'),
    diffTitle: document.getElementById('diffTitle'),
    diffOutputContainer: document.getElementById('diffOutputContainer'),
    

    // Command Palette Elements
    commandPalette: document.getElementById('commandPalette'),
    commandPaletteInput: document.getElementById('commandPaletteInput'),
    commandPaletteList: document.getElementById('commandPaletteList'),
    
    // Token Breakdown Elements
    tokenBreakdownBar: document.getElementById('tokenBreakdownBar'),
    tokenBreakdownLegend: document.getElementById('tokenBreakdownLegend'),
    
    // Drop Overlay Element
    dropOverlay: document.getElementById('dropOverlay'),

    // In-App Confirm Modal Elements
    confirmModal: document.getElementById('confirmModal'),
    confirmModalTitle: document.getElementById('confirmModalTitle'),
    confirmModalMessage: document.getElementById('confirmModalMessage'),
    confirmModalCancelBtn: document.getElementById('confirmModalCancelBtn'),
    confirmModalActionBtn: document.getElementById('confirmModalActionBtn'),
    closeConfirmModalBtn: document.getElementById('closeConfirmModalBtn'),

    // In-App Input Prompt Modal Elements
    inputPromptModal: document.getElementById('inputPromptModal'),
    inputPromptModalTitle: document.getElementById('inputPromptModalTitle'),
    inputPromptModalMessage: document.getElementById('inputPromptModalMessage'),
    inputPromptModalInput: document.getElementById('inputPromptModalInput'),
    inputPromptModalCancelBtn: document.getElementById('inputPromptModalCancelBtn'),
    inputPromptModalSubmitBtn: document.getElementById('inputPromptModalSubmitBtn'),
    closeInputPromptModalBtn: document.getElementById('closeInputPromptModalBtn'),

    // Welcome Banner Elements
    welcomeBanner: document.getElementById('welcomeBanner'),
    dismissWelcomeBtn: document.getElementById('dismissWelcomeBtn'),
    surpriseMePromptBtn: document.getElementById('surpriseMePromptBtn'),
    surpriseMeIcon: document.getElementById('surpriseMeIcon'),
    loadExamplePromptBtn: document.getElementById('loadExamplePromptBtn'),
    exploreTemplatesBtn: document.getElementById('exploreTemplatesBtn'),
    disableWelcomeCheckbox: document.getElementById('disableWelcomeCheckbox'),
    
    // Prompt Compression & Token Optimizer Elements
    openCompressModalBtn: document.getElementById('openCompressModalBtn'),
    compressModal: document.getElementById('compressModal'),
    closeCompressModalBtn: document.getElementById('closeCompressModalBtn'),
    statCompressWrapper: document.getElementById('statCompressWrapper'),
    statCompressChip: document.getElementById('statCompressChip'),
    statCompressSavingsText: document.getElementById('statCompressSavingsText'),
    compressOriginalTokens: document.getElementById('compressOriginalTokens'),
    compressOptimizedTokens: document.getElementById('compressOptimizedTokens'),
    compressSavedTokens: document.getElementById('compressSavedTokens'),
    compressSavedWords: document.getElementById('compressSavedWords'),
    compressOptionFluff: document.getElementById('compressOptionFluff'),
    compressOptionPhrases: document.getElementById('compressOptionPhrases'),
    compressOptionWhitespace: document.getElementById('compressOptionWhitespace'),
    compressDiffContainer: document.getElementById('compressDiffContainer'),
    compressRuleMatchCount: document.getElementById('compressRuleMatchCount'),
    compressCancelBtn: document.getElementById('compressCancelBtn'),
    compressApplyBtn: document.getElementById('compressApplyBtn'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
  };

  // --- Global Constants & Rule Mandates ---
  // --- Global Constants & State Variables ---
  const MAX_VISIBLE_TOASTS = 3;
  const TRUST_RULE_1 = 'Do not hallucinate facts outside context.';
  const TRUST_RULE_2 = 'If unsure, explicitly state "Information unavailable".';

  const TEMPLATE_PAGE_SIZE = 8;
  let currentTemplatePage = 1;
  let hubFilteredTemplates = [];
  let templateObserver = null;

  let vaultSearchQuery = '';
  let vaultActiveFilter = 'all';
  let vaultSortOrder = 'newest';

  let selectedSaveCategory = 'writing';
  let savePromptRating = 0;

  let activeModalElement = null;
  let lastTriggerElement = null;

  let activePaletteIndex = 0;
  let filteredCommands = [];

  let gSequenceTimer = null;
  let isGSequenceActive = false;

  // --- Studio Draft Auto-Save Engine ---
  let autoSaveTimeout = null;

  /**
   * Schedules a debounced (500ms) auto-save of current studio draft state.
   */
  function triggerAutoSave() {
    if (dom.draftSavedStatus) {
      dom.draftSavedStatus.textContent = '⏳ Saving...';
      dom.draftSavedStatus.classList.add('saving');
    }

    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }

    autoSaveTimeout = setTimeout(() => {
      saveDraftToStorage();
    }, 500);
  }

  /**
   * Persists active prompt studio state to localStorage via SafeStorage error boundary.
   * @returns {boolean} True if successfully saved
   */
  function saveDraftToStorage() {
    const draft = {
      currentPrompt: state.currentPrompt,
      variableValues: state.variableValues,
      wizardStep: state.wizardStep,
      viewMode: state.viewMode,
      selectedTone: state.selectedTone,
      selectedToneRule: state.selectedToneRule,
      targetModel: state.targetModel,
      studioMode: state.studioMode,
      updatedAt: Date.now()
    };

    const success = SafeStorage.setItem('ph_studio_draft', JSON.stringify(draft));
    if (dom.draftSavedStatus) {
      if (success) {
        dom.draftSavedStatus.textContent = '✓ Saved';
        dom.draftSavedStatus.classList.remove('saving');
      } else {
        dom.draftSavedStatus.textContent = '⚠️ Storage full';
      }
    }
    return success;
  }

  /**
   * Restores previously saved studio draft state from localStorage.
   * @returns {boolean} True if draft was successfully parsed and hydrated
   */
  function loadDraftFromStorage() {
    const raw = SafeStorage.getItem('ph_studio_draft');
    if (!raw) return false;

    const draft = SafeStorage.parseJson(raw, null);
    if (!draft || typeof draft !== 'object') return false;

    if (draft.currentPrompt) {
      state.currentPrompt = Object.assign(state.currentPrompt, draft.currentPrompt);
    }
    if (draft.variableValues) {
      state.variableValues = Object.assign(state.variableValues, draft.variableValues);
    }
    if (draft.wizardStep) {
      state.wizardStep = draft.wizardStep;
    }
    if (draft.viewMode) {
      state.viewMode = draft.viewMode;
    }
    if (draft.selectedTone !== undefined) {
      state.selectedTone = draft.selectedTone;
      state.selectedToneRule = draft.selectedToneRule || '';
    }
    if (draft.targetModel) {
      state.targetModel = draft.targetModel;
    }
    if (draft.studioMode) {
      state.studioMode = draft.studioMode;
    }
    return true;
  }

  async function triggerSurpriseMePrompt() {
    if (typeof BUILTIN_TEMPLATES === 'undefined' || BUILTIN_TEMPLATES.length === 0) {
      showToast("No templates available to pick from!");
      return;
    }

    // Spin the dice icon
    const icon = dom.surpriseMeIcon || document.getElementById('surpriseMeIcon');
    if (icon) {
      icon.classList.remove('dice-spinning');
      void icon.offsetWidth;
      icon.classList.add('dice-spinning');
      setTimeout(() => icon.classList.remove('dice-spinning'), 700);
    }

    // Pick a random template, preferring one different from current prompt task
    const currentTask = (state.currentPrompt.task || '').toLowerCase();
    const candidates = BUILTIN_TEMPLATES.filter(t => !currentTask.includes((t.task || '').substring(0, 20).toLowerCase()));
    const pool = candidates.length > 0 ? candidates : BUILTIN_TEMPLATES;
    const randomTpl = pool[Math.floor(Math.random() * pool.length)];

    await loadTemplateIntoStudio(randomTpl);

    // Apply visual pulse highlight to key fields
    if (dom.promptTask) {
      dom.promptTask.classList.remove('field-loaded-highlight');
      void dom.promptTask.offsetWidth;
      dom.promptTask.classList.add('field-loaded-highlight');
      setTimeout(() => dom.promptTask.classList.remove('field-loaded-highlight'), 1600);
    }

    showToast(`🎲 Surprise Pick: Loaded "${randomTpl.title}"! Fill in the blanks or click Copy! 🚀`);
  }

  // --- First-Run & Quick-Start Guide Controller ---
  function initWelcomeBanner() {
    if (!dom.welcomeBanner) return;
    const disabled = SafeStorage.getItem('ph_quickstart_disabled') === 'true';

    if (dom.disableWelcomeCheckbox) {
      dom.disableWelcomeCheckbox.checked = disabled;
      dom.disableWelcomeCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        SafeStorage.setItem('ph_quickstart_disabled', isChecked ? 'true' : 'false');
        if (dom.quickStartGuideCheckbox) dom.quickStartGuideCheckbox.checked = !isChecked;
        if (isChecked) {
          dom.welcomeBanner.style.display = 'none';
          showToast("Quick-Start guide disabled.");
        } else {
          dom.welcomeBanner.style.display = 'block';
          showToast("Quick-Start guide enabled! ⚡");
        }
      });
    }

    if (dom.quickStartGuideCheckbox) {
      dom.quickStartGuideCheckbox.checked = !disabled;
      dom.quickStartGuideCheckbox.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        localStorage.setItem('ph_quickstart_disabled', isEnabled ? 'false' : 'true');
        if (dom.disableWelcomeCheckbox) dom.disableWelcomeCheckbox.checked = !isEnabled;
        if (isEnabled) {
          dom.welcomeBanner.style.display = 'block';
          showToast("Quick-Start Guide enabled! ⚡");
        } else {
          dom.welcomeBanner.style.display = 'none';
          showToast("Quick-Start Guide disabled.");
        }
      });
    }

    // Default display state based on setting
    if (!disabled) {
      dom.welcomeBanner.style.display = 'block';
    } else {
      dom.welcomeBanner.style.display = 'none';
    }

    if (dom.dismissWelcomeBtn) {
      dom.dismissWelcomeBtn.addEventListener('click', () => {
        dom.welcomeBanner.style.display = 'none';
        showToast("Quick-Start Guide closed. Reopen anytime in ⚙️ Settings.");
      });
    }

    if (dom.exploreTemplatesBtn) {
      dom.exploreTemplatesBtn.addEventListener('click', () => {
        const templatesNav = document.querySelector('.nav-item[data-tab="tab-templates"]');
        if (templatesNav) templatesNav.click();
      });
    }

    if (dom.surpriseMePromptBtn) {
      dom.surpriseMePromptBtn.addEventListener('click', triggerSurpriseMePrompt);
    }

    if (dom.loadExamplePromptBtn) {
      dom.loadExamplePromptBtn.addEventListener('click', async () => {
        const exampleTemplate = (typeof BUILTIN_TEMPLATES !== 'undefined' && BUILTIN_TEMPLATES.length > 0)
          ? (BUILTIN_TEMPLATES.find(t => t.id === 'exec-email') || BUILTIN_TEMPLATES[0])
          : null;
        if (exampleTemplate) {
          await loadTemplateIntoStudio(exampleTemplate);
          if (dom.promptTask) {
            dom.promptTask.classList.remove('field-loaded-highlight');
            void dom.promptTask.offsetWidth;
            dom.promptTask.classList.add('field-loaded-highlight');
            setTimeout(() => dom.promptTask.classList.remove('field-loaded-highlight'), 1600);
          }
          showToast(`✨ Loaded finished example: "${exampleTemplate.title}"! 🚀`);
        }
      });
    }

    // Attach click listeners to instant starter example pills
    document.querySelectorAll('.welcome-pill-btn').forEach(pill => {
      pill.addEventListener('click', async () => {
        const tplId = pill.getAttribute('data-template-id');
        if (typeof BUILTIN_TEMPLATES === 'undefined') return;
        const found = BUILTIN_TEMPLATES.find(t => t.id === tplId);
        if (found) {
          await loadTemplateIntoStudio(found);
          if (dom.promptTask) {
            dom.promptTask.classList.remove('field-loaded-highlight');
            void dom.promptTask.offsetWidth;
            dom.promptTask.classList.add('field-loaded-highlight');
            setTimeout(() => dom.promptTask.classList.remove('field-loaded-highlight'), 1600);
          }
          showToast(`✨ Loaded starter example: "${found.title}"! 🚀`);
        }
      });
    });
  }



  // --- Draft State Check Helper ---
  function isStudioDraftDirty() {
    const p = state.currentPrompt;
    return !!(
      (p.role && p.role.trim()) ||
      (p.context && p.context.trim()) ||
      (p.task && p.task.trim()) ||
      (p.constraints && p.constraints.trim()) ||
      (p.fewShot && p.fewShot.trim()) ||
      (p.rawText && p.rawText.trim())
    );
  }

  // --- Clear Step & Reset Controller ---
  function initClearStepHandlers() {
    document.querySelectorAll('.clear-step-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const stepNum = parseInt(btn.getAttribute('data-step') || (e.currentTarget && e.currentTarget.getAttribute('data-step')), 10);

        if (stepNum === 1) {
          state.currentPrompt.task = '';
          state.currentPrompt.constraints = '';
          state.currentPrompt.outputFormat = '';
          if (dom.promptTask) dom.promptTask.value = '';
          if (dom.promptConstraints) dom.promptConstraints.value = '';
          if (dom.promptOutputFormat) dom.promptOutputFormat.value = '';
          
          document.querySelectorAll('.guardrail-pill').forEach(p => p.classList.remove('active'));
        } 
        else if (stepNum === 2) {
          state.currentPrompt.role = '';
          state.currentPrompt.context = '';
          state.selectedTone = null;
          state.selectedToneRule = '';
          state.rolePresetIndex = -1;
          if (dom.promptRole) dom.promptRole.value = '';
          if (dom.promptContext) dom.promptContext.value = '';
          
          document.querySelectorAll('.tone-pill').forEach(p => p.classList.remove('active'));
        } 
        else if (stepNum === 3) {
          state.currentPrompt.fewShot = '';
          if (dom.promptFewShot) dom.promptFewShot.value = '';
        }

        initFormValues();
        updateLivePreview();
        showToast(`Cleared fields in Step ${stepNum}! 🧹`);
      });
    });

    const clearAllBtn = document.getElementById('clearAllStudioBtn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        if (isStudioDraftDirty()) {
          const confirmed = await showConfirmDialog({
            title: "Start Over?",
            message: "Are you sure you want to clear your current prompt? All in-progress inputs in the Studio will be reset.",
            confirmText: "🔄 Start Over",
            confirmClass: "btn-primary",
            icon: "🔄"
          });
          if (!confirmed) return;
        }

        state.wizardStep = 1;
        state.currentPrompt.role = '';
        state.currentPrompt.context = '';
        state.currentPrompt.task = '';
        state.currentPrompt.constraints = '';
        state.currentPrompt.outputFormat = '';
        state.currentPrompt.fewShot = '';
        state.currentPrompt.rawText = '';
        state.selectedTone = null;
        state.selectedToneRule = '';
        state.rolePresetIndex = -1;
        state.variableValues = {};

        if (dom.rawMarkdownTextarea) dom.rawMarkdownTextarea.value = '';
        document.querySelectorAll('.guardrail-pill').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tone-pill').forEach(p => p.classList.remove('active'));

        initFormValues();
        updateWizardUI();
        updateLivePreview();

        // Always show Quick-Start guide on Start Over unless user disabled it
        if (localStorage.getItem('ph_quickstart_disabled') !== 'true') {
          if (dom.welcomeBanner) {
            dom.welcomeBanner.style.display = 'block';
          }
        }

        showToast("Started over with a fresh, empty prompt! 🔄");
      });
    }
  }

  // --- Tone Preset Controller ---
  function initTonePresetHandlers() {
    document.querySelectorAll('.tone-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const tone = pill.getAttribute('data-tone');
        const rule = pill.getAttribute('data-rule');

        if (state.selectedTone === tone) {
          state.selectedTone = null;
          state.selectedToneRule = '';
          pill.classList.remove('active');
          showToast("Deactivated tone preset");
        } else {
          document.querySelectorAll('.tone-pill').forEach(p => p.classList.remove('active'));
          state.selectedTone = tone;
          state.selectedToneRule = rule;
          pill.classList.add('active');
          showToast(`Applied Tone: ${pill.textContent.trim()}`);
        }

        updateLivePreview();
      });
    });
  }

  function syncTonePillUI() {
    document.querySelectorAll('.tone-pill').forEach(pill => {
      const tone = pill.getAttribute('data-tone');
      if (state.selectedTone && state.selectedTone === tone) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }



  // --- Wizard Mode Controller ---
  function initWizard() {
    updateWizardUI();
    
    // View Switcher Handlers
    if (dom.viewStepPill && dom.viewFullPill) {
      dom.viewStepPill.addEventListener('click', () => {
        state.viewMode = 'wizard';
        localStorage.setItem('ph_view_mode', 'wizard');
        updateWizardUI();
        showToast("Switched to Step-by-Step Wizard Mode");
      });
      dom.viewFullPill.addEventListener('click', () => {
        state.viewMode = 'full';
        localStorage.setItem('ph_view_mode', 'full');
        updateWizardUI();
        showToast("Switched to Full Form Mode");
      });
    }

    // Wizard Next & Back Buttons
    if (dom.wizardBackBtn) {
      dom.wizardBackBtn.addEventListener('click', () => {
        if (state.wizardStep > 1) {
          state.wizardStep--;
          updateWizardUI();
          triggerAutoSave();
        }
      });
    }

    if (dom.wizardNextBtn) {
      dom.wizardNextBtn.addEventListener('click', () => {
        if (state.wizardStep < 3) {
          state.wizardStep++;
          updateWizardUI();
          triggerAutoSave();
        } else {
          // Finished step 3, navigate user focus to Prompt Health & Readiness
          showToast("Prompt steps complete! Check your prompt health and readiness below. 🔬");
          // Smooth scroll to evaluate section if possible
          const evaluateCard = document.getElementById('healthChecklistContainer');
          if (evaluateCard) {
            evaluateCard.scrollIntoView({ behavior: 'smooth' });
          }
        }
      });
    }

    // Dot Indicators Click Handlers
    dom.progressDots.forEach(dot => {
      dot.addEventListener('click', () => {
        if (state.viewMode === 'wizard') {
          state.wizardStep = parseInt(dot.getAttribute('data-step'), 10);
          updateWizardUI();
          triggerAutoSave();
        }
      });
    });
  }

  function updateWizardUI() {
    if (state.studioMode === 'raw') {
      // Hide wizard elements when raw text mode is selected
      if (dom.wizardToggleGroup) dom.wizardToggleGroup.style.display = 'none';
      if (dom.wizardControls) dom.wizardControls.style.display = 'none';
      return;
    }

    // Show wizard toggle group in form mode
    if (dom.wizardToggleGroup) dom.wizardToggleGroup.style.display = 'flex';

    if (state.viewMode === 'full') {
      // Full Form Mode: show all steps
      if (dom.viewFullPill) dom.viewFullPill.classList.add('active');
      if (dom.viewStepPill) dom.viewStepPill.classList.remove('active');
      
      if (dom.stepSection1) dom.stepSection1.style.display = 'block';
      if (dom.stepSection2) dom.stepSection2.style.display = 'block';
      if (dom.stepSection3) dom.stepSection3.style.display = 'block';
      if (dom.wizardControls) dom.wizardControls.style.display = 'none';
    } else {
      // Wizard Mode: show step-by-step
      if (dom.viewStepPill) dom.viewStepPill.classList.add('active');
      if (dom.viewFullPill) dom.viewFullPill.classList.remove('active');
      
      if (dom.wizardControls) dom.wizardControls.style.display = 'flex';

      // Hide all step sections first
      if (dom.stepSection1) dom.stepSection1.style.display = 'none';
      if (dom.stepSection2) dom.stepSection2.style.display = 'none';
      if (dom.stepSection3) dom.stepSection3.style.display = 'none';

      // Show current step section
      if (state.wizardStep === 1 && dom.stepSection1) dom.stepSection1.style.display = 'block';
      if (state.wizardStep === 2 && dom.stepSection2) dom.stepSection2.style.display = 'block';
      if (state.wizardStep === 3 && dom.stepSection3) dom.stepSection3.style.display = 'block';

      // Back Button state
      if (dom.wizardBackBtn) {
        if (state.wizardStep === 1) {
          dom.wizardBackBtn.disabled = true;
          dom.wizardBackBtn.style.opacity = '0.4';
          dom.wizardBackBtn.style.pointerEvents = 'none';
        } else {
          dom.wizardBackBtn.disabled = false;
          dom.wizardBackBtn.style.opacity = '1';
          dom.wizardBackBtn.style.pointerEvents = 'auto';
        }
      }

      // Next Button text
      if (dom.wizardNextBtn) {
        if (state.wizardStep === 3) {
          dom.wizardNextBtn.textContent = 'Finish & Evaluate 🔬';
        } else {
          dom.wizardNextBtn.textContent = 'Next Step ➡️';
        }
      }

      // Progress dots highlights
      dom.progressDots.forEach(dot => {
        const stepNum = parseInt(dot.getAttribute('data-step'), 10);
        if (stepNum === state.wizardStep) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }
  }

  // --- Theme Toggle Handler ---
  /**
   * Initializes theme styling and UI indicators from stored preferences.
   */
  function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeBtnUI();
  }

  /**
   * Updates theme toggle button icon and text.
   */
  function updateThemeBtnUI() {
    if (state.theme === 'cyberpunk') {
      dom.themeIcon.textContent = '🌙';
      dom.themeText.textContent = 'Neon Glow';
    } else {
      dom.themeIcon.textContent = '⚡';
      dom.themeText.textContent = 'Clean Dark';
    }
  }

  dom.themeToggleBtn.addEventListener('click', () => {
    state.theme = state.theme === 'cyberpunk' ? 'minimalist' : 'cyberpunk';
    SafeStorage.setItem('ph_theme', state.theme);
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeBtnUI();
    showToast(`Switched to ${state.theme === 'cyberpunk' ? 'Neon Glow' : 'Clean Dark'} Theme ✨`);
  });

  // --- Settings Popover & Developer Mode Handler ---
  /**
   * Initializes Developer Mode UI state.
   */
  function initDevMode() {
    updateDevModeUI();
  }

  /**
   * Toggles developer mode CSS classes and reverts dev-only export options if disabled.
   */
  function updateDevModeUI() {
    if (dom.devModeCheckbox) {
      dom.devModeCheckbox.checked = state.devMode;
    }

    if (state.devMode) {
      document.body.classList.add('dev-mode');
    } else {
      document.body.classList.remove('dev-mode');
      
      // If we are currently on a dev-only export option, revert to markdown
      if (state.exportType === 'python' || state.exportType === 'js' || state.exportType === 'curl') {
        state.exportType = 'markdown';
        // Reset active export tab styling
        dom.exportOptionsTabs.forEach(tab => {
          if (tab.getAttribute('data-export') === 'markdown') {
            tab.classList.add('active');
          } else {
            tab.classList.remove('active');
          }
        });
        updateExportCode();
      }
      
      // If raw mode is selected in studio, switch back to form builder mode
      if (state.studioMode === 'raw') {
        state.studioMode = 'form';
        dom.modeFormPill.classList.add('active');
        dom.modeRawPill.classList.remove('active');
        dom.formBuilderView.style.display = 'block';
        dom.rawMarkdownView.style.display = 'none';
        updateLivePreview();
      }
    }
  }

  // --- Colorblind & High-Contrast Mode Handler ---
  /**
   * Initializes Colorblind & High-Contrast mode UI state.
   */
  function initColorblindMode() {
    updateColorblindModeUI();
  }

  /**
   * Applies or removes colorblind accessibility CSS classes on body.
   */
  function updateColorblindModeUI() {
    if (dom.colorblindModeCheckbox) {
      dom.colorblindModeCheckbox.checked = state.colorblindMode;
    }
    if (state.colorblindMode) {
      document.body.classList.add('colorblind-mode');
    } else {
      document.body.classList.remove('colorblind-mode');
    }
  }

  if (dom.colorblindModeCheckbox) {
    dom.colorblindModeCheckbox.addEventListener('change', (e) => {
      state.colorblindMode = e.target.checked;
      SafeStorage.setItem('ph_colorblind_mode', String(state.colorblindMode));
      updateColorblindModeUI();
      if (state.colorblindMode) {
        showToast("Colorblind & High-Contrast Mode Enabled! 👁️");
      } else {
        showToast("Colorblind Mode Disabled.");
      }
      renderTokenBreakdown();
      renderHealthChecklist();
    });
  }

  // --- Universal Accessible Modal & Focus Trap Manager ---
  function getFocusableElements(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => {
      return (el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement) && window.getComputedStyle(el).visibility !== 'hidden';
    });
  }

  function openModal(modalEl, triggerEl = null) {
    if (!modalEl) return;
    lastTriggerElement = triggerEl || document.activeElement;
    activeModalElement = modalEl;
    modalEl.classList.add('active');

    // Auto focus first interactive element
    setTimeout(() => {
      const firstInput = modalEl.querySelector('input:not([type="hidden"]), textarea, select');
      if (firstInput) {
        firstInput.focus();
        if (firstInput.select) firstInput.select();
      } else {
        const focusables = getFocusableElements(modalEl);
        if (focusables.length > 0) focusables[0].focus();
      }
    }, 50);
  }

  function closeModal(modalEl = null) {
    const target = modalEl || activeModalElement;
    if (!target) return;
    target.classList.remove('active');
    target.style.backgroundColor = '';

    const container = target.querySelector('.modal-container');
    if (container) {
      container.style.transform = '';
      container.style.transition = '';
    }
    
    if (target === activeModalElement) {
      activeModalElement = null;
    }

    // Restore focus to original triggering element
    if (lastTriggerElement && typeof lastTriggerElement.focus === 'function') {
      try {
        lastTriggerElement.focus();
      } catch (err) {}
      lastTriggerElement = null;
    }
  }

  // --- Mobile Touch Gestures & Swipe-to-Dismiss Controller ---
  function initModalTouchGestures() {
    document.querySelectorAll('.modal-container').forEach(container => {
      // 1. Ensure drag handle element exists at top of container for touch devices
      if (!container.querySelector('.modal-drag-handle')) {
        const handle = document.createElement('div');
        handle.className = 'modal-drag-handle';
        handle.setAttribute('aria-hidden', 'true');
        container.insertBefore(handle, container.firstChild);
      }

      let startY = 0;
      let currentY = 0;
      let isDragging = false;
      const modalOverlay = container.closest('.modal-overlay');

      const handleTouchStart = (e) => {
        const header = container.querySelector('.modal-header');
        const handle = container.querySelector('.modal-drag-handle');
        const isHeaderTouch = (header && header.contains(e.target)) || (handle && handle.contains(e.target));
        const modalBody = container.querySelector('.modal-body');
        const isBodyAtTop = !modalBody || modalBody.scrollTop <= 0;

        if (isHeaderTouch || isBodyAtTop) {
          startY = e.touches[0].clientY;
          currentY = startY;
          isDragging = true;
          container.style.transition = 'none';
        }
      };

      const handleTouchMove = (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;

        // Only allow dragging downwards to dismiss
        if (deltaY > 0) {
          e.preventDefault();
          container.style.transform = `translateY(${deltaY}px)`;
          if (modalOverlay) {
            const opacity = Math.max(0.2, 1 - (deltaY / 300));
            modalOverlay.style.backgroundColor = `rgba(0, 0, 0, ${0.75 * opacity})`;
          }
        } else {
          container.style.transform = '';
        }
      };

      const handleTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        const deltaY = currentY - startY;
        container.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';

        if (deltaY > 75) {
          // Dismiss modal
          container.style.transform = `translateY(100%)`;
          setTimeout(() => {
            closeModal(modalOverlay);
            container.style.transform = '';
            container.style.transition = '';
            if (modalOverlay) modalOverlay.style.backgroundColor = '';
          }, 200);
        } else {
          // Snap back
          container.style.transform = '';
          if (modalOverlay) modalOverlay.style.backgroundColor = '';
          setTimeout(() => {
            container.style.transition = '';
          }, 250);
        }
      };

      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
      container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    });
  }

  // Trap focus inside any active modal on Tab / Shift+Tab
  document.addEventListener('keydown', (e) => {
    const openModals = Array.from(document.querySelectorAll('.modal-overlay.active'));
    if (openModals.length === 0) return;
    const currentModal = openModals[openModals.length - 1];

    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal(currentModal);
      return;
    }

    if (e.key === 'Tab') {
      const focusables = getFocusableElements(currentModal);
      if (focusables.length === 0) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl || !currentModal.contains(document.activeElement)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl || !currentModal.contains(document.activeElement)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  });

  // Modal backdrop click handler
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal);
      }
    });
  });

  // Storage Usage & Privacy Display Helper
  function updateStorageUsageDisplay() {
    if (dom.storageSizeLabel) {
      const usage = SafeStorage.getStorageUsage();
      dom.storageSizeLabel.textContent = usage.kb;
    }
  }

  // Settings Modal Controller
  if (dom.openSettingsModalBtn) {
    dom.openSettingsModalBtn.addEventListener('click', () => {
      updateStorageUsageDisplay();
      openModal(dom.settingsModal, dom.openSettingsModalBtn);
    });
  }

  if (dom.closeSettingsModalBtn) {
    dom.closeSettingsModalBtn.addEventListener('click', () => {
      closeModal(dom.settingsModal);
    });
  }

  // 1-Click Secure Storage Wipe Action
  if (dom.clearAllStorageBtn) {
    dom.clearAllStorageBtn.addEventListener('click', async () => {
      const confirmed = await showConfirmDialog(
        "Are you sure you want to securely wipe all local prompt drafts, history snapshots, vault items, and preferences? This action cannot be undone.",
        dom.clearAllStorageBtn
      );
      if (confirmed) {
        SafeStorage.clearAllPromptHelperData();
        state.vault = [];
        state.history = [];
        state.currentPrompt = { role: '', context: '', task: '', constraints: '', outputFormat: '', fewShot: '', rawText: '' };
        state.variableValues = {};
        initFormValues();
        renderVault();
        renderTemplateHub();
        updateLivePreview();
        updateStorageUsageDisplay();
        closeModal(dom.settingsModal);
        showToast("All local prompt drafts and cached data securely purged! 🔒", "info");
      }
    });
  }

  // Toggle Dev Mode Checkbox
  if (dom.devModeCheckbox) {
    dom.devModeCheckbox.addEventListener('change', (e) => {
      state.devMode = e.target.checked;
      SafeStorage.setItem('ph_dev_mode', String(state.devMode));
      updateDevModeUI();
      showToast(`Developer Mode turned ${state.devMode ? 'ON' : 'OFF'} ⚙️`);
    });
  }

  // --- Navigation Router ---
  dom.navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.getAttribute('data-tab');
      dom.navItems.forEach(n => {
        n.classList.remove('active');
        n.setAttribute('aria-selected', 'false');
      });
      dom.tabContents.forEach(c => c.classList.remove('active'));
      
      item.classList.add('active');
      item.setAttribute('aria-selected', 'true');
      document.getElementById(targetTab).classList.add('active');
      state.activeTab = targetTab;
    });
  });

  // --- Target Model Selection & Editable Model ID Sync ---
  const modelPresets = {
    gemini: 'gemini',
    claude: 'claude',
    gpt4: 'gpt-4',
    deepseek: 'deepseek',
    custom: 'custom-model'
  };

  function updateModelIdInputVisibility() {
    if (dom.modelIdInput) {
      dom.modelIdInput.style.display = (state.targetModel === 'custom') ? 'inline-block' : 'none';
    }
  }

  dom.modelSelect.addEventListener('change', (e) => {
    state.targetModel = e.target.value;
    if (modelPresets[e.target.value]) {
      dom.modelIdInput.value = modelPresets[e.target.value];
    }
    updateModelIdInputVisibility();
    updateLivePreview();
    showToast(`Target Model set to: ${e.target.options[e.target.selectedIndex].text}`);
  });

  dom.modelIdInput.addEventListener('input', () => {
    updateLivePreview();
  });

  // --- Studio Mode Switching (Form vs Raw) ---
  dom.modeFormPill.addEventListener('click', () => {
    state.studioMode = 'form';
    dom.modeFormPill.classList.add('active');
    dom.modeRawPill.classList.remove('active');
    dom.formBuilderView.style.display = 'block';
    dom.rawMarkdownView.style.display = 'none';
    updateLivePreview();
  });

  dom.modeRawPill.addEventListener('click', () => {
    state.studioMode = 'raw';
    dom.modeRawPill.classList.add('active');
    dom.modeFormPill.classList.remove('active');
    dom.formBuilderView.style.display = 'none';
    dom.rawMarkdownView.style.display = 'flex';
    
    // Sync current assembled prompt to raw textarea
    dom.rawMarkdownTextarea.value = assemblePromptText();
    updateLivePreview();
  });

  // --- Form Input Listeners ---
  function setSelectValueOrAddOption(selectEl, value) {
    if (!selectEl) return;
    let exists = false;
    for (let i = 0; i < selectEl.options.length; i++) {
      if (selectEl.options[i].value === value) {
        exists = true;
        break;
      }
    }
    if (!exists && value) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.text = value.length > 45 ? value.substring(0, 42) + '...' : value;
      selectEl.add(opt);
    }
    selectEl.value = value;
  }

  function initFormValues() {
    dom.promptRole.value = state.currentPrompt.role || '';
    dom.promptContext.value = state.currentPrompt.context || '';
    dom.promptTask.value = state.currentPrompt.task || '';
    dom.promptConstraints.value = state.currentPrompt.constraints || '';
    setSelectValueOrAddOption(dom.promptOutputFormat, state.currentPrompt.outputFormat);
    dom.promptFewShot.value = state.currentPrompt.fewShot || '';
    if (dom.rawMarkdownTextarea) {
      dom.rawMarkdownTextarea.value = state.currentPrompt.rawText || '';
    }

    if (state.studioMode === 'raw') {
      dom.modeRawPill.classList.add('active');
      dom.modeFormPill.classList.remove('active');
      dom.formBuilderView.style.display = 'none';
      dom.rawMarkdownView.style.display = 'flex';
    } else {
      dom.modeFormPill.classList.add('active');
      dom.modeRawPill.classList.remove('active');
      dom.formBuilderView.style.display = 'block';
      dom.rawMarkdownView.style.display = 'none';
    }
  }

  [dom.promptRole, dom.promptContext, dom.promptTask, dom.promptConstraints, dom.promptOutputFormat, dom.promptFewShot].forEach(input => {
    const events = input.tagName === 'SELECT' ? ['change', 'input'] : ['input'];
    events.forEach(evt => {
      input.addEventListener(evt, () => {
        state.currentPrompt.role = dom.promptRole.value;
        state.currentPrompt.context = dom.promptContext.value;
        state.currentPrompt.task = dom.promptTask.value;
        state.currentPrompt.constraints = dom.promptConstraints.value;
        state.currentPrompt.outputFormat = dom.promptOutputFormat.value;
        state.currentPrompt.fewShot = dom.promptFewShot.value;
        updateLivePreview();
      });
    });
  });

  dom.rawMarkdownTextarea.addEventListener('input', () => {
    state.currentPrompt.rawText = dom.rawMarkdownTextarea.value;
    updateLivePreview();
  });

  dom.insertRolePreset.addEventListener('click', () => {
    const roles = [
      "Senior Staff Python Architect",
      "Principal Security Auditor & Bug Hunter",
      "World-Class Direct Response Copywriter",
      "Autonomous AI Agent System Designer",
      "Master Socratic Computer Science Tutor"
    ];
    state.rolePresetIndex = (state.rolePresetIndex + 1) % roles.length;
    const picked = roles[state.rolePresetIndex];
    dom.promptRole.value = picked;
    state.currentPrompt.role = picked;
    updateLivePreview();
    showToast(`Inserted Preset Role (${state.rolePresetIndex + 1}/${roles.length}): ${picked}`);
  });

  // --- Tone & Style Preset Pills Controller ---
  function initTonePresetHandlers() {
    document.querySelectorAll('.tone-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const toneKey = pill.getAttribute('data-tone');
        const toneRule = pill.getAttribute('data-rule');

        if (state.selectedTone === toneKey) {
          // Deselect
          state.selectedTone = null;
          state.selectedToneRule = null;
          syncTonePillUI();
          updateLivePreview();
          showToast(`Removed style preset.`);
        } else {
          // Select
          state.selectedTone = toneKey;
          state.selectedToneRule = toneRule;
          syncTonePillUI();
          updateLivePreview();
          const label = pill.textContent.trim();
          showToast(`Applied ${label} style preset! 🎨`);
        }
      });
    });
  }

  function syncTonePillUI() {
    document.querySelectorAll('.tone-pill').forEach(pill => {
      const toneKey = pill.getAttribute('data-tone');
      if (state.selectedTone === toneKey) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  // --- Guardrail Quick Insert Pills Controller ---
  function initGuardrailPillHandlers() {
    document.querySelectorAll('.guardrail-pill').forEach(pill => {
      if (pill.id === 'enhancePromptBtn') return; // Has dedicated handler

      pill.addEventListener('click', () => {
        const rule = pill.getAttribute('data-rule');
        if (!rule) return;

        const currentVal = dom.promptConstraints ? dom.promptConstraints.value : (state.currentPrompt.constraints || '');
        let lines = currentVal.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        const existingIdx = lines.findIndex(l => l.toLowerCase() === rule.toLowerCase());
        if (existingIdx !== -1) {
          // Toggle off
          lines.splice(existingIdx, 1);
          const newText = lines.join('\n');
          if (dom.promptConstraints) dom.promptConstraints.value = newText;
          state.currentPrompt.constraints = newText;
          pill.classList.remove('active');
          initFormValues();
          updateLivePreview();
          showToast(`Removed rule: "${pill.textContent.trim()}"`);
        } else {
          // Toggle on
          lines.push(rule);
          const newText = lines.join('\n');
          if (dom.promptConstraints) dom.promptConstraints.value = newText;
          state.currentPrompt.constraints = newText;
          pill.classList.add('active');
          initFormValues();
          updateLivePreview();
          showToast(`Added rule: "${pill.textContent.trim()}"! 🛡️`);
        }
      });
    });
  }

  // --- Dynamic Variable Extractor & Humanizer ---
  /**
   * Converts a snake_case variable name into a capitalized human-readable title.
   * @param {string} varName Variable name (e.g. "target_audience")
   * @returns {string} Humanized title (e.g. "Target Audience")
   */
  function formatVariableLabel(varName) {
    if (!varName) return '';
    return varName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Scans text for {{variable_name}} tokens and returns a unique array of variable names.
   * @param {string} text Input text with {{bracket}} placeholders
   * @returns {string[]} Array of unique variable keys
   */
  function extractVariables(text) {
    const regex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    const matches = new Set();
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.add(match[1]);
    }
    return Array.from(matches);
  }

  /**
   * Dynamically renders variable input fields into the "Fill in the Blanks" panel.
   */
  function renderDynamicVariableInputs() {
    const fullText = state.studioMode === 'raw' ? (dom.rawMarkdownTextarea ? dom.rawMarkdownTextarea.value : '') : (
      (state.currentPrompt.role || '') + " " + (state.currentPrompt.context || '') + " " + (state.currentPrompt.task || '') + " " + (state.currentPrompt.constraints || '')
    );
    
    const vars = extractVariables(fullText);
    
    if (vars.length === 0) {
      dom.variablesFillingPanel.style.display = 'none';
      return;
    }

    dom.variablesFillingPanel.style.display = 'flex';
    dom.dynamicVariableInputs.innerHTML = '';

    vars.forEach(v => {
      if (state.variableValues[v] === undefined) {
        state.variableValues[v] = v === 'language' ? 'TypeScript' : (v === 'code_snippet' ? 'console.log("hello world");' : '');
      }

      const humanLabel = formatVariableLabel(v);

      const row = document.createElement('div');
      row.className = 'form-group';
      row.innerHTML = `
        <label class="form-label" style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <strong style="color: var(--text-primary); font-size: 0.85rem;">${escapeHtml(humanLabel)}</strong>
            <span class="var-code-chip">{{${escapeHtml(v)}}}</span>
          </div>
          <span style="font-size:0.7rem; color:var(--text-muted);">Fill-in Blank</span>
        </label>
        <input type="text" class="form-input var-input" data-var="${escapeHtml(v)}" value="${escapeHtml(state.variableValues[v])}" placeholder="Enter ${escapeHtml(humanLabel.toLowerCase())}...">
      `;
      dom.dynamicVariableInputs.appendChild(row);
    });

    // Attach listeners
    document.querySelectorAll('.var-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const varName = e.target.getAttribute('data-var');
        state.variableValues[varName] = e.target.value;
        updateLivePreview();
      });
    });
  }

  // Quick insert preset variable chips
  document.querySelectorAll('.var-chip-btn[data-insert-var]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const varKey = btn.getAttribute('data-insert-var');
      insertVariableIntoActiveField(`{{${varKey}}}`);
    });
  });

  /**
   * Inserts text at the current cursor position in the active textarea or input.
   * @param {string} textToInsert Text to insert (e.g. "{{topic}}")
   */
  function insertVariableIntoActiveField(textToInsert) {
    let target = null;
    if (state.studioMode === 'raw') {
      target = dom.rawMarkdownTextarea;
    } else {
      const active = document.activeElement;
      if (active && (active === dom.promptRole || active === dom.promptContext || active === dom.promptTask || active === dom.promptConstraints || active === dom.promptOutputFormat)) {
        target = active;
      } else {
        target = dom.promptTask;
      }
    }

    if (!target) return;
    
    const start = target.selectionStart !== undefined ? target.selectionStart : target.value.length;
    const end = target.selectionEnd !== undefined ? target.selectionEnd : target.value.length;
    const val = target.value;
    target.value = val.substring(0, start) + textToInsert + val.substring(end);
    target.selectionStart = target.selectionEnd = start + textToInsert.length;
    target.focus();

    target.dispatchEvent(new Event('input', { bubbles: true }));
    showToast(`Inserted ${textToInsert} blank! 🔤`);
  }

  // --- Prompt Compression & Token Optimizer Engine ---
  const FLUFF_RULES = [
    { regex: /\b(i would like you to please|please make sure to|please ensure that you|could you please help me (to )?|could you please|would you please|can you please)\b/gi, replacement: '' },
    { regex: /\b(i want you to please|i need you to please|i want to ask you to)\b/gi, replacement: '' },
    { regex: /\b(make sure to always|ensure to always|be sure to always)\b/gi, replacement: 'Always' },
    { regex: /\b(make sure (that )?you|be sure (that )?you)\b/gi, replacement: 'Ensure' },
    { regex: /\b(feel free to|don't hesitate to|please feel free to)\b/gi, replacement: '' },
    { regex: /\b(as an ai( model)?,? (you should|you must|please)?)\b/gi, replacement: '' },
    { regex: /\b(if (it is )?possible,?( please)?)\b/gi, replacement: '' },
    { regex: /\b(it would be (great|helpful|appreciated) if you could)\b/gi, replacement: '' },
    { regex: /\b(take your time to|do your best to|kindly)\b/gi, replacement: '' },
    { regex: /\b(as much as possible)\b/gi, replacement: '' }
  ];

  const PHRASE_RULES = [
    { regex: /\bin order to be able to\b/gi, replacement: 'to' },
    { regex: /\bin order to\b/gi, replacement: 'to' },
    { regex: /\bfor the purpose of\b/gi, replacement: 'for' },
    { regex: /\bdue to the fact that\b/gi, replacement: 'because' },
    { regex: /\bat this point in time\b/gi, replacement: 'now' },
    { regex: /\bat the present time\b/gi, replacement: 'currently' },
    { regex: /\bin the event that\b/gi, replacement: 'if' },
    { regex: /\bwith regard to\b/gi, replacement: 'regarding' },
    { regex: /\bin reference to\b/gi, replacement: 'regarding' },
    { regex: /\bin addition to\b/gi, replacement: 'besides' },
    { regex: /\bas a matter of fact\b/gi, replacement: 'in fact' },
    { regex: /\bin a timely manner\b/gi, replacement: 'promptly' },
    { regex: /\ba large number of\b/gi, replacement: 'many' },
    { regex: /\ba majority of\b/gi, replacement: 'most' },
    { regex: /\bhas the ability to\b/gi, replacement: 'can' },
    { regex: /\bis able to\b/gi, replacement: 'can' },
    { regex: /\butilize\b/gi, replacement: 'use' },
    { regex: /\butilizes\b/gi, replacement: 'uses' },
    { regex: /\butilizing\b/gi, replacement: 'using' },
    { regex: /\butilization\b/gi, replacement: 'use' },
    { regex: /\bprior to\b/gi, replacement: 'before' },
    { regex: /\bsubsequent to\b/gi, replacement: 'after' },
    { regex: /\bconduct an analysis of\b/gi, replacement: 'analyze' },
    { regex: /\bprovide a summary of\b/gi, replacement: 'summarize' },
    { regex: /\bcome up with\b/gi, replacement: 'create' },
    { regex: /\bgive an explanation of\b/gi, replacement: 'explain' },
    { regex: /\bperform an evaluation of\b/gi, replacement: 'evaluate' },
    { regex: /\bmake a decision\b/gi, replacement: 'decide' },
    { regex: /\btake into consideration\b/gi, replacement: 'consider' },
    { regex: /\bhave a discussion about\b/gi, replacement: 'discuss' },
    { regex: /\bit is (important|crucial|essential) to note that (you should )?/gi, replacement: 'Note: ' },
    { regex: /\bkeep in mind that (you must|you should )?/gi, replacement: 'Note: ' }
  ];

  /**
   * Compresses and optimizes prompt text by removing conversational fluff and redundant phrasing.
   * @param {string} text Input prompt text
   * @param {Object} [options] Compression toggle options
   * @param {boolean} [options.stripFluff=true] Strip conversational politeness and fluff
   * @param {boolean} [options.simplifyPhrases=true] Simplify wordy directives
   * @param {boolean} [options.cleanWhitespace=true] Compact excess spacing and blank lines
   * @returns {{originalText: string, compressedText: string, originalTokens: number, compressedTokens: number, tokensSaved: number, percentSaved: number, originalWords: number, compressedWords: number, wordsSaved: number, hasChanges: boolean, ruleMatchesCount: number}}
   */
  function compressPromptText(text, options = {}) {
    const {
      stripFluff = true,
      simplifyPhrases = true,
      cleanWhitespace = true
    } = options;

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return {
        originalText: text || '',
        compressedText: text || '',
        originalTokens: 0,
        compressedTokens: 0,
        tokensSaved: 0,
        percentSaved: 0,
        originalWords: 0,
        compressedWords: 0,
        wordsSaved: 0,
        hasChanges: false,
        ruleMatchesCount: 0
      };
    }

    const originalText = text;
    let safeText = text;

    // Step 1: Mask protected elements (variables, code blocks, model XML tags, headers)
    const masks = [];
    const createMask = (val) => {
      masks.push(val);
      return `__PH_COMPRESS_MASK_${masks.length - 1}__`;
    };

    // Mask code blocks (triple and single backticks)
    safeText = safeText.replace(/```[\s\S]*?```/g, createMask);
    safeText = safeText.replace(/`[^`\n]+`/g, createMask);

    // Mask {{variables}}
    safeText = safeText.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, createMask);

    // Mask XML tags and section headers
    safeText = safeText.replace(/<\/?(role|context|instructions|constraints|output_format|examples)>/gi, createMask);
    safeText = safeText.replace(/\[(SYSTEM ROLE|REASONING PROCESS MANDATE|CONTEXT|TASK|CONSTRAINTS|OUTPUT FORMAT|FEW-SHOT EXAMPLES)\]/g, createMask);

    let ruleMatchesCount = 0;

    // Step 2: Apply Fluff Rules
    if (stripFluff) {
      FLUFF_RULES.forEach(({ regex, replacement }) => {
        const matches = safeText.match(regex);
        if (matches) ruleMatchesCount += matches.length;
        safeText = safeText.replace(regex, replacement);
      });
    }

    // Step 3: Apply Phrase Simplification Rules
    if (simplifyPhrases) {
      PHRASE_RULES.forEach(({ regex, replacement }) => {
        const matches = safeText.match(regex);
        if (matches) ruleMatchesCount += matches.length;
        safeText = safeText.replace(regex, replacement);
      });

      // Passive to Imperative: e.g. "You should summarize" -> "Summarize"
      const passiveRegex = /(^|\n|\.\s+)([Yy]ou (should|must|need to|are instructed to|ought to) )([a-z]+)/g;
      safeText = safeText.replace(passiveRegex, (match, prefix, prefixVerb, aux, verb) => {
        ruleMatchesCount++;
        const capitalized = verb.charAt(0).toUpperCase() + verb.slice(1);
        return `${prefix}${capitalized}`;
      });
    }

    // Step 4: Clean up punctuation artifacts after phrase deletion
    safeText = safeText.replace(/^[ \t]*,[ \t]*/gm, '');
    safeText = safeText.replace(/\.\s*,/g, '.');
    safeText = safeText.replace(/([ \t]+),/g, ',');

    // Step 5: Clean Whitespace
    if (cleanWhitespace) {
      safeText = safeText.replace(/[ \t]+/g, ' ');
      safeText = safeText.replace(/[ \t]+$/gm, '');
      safeText = safeText.replace(/\n{3,}/g, '\n\n');
    }

    // Step 6: Sentence-start capitalization normalization
    safeText = safeText.replace(/(^|[\n.!?]\s+)([a-z])/g, (match, prefix, char) => {
      return prefix + char.toUpperCase();
    });

    // Step 7: Unmask protected elements
    masks.forEach((val, idx) => {
      const maskKey = `__PH_COMPRESS_MASK_${idx}__`;
      safeText = safeText.split(maskKey).join(val);
    });

    const compressedText = safeText.trim();
    const originalTokens = Math.ceil(originalText.length / 4);
    const compressedTokens = Math.ceil(compressedText.length / 4);
    const tokensSaved = Math.max(0, originalTokens - compressedTokens);
    const percentSaved = originalTokens > 0 ? Math.round((tokensSaved / originalTokens) * 100) : 0;

    const originalWords = originalText.trim() ? originalText.trim().split(/\s+/).length : 0;
    const compressedWords = compressedText ? compressedText.split(/\s+/).length : 0;
    const wordsSaved = Math.max(0, originalWords - compressedWords);
    const hasChanges = compressedText !== originalText.trim() && (tokensSaved > 0 || wordsSaved > 0 || ruleMatchesCount > 0);

    return {
      originalText,
      compressedText,
      originalTokens,
      compressedTokens,
      tokensSaved,
      percentSaved,
      originalWords,
      compressedWords,
      wordsSaved,
      hasChanges,
      ruleMatchesCount
    };
  }

  // --- Live Prompt Assembly & Model-Tailored Enhancer Engine ---
  /**
   * Compiles the active constructor inputs into a tailored, model-optimized prompt string.
   * Applies Claude XML formatting, DeepSeek reasoning blocks, or Gemini/ChatGPT structured Markdown.
   * @returns {string} Fully compiled and variable-interpolated prompt text
   */
  function assemblePromptText() {
    if (state.studioMode === 'raw') {
      let raw = dom.rawMarkdownTextarea.value;
      return substituteVariables(raw);
    }

    const { role, context, task, constraints, outputFormat, fewShot } = state.currentPrompt;
    const model = state.targetModel;

    // Combine custom constraints with selected tone preset rule
    let finalConstraints = constraints;
    if (state.selectedToneRule) {
      finalConstraints = (finalConstraints ? finalConstraints + '\n' : '') + state.selectedToneRule;
    }

    // Apply Model-Tailored Optimization
    if (model === 'claude') {
      // Anthropic Claude XML Tag Structuring
      let xml = ``;
      if (role) xml += `<role>\n${role}\n</role>\n\n`;
      if (context) xml += `<context>\n${context}\n</context>\n\n`;
      if (task) xml += `<instructions>\n${task}\n</instructions>\n\n`;
      if (finalConstraints) xml += `<constraints>\n${finalConstraints}\n</constraints>\n\n`;
      if (outputFormat) xml += `<output_format>\n${outputFormat}\n</output_format>\n\n`;
      if (fewShot) xml += `<examples>\n${fewShot}\n</examples>\n`;
      return substituteVariables(xml.trim());
    } 
    else if (model === 'deepseek') {
      // DeepSeek Chain-of-Thought Reasoning
      let cot = ``;
      if (role) cot += `[SYSTEM ROLE]\n${role}\n\n`;
      cot += `[REASONING PROCESS MANDATE]\nBefore producing the final output, think step-by-step. Analyze the requirements, verify edge cases, and ensure strict compliance with constraints.\n\n`;
      if (context) cot += `[CONTEXT]\n${context}\n\n`;
      if (task) cot += `[TASK]\n${task}\n\n`;
      if (finalConstraints) cot += `[CONSTRAINTS]\n${finalConstraints}\n\n`;
      if (outputFormat) cot += `[OUTPUT FORMAT]\n${outputFormat}\n\n`;
      if (fewShot) cot += `[FEW-SHOT EXAMPLES]\n${fewShot}\n`;
      return substituteVariables(cot.trim());
    } 
    else {
      // Gemini / GPT-4o Clean Markdown Format
      let md = ``;
      if (role) md += `# Persona & Role\nYou are a ${role}.\n\n`;
      if (context) md += `## Context\n${context}\n\n`;
      if (task) md += `## Task Instructions\n${task}\n\n`;
      if (finalConstraints) {
        md += `## Constraints & Rules\n`;
        const lines = finalConstraints.split('\n').filter(l => l.trim().length > 0);
        lines.forEach(l => { md += `- ${l.trim()}\n`; });
        md += `\n`;
      }
      if (outputFormat) md += `## Output Format\n${outputFormat}\n\n`;
      if (fewShot) md += `## Examples\n${fewShot}\n`;
      return substituteVariables(md.trim());
    }
  }

  /**
   * Replaces {{variable_name}} tokens in a text with user-supplied values.
   * @param {string} text Input text containing variables
   * @returns {string} Text with variables substituted
   */
  function substituteVariables(text) {
    return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, p1) => {
      return state.variableValues[p1] !== undefined ? state.variableValues[p1] : match;
    });
  }

  /**
   * Coordinates UI updates across preview pane, token stats, health checklist, and draft auto-save.
   */
  function updateLivePreview() {
    updateWizardUI();
    syncGuardrailPills();
    renderDynamicVariableInputs();
    const assembled = assemblePromptText();
    
    // Render text with highlighted XML or Markdown headers
    dom.promptLivePreview.textContent = assembled;

    // Render Model-Tailored Explanation Banner (Form Mode only)
    if (state.studioMode === 'form' && dom.modelExplanationBanner) {
      dom.modelExplanationBanner.style.display = 'flex';
      const model = state.targetModel;
      if (model === 'claude') {
        dom.modelExplanationBanner.innerHTML = `
          <span style="font-size: 1.1rem; filter: drop-shadow(0 0 4px rgba(6, 182, 212, 0.4));">⚡</span>
          <div>
            <strong>Claude Formatting Active:</strong> Claude reads instructions best when clearly separated with labeled sections (like <code>&lt;role&gt;</code> and <code>&lt;instructions&gt;</code>). We've organized your prompt automatically!
          </div>
        `;
      } 
      else if (model === 'deepseek') {
        dom.modelExplanationBanner.innerHTML = `
          <span style="font-size: 1.1rem; filter: drop-shadow(0 0 4px rgba(6, 182, 212, 0.4));">⚡</span>
          <div>
            <strong>DeepSeek Reasoning Format Active:</strong> DeepSeek gives more thoughtful answers when asked to think step-by-step before answering. We've added reasoning instructions automatically!
          </div>
        `;
      } 
      else if (model === 'gemini') {
        dom.modelExplanationBanner.innerHTML = `
          <span style="font-size: 1.1rem; filter: drop-shadow(0 0 4px rgba(6, 182, 212, 0.4));">⚡</span>
          <div>
            <strong>Gemini Formatting Active:</strong> Google's Gemini models follow prompts best with clean headings and bulleted rules. We've formatted your prompt automatically!
          </div>
        `;
      } 
      else if (model === 'gpt4') {
        dom.modelExplanationBanner.innerHTML = `
          <span style="font-size: 1.1rem; filter: drop-shadow(0 0 4px rgba(6, 182, 212, 0.4));">⚡</span>
          <div>
            <strong>ChatGPT Formatting Active:</strong> ChatGPT responds best with clear section headers and bulleted rules. We've formatted your prompt automatically!
          </div>
        `;
      } 
      else {
        dom.modelExplanationBanner.innerHTML = `
          <span style="font-size: 1.1rem; filter: drop-shadow(0 0 4px rgba(6, 182, 212, 0.4));">⚡</span>
          <div>
            <strong>Standard Formatting Active:</strong> Formatted with clean section headings and bullet points ready to paste into any AI chatbot.
          </div>
        `;
      }
    } else if (dom.modelExplanationBanner) {
      dom.modelExplanationBanner.style.display = 'none';
    }

    // Stats Calculation
    const chars = assembled.length;
    const tokens = Math.ceil(chars / 4);
    const words = assembled.trim() === "" ? 0 : assembled.trim().split(/\s+/).length;
    const readTime = Math.ceil(words / 200);
    
    if (dom.statTokens) dom.statTokens.textContent = `~${tokens} tokens`;
    if (dom.statWords) dom.statWords.textContent = `${words} words`;
    if (dom.statReadTime) dom.statReadTime.textContent = `~${readTime} min`;

    // Live Token Compression Optimizer Detection
    if (dom.statCompressWrapper && dom.statCompressSavingsText) {
      const compressionResult = compressPromptText(assembled);
      if (compressionResult.hasChanges && (compressionResult.tokensSaved >= 3 || compressionResult.wordsSaved >= 3)) {
        dom.statCompressWrapper.style.display = 'flex';
        dom.statCompressSavingsText.textContent = `~${compressionResult.tokensSaved} saveable`;
      } else {
        dom.statCompressWrapper.style.display = 'none';
      }
    }

    // Health Score calculation
    const health = calculateHealthScore(assembled);
    const failingCount = health.checks.filter(c => !c.passed).length;
    if (failingCount === 0) {
      dom.statHealthBadge.innerHTML = `<span class="status-pill-dual pass" style="padding: 2px 8px;"><span>✓</span> Ready</span>`;
    } else if (failingCount <= 2) {
      dom.statHealthBadge.innerHTML = `<span class="status-pill-dual warn" style="padding: 2px 8px;"><span>▲</span> ${failingCount} Tip${failingCount > 1 ? 's' : ''}</span>`;
    } else {
      dom.statHealthBadge.innerHTML = `<span class="status-pill-dual fail" style="padding: 2px 8px;"><span>✕</span> Incomplete</span>`;
    }

    // Render Breakdown Bar
    renderTokenBreakdown();
    renderHealthChecklist();

    // Auto-save draft changes
    triggerAutoSave();
  }

  /**
   * Evaluates prompt completeness across 5 key dimensions (Role, Task, Constraints, Output Format, Variables).
   * @param {string} promptText The assembled prompt text
   * @returns {{score: number, checks: Array<{id: string, name: string, question: string, passed: boolean, tip: string, fixLabel?: string}>}}
   */
  function calculateHealthScore(promptText) {
    let score = 100;
    const checks = [];

    // Check 1: Role Definition
    const hasRole = (state.currentPrompt.role && state.currentPrompt.role.trim().length > 0) || 
      (state.studioMode === 'raw' && (/role|persona|act as|you are/i).test(promptText));
    if (!hasRole) {
      score -= 20;
      checks.push({
        id: 'role',
        name: 'Role Definition',
        question: 'Who should the AI pretend to be?',
        passed: false,
        tip: 'Specify a persona or role for more tailored behavior.',
        fixLabel: '⚡ Add Role'
      });
    } else {
      checks.push({
        id: 'role',
        name: 'Role Definition',
        question: 'Who should the AI pretend to be?',
        passed: true,
        tip: 'Role specified.'
      });
    }

    // Check 2: Task Instructions
    const rawLen = (dom.rawMarkdownTextarea ? dom.rawMarkdownTextarea.value : '').trim().length;
    const taskLen = (state.currentPrompt.task || '').trim().length;
    const hasTask = state.studioMode === 'raw' ? rawLen >= 30 : taskLen >= 10;
    if (!hasTask) {
      score -= 30;
      checks.push({
        id: 'task',
        name: 'Task Instructions',
        question: 'What specific instructions should the AI follow?',
        passed: false,
        tip: 'Prompt instructions are very brief. Add clear details.',
        fixLabel: '✏️ Write Goal'
      });
    } else {
      checks.push({
        id: 'task',
        name: 'Task Instructions',
        question: 'What specific instructions should the AI follow?',
        passed: true,
        tip: 'Clear instructions provided.'
      });
    }

    // Check 3: Rules & Constraints
    const hasConstraints = (state.currentPrompt.constraints && state.currentPrompt.constraints.trim().length > 0) ||
      (state.studioMode === 'raw' && (/constraint|rule|do not|avoid|must not/i).test(promptText));
    if (!hasConstraints) {
      score -= 20;
      checks.push({
        id: 'constraints',
        name: 'Rules & Constraints',
        question: 'What should the AI avoid doing?',
        passed: false,
        tip: 'Add rules to avoid hallucinations and generic fluff.',
        fixLabel: '🛡️ Add Rules'
      });
    } else {
      checks.push({
        id: 'constraints',
        name: 'Rules & Constraints',
        question: 'What should the AI avoid doing?',
        passed: true,
        tip: 'Constraints and rules detected.'
      });
    }

    // Check 4: Output Format
    const hasFormat = (state.currentPrompt.outputFormat && state.currentPrompt.outputFormat.trim().length > 0) ||
      (state.studioMode === 'raw' && (/format|markdown|json|bullet|table/i).test(promptText));
    if (!hasFormat) {
      score -= 15;
      checks.push({
        id: 'outputFormat',
        name: 'Output Format',
        question: 'How should the AI structure its response?',
        passed: false,
        tip: 'Specify output structure (e.g. Markdown, bullet points).',
        fixLabel: '📑 Add Format'
      });
    } else {
      checks.push({
        id: 'outputFormat',
        name: 'Output Format',
        question: 'How should the AI structure its response?',
        passed: true,
        tip: 'Output format defined.'
      });
    }

    // Check 5: Variable Safety / Blanks
    const fullText = state.studioMode === 'raw' ? (dom.rawMarkdownTextarea ? dom.rawMarkdownTextarea.value : '') : (
      (state.currentPrompt.role || '') + " " + (state.currentPrompt.context || '') + " " + (state.currentPrompt.task || '') + " " + (state.currentPrompt.constraints || '')
    );
    const vars = extractVariables(fullText);
    const emptyVars = vars.filter(v => !state.variableValues[v] || state.variableValues[v].trim().length === 0);

    if (emptyVars.length > 0) {
      score -= 15;
      checks.push({
        id: 'variables',
        name: 'Variable Safety',
        question: 'Are all {{blank}} placeholders filled in?',
        passed: false,
        tip: `${emptyVars.length} placeholder${emptyVars.length > 1 ? 's are' : ' is'} empty (e.g. {{${emptyVars[0]}}}).`,
        fixLabel: '🔤 Fill Blanks'
      });
    } else {
      checks.push({
        id: 'variables',
        name: 'Variable Safety',
        question: 'Are all {{blank}} placeholders filled in?',
        passed: true,
        tip: vars.length > 0 ? 'All {{blank}} values are filled in.' : 'No unfilled placeholders in prompt.'
      });
    }

    return { score: Math.max(score, 0), checks };
  }

  // --- Add Trust & Accuracy Rules Button Toggle ---
  dom.enhancePromptBtn.addEventListener('click', () => {
    const currentConstraints = dom.promptConstraints ? dom.promptConstraints.value : (state.currentPrompt.constraints || '');
    let lines = currentConstraints.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const hasRule1 = lines.some(l => l.toLowerCase() === TRUST_RULE_1.toLowerCase());
    const hasRule2 = lines.some(l => l.toLowerCase() === TRUST_RULE_2.toLowerCase());
    const isFullyActive = hasRule1 && hasRule2;

    if (isFullyActive) {
      // Toggle Off: Remove only these specific trust rules
      lines = lines.filter(l => l.toLowerCase() !== TRUST_RULE_1.toLowerCase() && l.toLowerCase() !== TRUST_RULE_2.toLowerCase());
      const newText = lines.join('\n');
      if (dom.promptConstraints) dom.promptConstraints.value = newText;
      state.currentPrompt.constraints = newText;
      if (dom.enhancePromptBtn) dom.enhancePromptBtn.classList.remove('active');
      initFormValues();
      updateLivePreview();
      showToast("Removed Trust & Accuracy Rules 🛡️");
    } else {
      // Toggle On: Ensure both rules are present
      saveVersion(null, "Auto-save (Before Adding Trust Rules)");
      if (!hasRule1) lines.push(TRUST_RULE_1);
      if (!hasRule2) lines.push(TRUST_RULE_2);
      const newText = lines.join('\n');
      if (dom.promptConstraints) dom.promptConstraints.value = newText;
      state.currentPrompt.constraints = newText;
      if (dom.enhancePromptBtn) dom.enhancePromptBtn.classList.add('active');

      if (!state.currentPrompt.outputFormat) {
        state.currentPrompt.outputFormat = 'A structured markdown document with H2 and H3 headings.';
      }

      initFormValues();
      updateLivePreview();
      showToast("Added Trust & Accuracy Rules! 🛡️");
    }
  });

  // --- Clipboard Helper with Fallback ---
  /**
   * Copies text to system clipboard using modern Async API, execCommand fallback, or DOM text selection.
   * @param {string} text The text to copy
   * @param {string} [successMsg] Toast message on success
   * @param {HTMLElement} [fallbackElement] DOM element to highlight if clipboard API fails
   * @returns {Promise<boolean>} True if successfully copied
   */
  async function copyToClipboard(text, successMsg = 'Copied to clipboard! Ready to paste into your AI app (Ctrl+V). 📋', fallbackElement = dom.promptLivePreview) {
    if (!text || !text.trim()) {
      showToast('Prompt is empty — nothing to copy!');
      return false;
    }

    let copied = false;

    // 1. Try Modern Async Clipboard API (Requires secure context)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (err) {
        console.warn('navigator.clipboard.writeText failed, attempting execCommand fallback:', err);
      }
    }

    // 2. Try execCommand('copy') fallback with hidden textarea
    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (execErr) {
        console.warn('document.execCommand copy fallback failed:', execErr);
      }
    }

    if (copied) {
      showToast(successMsg);
      return true;
    }

    // 3. Fallback: Select text in DOM element so user can press Ctrl+C manually
    if (fallbackElement) {
      try {
        const range = document.createRange();
        range.selectNodeContents(fallbackElement);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } catch (selErr) {
        console.warn('Selection fallback failed:', selErr);
      }
    }

    showToast('Copy failed — text highlighted! Press Ctrl+C to copy manually.');
    return false;
  }

  // --- Copy Prompt to Clipboard ---
  function handleStudioPromptCopy() {
    saveVersion(null, "Auto-save (Before Copy)");
    const text = assemblePromptText();
    copyToClipboard(text, 'Copied to clipboard! Ready to paste into your AI app (Ctrl+V). 📋', dom.promptLivePreview);
  }

  if (dom.copyPromptBtn) {
    dom.copyPromptBtn.addEventListener('click', handleStudioPromptCopy);
  }
  if (dom.headerCopyPromptBtn) {
    dom.headerCopyPromptBtn.addEventListener('click', handleStudioPromptCopy);
  }

  // --- Template Hub Progressive Lazy Loading & Renderer ---
  /**
   * Constructs an individual Template Hub card DOM element.
   * @param {TemplateItem} t Template item data object
   * @returns {HTMLElement} Template card element
   */
  function renderTemplateCardElement(t) {
    const isCustom = t.id.startsWith('custom-') || state.vault.some(v => v.id === t.id);
    const card = document.createElement('div');
    card.className = 'template-card';
    card.innerHTML = `
      <div class="card-header-top">
        <h3 class="card-title">${escapeHtml(t.title)}</h3>
        <span class="${isCustom ? 'badge-custom' : 'badge-builtin'}">${isCustom ? 'My Prompt' : 'Built-In'}</span>
      </div>
      <p class="card-desc">${escapeHtml(t.description)}</p>
      <div class="card-footer">
        <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">${escapeHtml(t.category || 'General')}</span>
        <button class="btn btn-sm load-tpl-btn" data-id="${escapeHtml(t.id)}">Use This Template</button>
      </div>
    `;

    const loadBtn = card.querySelector('.load-tpl-btn');
    if (loadBtn) {
      loadBtn.addEventListener('click', () => {
        const allTemplates = [...BUILTIN_TEMPLATES, ...state.vault];
        const found = allTemplates.find(x => x.id === t.id);
        if (found) {
          loadTemplateIntoStudio(found);
        }
      });
    }

    return card;
  }

  /**
   * Appends the next batch of template cards to the grid container and sets up the IntersectionObserver.
   */
  function appendNextTemplateBatch() {
    const start = (currentTemplatePage - 1) * TEMPLATE_PAGE_SIZE;
    const end = start + TEMPLATE_PAGE_SIZE;
    const batch = hubFilteredTemplates.slice(start, end);

    // Remove existing sentinel if present
    const existingSentinel = document.getElementById('templateInfiniteSentinel');
    if (existingSentinel) existingSentinel.remove();

    batch.forEach(t => {
      const card = renderTemplateCardElement(t);
      dom.templateGridContainer.appendChild(card);
    });

    // Check if more items remain
    const totalRendered = Math.min(end, hubFilteredTemplates.length);
    if (totalRendered < hubFilteredTemplates.length) {
      const sentinel = document.createElement('div');
      sentinel.id = 'templateInfiniteSentinel';
      sentinel.className = 'template-sentinel-loader';
      sentinel.innerHTML = `
        <div class="template-sentinel-info">
          <span>📜</span>
          <span>Showing <strong style="color:var(--text-primary);">${totalRendered}</strong> of <strong style="color:var(--text-primary);">${hubFilteredTemplates.length}</strong> templates</span>
          <span class="template-sentinel-badge">+${hubFilteredTemplates.length - totalRendered} More</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn btn-sm btn-primary" id="loadMoreTemplatesBtn">
            ⚡ Load Next ${Math.min(TEMPLATE_PAGE_SIZE, hubFilteredTemplates.length - totalRendered)}
          </button>
          <button type="button" class="btn btn-sm" id="loadAllTemplatesBtn">
            Show All (${hubFilteredTemplates.length})
          </button>
        </div>
      `;

      dom.templateGridContainer.appendChild(sentinel);

      const loadMoreBtn = document.getElementById('loadMoreTemplatesBtn');
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
          currentTemplatePage++;
          appendNextTemplateBatch();
        });
      }

      const loadAllBtn = document.getElementById('loadAllTemplatesBtn');
      if (loadAllBtn) {
        loadAllBtn.addEventListener('click', () => {
          currentTemplatePage = Math.ceil(hubFilteredTemplates.length / TEMPLATE_PAGE_SIZE);
          const remainingBatch = hubFilteredTemplates.slice(totalRendered);
          if (sentinel) sentinel.remove();
          remainingBatch.forEach(t => {
            dom.templateGridContainer.appendChild(renderTemplateCardElement(t));
          });
        });
      }

      // IntersectionObserver for auto-loading on scroll
      if ('IntersectionObserver' in window) {
        if (templateObserver) templateObserver.disconnect();
        templateObserver = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            templateObserver.disconnect();
            currentTemplatePage++;
            appendNextTemplateBatch();
          }
        }, { rootMargin: '200px' });
        templateObserver.observe(sentinel);
      }
    }
  }

  function renderTemplateHub() {
    const query = dom.templateSearchInput ? dom.templateSearchInput.value.toLowerCase().trim() : '';
    const activeCatPill = document.querySelector('.cat-pill.active[data-category]');
    const activeCat = activeCatPill ? activeCatPill.getAttribute('data-category') : 'all';

    const allTemplates = [...BUILTIN_TEMPLATES, ...state.vault];
    
    hubFilteredTemplates = allTemplates.filter(t => {
      const isCustom = t.id.startsWith('custom-') || state.vault.some(v => v.id === t.id);
      let matchCat = false;
      if (activeCat === 'all') {
        matchCat = true;
      } else if (activeCat === 'my-prompts') {
        matchCat = isCustom;
      } else {
        matchCat = (t.category || '').toLowerCase() === activeCat.toLowerCase();
      }
      const searchableContent = [
        t.title || '',
        t.description || '',
        t.role || '',
        t.context || '',
        t.task || '',
        Array.isArray(t.constraints) ? t.constraints.join(' ') : (t.constraints || ''),
        t.outputFormat || '',
        t.category || '',
        t.fewShot || '',
        (t.variables || []).map(v => `${v.name || ''} ${v.label || ''} ${v.default || ''}`).join(' ')
      ].join(' ').toLowerCase();

      const matchQuery = !query || searchableContent.includes(query);
      return matchCat && matchQuery;
    });

    currentTemplatePage = 1;
    dom.templateGridContainer.innerHTML = '';

    if (hubFilteredTemplates.length === 0) {
      if (activeCat === 'my-prompts') {
        dom.templateGridContainer.innerHTML = `
          <div class="empty-state-card">
            <div class="empty-state-icon">⭐</div>
            <h3 class="empty-state-title">Your Custom Templates Collection is Empty</h3>
            <p class="empty-state-desc">You haven't saved any custom prompts yet. Craft your prompt in Studio and save it to your Vault to access it here anytime!</p>
            <div class="empty-state-actions">
              <button class="btn btn-sm btn-primary" id="emptyMyPromptsStudioBtn">✨ Create in Prompt Studio</button>
              <button class="btn btn-sm btn-secondary" id="emptyMyPromptsAllBtn">📚 Browse Starter Templates</button>
            </div>
          </div>
        `;
        const studioBtn = document.getElementById('emptyMyPromptsStudioBtn');
        if (studioBtn) {
          studioBtn.addEventListener('click', () => {
            const studioNav = document.querySelector('.nav-item[data-tab="tab-studio"]');
            if (studioNav) studioNav.click();
          });
        }
        const allBtn = document.getElementById('emptyMyPromptsAllBtn');
        if (allBtn) {
          allBtn.addEventListener('click', () => {
            dom.categoryPills.forEach(p => p.classList.remove('active'));
            const allPill = document.querySelector('.cat-pill[data-category="all"]');
            if (allPill) allPill.classList.add('active');
            renderTemplateHub();
          });
        }
      } else {
        const queryTerm = query ? `matching "${escapeHtml(query)}"` : `in category "${escapeHtml(activeCat)}"`;
        dom.templateGridContainer.innerHTML = `
          <div class="empty-state-card">
            <div class="empty-state-icon">🔍</div>
            <h3 class="empty-state-title">No templates found ${queryTerm}</h3>
            <p class="empty-state-desc">We couldn't find any templates matching your current filter. Try searching for broader terms like "email", "coding", or "summary".</p>
            <div class="empty-state-actions">
              <button class="btn btn-sm btn-primary" id="emptyResetSearchBtn">🔄 Clear Filters & Show All</button>
            </div>
          </div>
        `;
        const resetBtn = document.getElementById('emptyResetSearchBtn');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            if (dom.templateSearchInput) dom.templateSearchInput.value = '';
            dom.categoryPills.forEach(p => p.classList.remove('active'));
            const allPill = document.querySelector('.cat-pill[data-category="all"]');
            if (allPill) allPill.classList.add('active');
            renderTemplateHub();
          });
        }
      }
      return;
    }

    appendNextTemplateBatch();
  }

  async function loadTemplateIntoStudio(tpl) {
    if (isStudioDraftDirty()) {
      const confirmed = await showConfirmDialog({
        title: "Load Template & Replace Draft?",
        message: `Loading "${tpl.title}" will overwrite your active Studio prompt. Would you like to continue?`,
        confirmText: "⚡ Load & Replace",
        confirmClass: "btn-primary",
        icon: "⚡"
      });
      if (!confirmed) return;
    }

    state.currentPrompt.role = tpl.role || '';
    state.currentPrompt.context = tpl.context || '';
    state.currentPrompt.task = tpl.task || '';
    state.currentPrompt.constraints = Array.isArray(tpl.constraints) ? tpl.constraints.join('\n') : (tpl.constraints || '');
    state.currentPrompt.outputFormat = tpl.outputFormat || '';
    state.currentPrompt.fewShot = tpl.fewShot || '';
    
    if (tpl.targetModel) {
      state.targetModel = tpl.targetModel;
      dom.modelSelect.value = tpl.targetModel;
      updateModelIdInputVisibility();
    }

    initFormValues();
    
    // Switch to Studio Tab
    document.querySelector('.nav-item[data-tab="tab-studio"]').click();
    updateLivePreview();
    showToast(`Loaded "${tpl.title}" into Studio! 🚀`);
  }

  // --- Template Hub Progressive Lazy Loading & Renderer ---

  let templateSearchDebounceTimer = null;

  /**
   * Renders animated glassmorphic skeleton cards during template search & filtering.
   * @param {number} [count=4] Number of placeholder cards to render
   */
  function renderTemplateHubSkeletons(count = 4) {
    if (!dom.templateGridContainer) return;
    dom.templateGridContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const skel = document.createElement('div');
      skel.className = 'skeleton-card';
      skel.innerHTML = `
        <div class="skeleton-header">
          <div class="skeleton-shimmer skeleton-title"></div>
          <div class="skeleton-shimmer skeleton-badge"></div>
        </div>
        <div class="skeleton-desc">
          <div class="skeleton-shimmer skeleton-line"></div>
          <div class="skeleton-shimmer skeleton-line short"></div>
        </div>
        <div class="skeleton-footer">
          <div class="skeleton-shimmer skeleton-tag"></div>
          <div class="skeleton-shimmer skeleton-btn"></div>
        </div>
      `;
      dom.templateGridContainer.appendChild(skel);
    }
  }

  function handleTemplateSearchInput() {
    renderTemplateHubSkeletons(4);
    if (templateSearchDebounceTimer) {
      clearTimeout(templateSearchDebounceTimer);
    }
    templateSearchDebounceTimer = setTimeout(() => {
      renderTemplateHub();
    }, 120);
  }

  if (dom.templateSearchInput) {
    dom.templateSearchInput.addEventListener('input', handleTemplateSearchInput);
  }

  dom.categoryPills.forEach(pill => {
    pill.addEventListener('click', () => {
      dom.categoryPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderTemplateHubSkeletons(4);
      setTimeout(() => {
        renderTemplateHub();
      }, 80);
    });
  });

  // --- Vault Manager & Local Directory Sync ---

  function initVaultSyncStatus() {
    const isSupported = typeof window.showDirectoryPicker === 'function';

    if (!isSupported) {
      if (dom.vaultSyncStatus) {
        dom.vaultSyncStatus.textContent = 'Saved in browser memory ℹ️';
        dom.vaultSyncStatus.title = 'Direct folder sync requires Chrome or Edge — your prompts are safely preserved in browser local storage.';
      }
      if (dom.connectFolderBtn) {
        dom.connectFolderBtn.title = 'Direct folder sync requires Chrome or Edge.';
        dom.connectFolderBtn.style.opacity = '0.7';
      }
      if (dom.connectFolderBtnVault) {
        dom.connectFolderBtnVault.title = 'Direct folder sync requires Chrome or Edge.';
        dom.connectFolderBtnVault.style.opacity = '0.7';
      }
    } else {
      if (dom.vaultSyncStatus) {
        dom.vaultSyncStatus.title = 'Prompts are automatically saved in browser memory. Connect a folder (Chrome/Edge) to sync real .json files to your computer.';
      }
      const lastFolder = localStorage.getItem('ph_last_folder_name');
      if (lastFolder && !state.directoryHandle && dom.vaultReconnectBanner) {
        dom.vaultReconnectBanner.style.display = 'flex';
        if (dom.vaultLastFolderName) {
          dom.vaultLastFolderName.textContent = lastFolder;
        }
      }
    }
  }

  if (dom.connectFolderBtn) {
    dom.connectFolderBtn.addEventListener('click', async () => {
      if (typeof window.showDirectoryPicker !== 'function') {
        showToast("Folder sync requires Google Chrome or Microsoft Edge. Prompts are saved in your browser!");
        return;
      }
      try {
        state.directoryHandle = await window.showDirectoryPicker();
        await updateVaultFromLocalDirectory();
        showToast(`Connected local folder: "${state.directoryHandle.name}"! 📁`);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error("Directory picker error or cancelled:", err);
        }
      }
    });
  }

  if (dom.reconnectFolderBtn) {
    dom.reconnectFolderBtn.addEventListener('click', () => {
      if (dom.connectFolderBtn) dom.connectFolderBtn.click();
    });
  }

  if (dom.dismissReconnectFolderBtn) {
    dom.dismissReconnectFolderBtn.addEventListener('click', () => {
      if (dom.vaultReconnectBanner) dom.vaultReconnectBanner.style.display = 'none';
      localStorage.removeItem('ph_last_folder_name');
    });
  }

  async function updateVaultFromLocalDirectory() {
    if (!state.directoryHandle) return;
    
    const opt = { mode: 'readwrite' };
    try {
      if ((await state.directoryHandle.queryPermission(opt)) !== 'granted') {
        if ((await state.directoryHandle.requestPermission(opt)) !== 'granted') {
          showToast("Write permission denied. Connected as read-only.");
        }
      }
    } catch (e) {
      console.warn("Could not query filesystem permissions:", e);
    }

    // Persist folder name for seamless reconnect prompt across sessions
    localStorage.setItem('ph_last_folder_name', state.directoryHandle.name);
    if (dom.vaultReconnectBanner) dom.vaultReconnectBanner.style.display = 'none';
    
    state.vault = [];
    state.vaultFileHandles = {};
    
    for await (const entry of state.directoryHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
        try {
          const file = await entry.getFile();
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (parsed && (parsed.id || parsed.title)) {
            if (!parsed.id) parsed.id = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            state.vaultFileHandles[parsed.id] = entry.name;
            state.vault.push(parsed);
          }
        } catch (e) {
          console.error("Failed to parse local vault template file:", entry.name, e);
        }
      }
    }
    
    state.vault.sort((a, b) => b.id.localeCompare(a.id));
    
    if (dom.vaultSyncStatus) {
      dom.vaultSyncStatus.textContent = `Connected: ${state.directoryHandle.name}`;
      dom.vaultSyncStatus.style.background = 'rgba(16, 185, 129, 0.1)';
      dom.vaultSyncStatus.style.borderColor = 'var(--accent-emerald)';
      dom.vaultSyncStatus.style.color = 'var(--accent-emerald)';
      dom.vaultSyncStatus.title = `Connected to local folder "${state.directoryHandle.name}". New prompts will save directly as .json files.`;
    }
    
    renderVault();
    renderTemplateHub();
  }

  // --- In-App Accessible Dialog Controllers (Confirm & Input) ---
  /**
   * Prompts user with an accessible modal dialog resolving to a boolean confirmation.
   * @param {Object} options Configuration options
   * @param {string} [options.title="Confirm Action"] Modal header title
   * @param {string} [options.message="Are you sure?"] Body message prompt
   * @param {string} [options.confirmText="Confirm"] Label for confirm button
   * @param {string} [options.confirmClass="btn-primary"] CSS class for confirm button
   * @param {string} [options.icon="⚠️"] Icon prefix in title
   * @returns {Promise<boolean>} Resolves true if confirmed, false if cancelled
   */
  function showConfirmDialog({ title = "Confirm Action", message = "Are you sure?", confirmText = "Confirm", confirmClass = "btn-primary", icon = "⚠️" }) {
    return new Promise((resolve) => {
      if (!dom.confirmModal) {
        resolve(confirm(message));
        return;
      }
      
      const trigger = document.activeElement;
      if (dom.confirmModalTitle) dom.confirmModalTitle.innerHTML = `<span>${icon}</span> ${escapeHtml(title)}`;
      if (dom.confirmModalMessage) dom.confirmModalMessage.textContent = message;
      if (dom.confirmModalActionBtn) {
        dom.confirmModalActionBtn.textContent = confirmText;
        dom.confirmModalActionBtn.className = `btn btn-sm ${confirmClass}`;
      }

      const onConfirm = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };

      function cleanup() {
        if (dom.confirmModalActionBtn) dom.confirmModalActionBtn.removeEventListener('click', onConfirm);
        if (dom.confirmModalCancelBtn) dom.confirmModalCancelBtn.removeEventListener('click', onCancel);
        if (dom.closeConfirmModalBtn) dom.closeConfirmModalBtn.removeEventListener('click', onCancel);
        closeModal(dom.confirmModal);
      }

      if (dom.confirmModalActionBtn) dom.confirmModalActionBtn.addEventListener('click', onConfirm);
      if (dom.confirmModalCancelBtn) dom.confirmModalCancelBtn.addEventListener('click', onCancel);
      if (dom.closeConfirmModalBtn) dom.closeConfirmModalBtn.addEventListener('click', onCancel);

      openModal(dom.confirmModal, trigger);
    });
  }

  /**
   * Prompts user with an accessible text input modal resolving to string input or null.
   * @param {Object} options Configuration options
   * @param {string} [options.title="Enter Information"] Modal header title
   * @param {string} [options.message=""] Description message
   * @param {string} [options.defaultValue=""] Initial input value
   * @param {string} [options.placeholder=""] Input placeholder
   * @param {string} [options.submitText="Save"] Label for submit button
   * @param {string} [options.icon="✏️"] Icon prefix in title
   * @returns {Promise<string|null>} Resolves with trimmed text value or null if cancelled
   */
  function showInputPromptDialog({ title = "Enter Information", message = "", defaultValue = "", placeholder = "", submitText = "Save", icon = "✏️" }) {
    return new Promise((resolve) => {
      if (!dom.inputPromptModal) {
        resolve(prompt(message, defaultValue));
        return;
      }

      const trigger = document.activeElement;
      if (dom.inputPromptModalTitle) dom.inputPromptModalTitle.innerHTML = `<span>${icon}</span> ${escapeHtml(title)}`;
      if (dom.inputPromptModalMessage) dom.inputPromptModalMessage.textContent = message;
      if (dom.inputPromptModalInput) {
        dom.inputPromptModalInput.value = defaultValue;
        dom.inputPromptModalInput.placeholder = placeholder;
      }
      if (dom.inputPromptModalSubmitBtn) dom.inputPromptModalSubmitBtn.textContent = submitText;

      const onSubmit = () => { 
        const val = dom.inputPromptModalInput ? dom.inputPromptModalInput.value : '';
        cleanup(); 
        resolve(val); 
      };
      const onCancel = () => { cleanup(); resolve(null); };

      const onKeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit();
        }
      };

      function cleanup() {
        if (dom.inputPromptModalSubmitBtn) dom.inputPromptModalSubmitBtn.removeEventListener('click', onSubmit);
        if (dom.inputPromptModalCancelBtn) dom.inputPromptModalCancelBtn.removeEventListener('click', onCancel);
        if (dom.closeInputPromptModalBtn) dom.closeInputPromptModalBtn.removeEventListener('click', onCancel);
        if (dom.inputPromptModalInput) dom.inputPromptModalInput.removeEventListener('keydown', onKeydown);
        closeModal(dom.inputPromptModal);
      }

      if (dom.inputPromptModalSubmitBtn) dom.inputPromptModalSubmitBtn.addEventListener('click', onSubmit);
      if (dom.inputPromptModalCancelBtn) dom.inputPromptModalCancelBtn.addEventListener('click', onCancel);
      if (dom.closeInputPromptModalBtn) dom.closeInputPromptModalBtn.addEventListener('click', onCancel);
      if (dom.inputPromptModalInput) dom.inputPromptModalInput.addEventListener('keydown', onKeydown);

      openModal(dom.inputPromptModal, trigger);
    });
  }

  // --- Prompt Vault Search, Filter & Rating Controller ---
  /**
   * Persists updated metadata (e.g. star rating, performance notes) for a Vault item to storage and disk.
   * @param {TemplateItem} item Modified vault prompt item
   */
  async function updateVaultItemOnDisk(item) {
    SafeStorage.setItem('ph_vault', JSON.stringify(state.vault));
    if (state.directoryHandle && item.id) {
      const filename = state.vaultFileHandles[item.id];
      if (filename) {
        try {
          const fileHandle = await state.directoryHandle.getFileHandle(filename, { create: false });
          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(item, null, 2));
          await writable.close();
        } catch (e) {
          console.warn("Could not sync rating/notes update to disk:", e);
        }
      }
    }
  }

  /**
   * Renders the collection of custom user-saved prompts into the Vault tab grid.
   */
  function renderVault() {
    dom.vaultGridContainer.innerHTML = '';

    if (state.vault.length === 0) {
      const isConnected = !!state.directoryHandle;
      dom.vaultGridContainer.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-state-icon">${isConnected ? '📂' : '💾'}</div>
          <h3 class="empty-state-title">${isConnected ? 'Connected Folder is Empty' : 'Your Prompt Vault is Empty'}</h3>
          <p class="empty-state-desc">
            ${isConnected 
              ? `Connected to local folder "${escapeHtml(state.directoryHandle.name)}". No .json prompt files found. Save a prompt from Studio to write directly to your drive!`
              : 'Save your prompt templates locally in this browser, or connect a local PC folder to sync real .json prompt files with your file system.'
            }
          </p>
          <div class="empty-state-actions">
            <button class="btn btn-sm btn-primary" id="emptyVaultStudioBtn">🛠️ Open Studio to Build Prompt</button>
            ${!isConnected ? '<button class="btn btn-sm btn-secondary" id="emptyVaultConnectBtn">📂 Connect Local Folder</button>' : ''}
          </div>
        </div>
      `;

      const vaultStudioBtn = document.getElementById('emptyVaultStudioBtn');
      if (vaultStudioBtn) {
        vaultStudioBtn.addEventListener('click', () => {
          const studioNav = document.querySelector('.nav-item[data-tab="tab-studio"]');
          if (studioNav) studioNav.click();
        });
      }
      const vaultConnectBtn = document.getElementById('emptyVaultConnectBtn');
      if (vaultConnectBtn) {
        vaultConnectBtn.addEventListener('click', () => {
          if (dom.connectFolderBtn) dom.connectFolderBtn.click();
        });
      }
      return;
    }

    // Filter items
    let filtered = state.vault.filter(item => {
      // 1. Search Query
      if (vaultSearchQuery) {
        const content = [
          item.title || '',
          item.description || '',
          item.notes || '',
          item.category || '',
          item.task || '',
          item.role || ''
        ].join(' ').toLowerCase();
        if (!content.includes(vaultSearchQuery)) return false;
      }

      // 2. Rating & Notes Filters
      const r = item.rating || 0;
      if (vaultActiveFilter === 'rating-5') return r === 5;
      if (vaultActiveFilter === 'rating-4') return r >= 4;
      if (vaultActiveFilter === 'rating-3') return r >= 3;
      if (vaultActiveFilter === 'has-notes') return !!(item.notes && item.notes.trim().length > 0);

      return true;
    });

    // Sort items
    if (vaultSortOrder === 'highest-rating') {
      filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (vaultSortOrder === 'alpha') {
      filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    if (filtered.length === 0) {
      dom.vaultGridContainer.innerHTML = `
        <div class="empty-state-card" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">🔍</div>
          <h3 class="empty-state-title">No matching prompts found</h3>
          <p class="empty-state-desc">No saved prompts match your search "${escapeHtml(vaultSearchQuery)}" or active filter.</p>
          <div class="empty-state-actions">
            <button class="btn btn-sm btn-primary" id="resetVaultFilterBtn">🔄 Reset Search & Filters</button>
          </div>
        </div>
      `;
      const resetBtn = document.getElementById('resetVaultFilterBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          vaultSearchQuery = '';
          vaultActiveFilter = 'all';
          if (dom.vaultSearchInput) dom.vaultSearchInput.value = '';
          document.querySelectorAll('.vault-filter-pills .cat-pill').forEach(p => {
            if (p.getAttribute('data-vault-filter') === 'all') p.classList.add('active');
            else p.classList.remove('active');
          });
          renderVault();
        });
      }
      return;
    }

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'template-card';
      const itemRating = item.rating || 0;
      const hasNotes = item.notes && item.notes.trim().length > 0;

      // Build stars HTML
      let starsHtml = '';
      for (let s = 1; s <= 5; s++) {
        const isFilled = s <= itemRating;
        starsHtml += `<button type="button" class="star-btn ${isFilled ? 'active' : ''}" data-star="${s}" data-id="${escapeHtml(item.id)}" title="Rate ${s} star${s > 1 ? 's' : ''}">★</button>`;
      }

      card.innerHTML = `
        <div class="card-header-top">
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <span class="badge-custom">${state.directoryHandle ? 'Local File' : 'Vault Item'}</span>
        </div>
        <p class="card-desc">${escapeHtml(item.description || 'Custom user prompt saved from Studio.')}</p>

        <!-- Star Rating Widget -->
        <div class="vault-card-rating-row">
          <div class="star-rating-widget" data-id="${escapeHtml(item.id)}">
            ${starsHtml}
          </div>
          <span class="rating-score-label">${itemRating > 0 ? `⭐ ${itemRating}.0 / 5.0` : '<span style="color:var(--text-muted); font-size:0.75rem;">Not rated</span>'}</span>
        </div>

        <!-- Model Performance Notes & Feedback Box -->
        <div class="vault-card-notes" data-id="${escapeHtml(item.id)}" title="Click to view or edit model performance notes">
          <div class="vault-card-notes-header">
            <span>💬 Model Performance Notes</span>
            <span style="font-size:0.75rem;">✏️ Edit</span>
          </div>
          ${hasNotes 
            ? `<div class="vault-notes-text">"${escapeHtml(item.notes)}"</div>` 
            : `<div class="vault-notes-placeholder"><span>+ Add performance note / model review...</span></div>`
          }
        </div>

        <div class="card-footer">
          <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">${escapeHtml(item.category || 'General')}</span>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm btn-rose delete-vault-btn" data-id="${escapeHtml(item.id)}">Delete 🗑️</button>
            <button class="btn btn-sm load-tpl-btn" data-id="${escapeHtml(item.id)}">Use This Template</button>
          </div>
        </div>
      `;
      dom.vaultGridContainer.appendChild(card);
    });

    // Star Click Handlers
    dom.vaultGridContainer.querySelectorAll('.star-btn').forEach(starBtn => {
      starBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = starBtn.getAttribute('data-id');
        const starVal = parseInt(starBtn.getAttribute('data-star'), 10);
        const item = state.vault.find(v => v.id === id);
        if (!item) return;

        if (item.rating === starVal) {
          item.rating = 0;
          showToast(`Cleared rating for "${item.title}".`);
        } else {
          item.rating = starVal;
          showToast(`Rated "${item.title}" ${starVal} star${starVal > 1 ? 's' : ''}! ⭐`);
        }

        await updateVaultItemOnDisk(item);
        renderVault();
      });
    });

    // Notes Click Handlers (Edit Notes dialog)
    dom.vaultGridContainer.querySelectorAll('.vault-card-notes').forEach(notesBox => {
      notesBox.addEventListener('click', async () => {
        const id = notesBox.getAttribute('data-id');
        const item = state.vault.find(v => v.id === id);
        if (!item) return;

        const newNotes = await showInputPromptDialog({
          title: `Performance Notes: ${item.title}`,
          message: "Record performance notes or model feedback (e.g. 'Best on Claude 3.5 Sonnet; add few-shot for GPT-4o'):",
          defaultValue: item.notes || '',
          placeholder: "e.g. High accuracy with temperature 0.2...",
          submitText: "Save Notes",
          icon: "💬"
        });

        if (newNotes !== null) {
          item.notes = newNotes.trim();
          await updateVaultItemOnDisk(item);
          renderVault();
          showToast(`Updated performance notes for "${item.title}"! 💬`);
        }
      });
    });

    // Delete Handlers
    dom.vaultGridContainer.querySelectorAll('.delete-vault-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        const idx = state.vault.findIndex(v => v.id === id);
        if (idx === -1) return;
        const item = state.vault[idx];
        const title = item ? item.title : "this prompt";

        const confirmed = await showConfirmDialog({
          title: "Delete Prompt?",
          message: `Are you sure you want to delete "${title}" from your Vault? This action cannot be undone.`,
          confirmText: "🗑️ Delete Prompt",
          confirmClass: "btn-rose",
          icon: "🗑️"
        });
        if (!confirmed) return;
        
        if (state.directoryHandle) {
          const filename = state.vaultFileHandles[id];
          if (filename) {
            try {
              await state.directoryHandle.removeEntry(filename);
              showToast('Deleted file from connected folder.');
              await updateVaultFromLocalDirectory();
              return;
            } catch (err) {
              console.error("Failed to delete local template file:", filename, err);
            }
          }
        }
        
        state.vault.splice(idx, 1);
        localStorage.setItem('ph_vault', JSON.stringify(state.vault));
        renderVault();
        renderTemplateHub();
        showToast('Deleted prompt from Vault.');
      });
    });

    // Use Template Handlers
    dom.vaultGridContainer.querySelectorAll('.load-tpl-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        const found = state.vault.find(x => x.id === id);
        if (found) {
          loadTemplateIntoStudio(found);
        }
      });
    });
  }

  // Vault Search and Filter Listeners
  if (dom.vaultSearchInput) {
    dom.vaultSearchInput.addEventListener('input', () => {
      vaultSearchQuery = dom.vaultSearchInput.value.toLowerCase().trim();
      renderVault();
    });
  }

  if (dom.vaultSortSelect) {
    dom.vaultSortSelect.addEventListener('change', () => {
      vaultSortOrder = dom.vaultSortSelect.value;
      renderVault();
    });
  }

  document.querySelectorAll('.vault-filter-pills .cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.vault-filter-pills .cat-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      vaultActiveFilter = pill.getAttribute('data-vault-filter') || 'all';
      renderVault();
    });
  });

  // --- Save to Vault Modal Controller ---
  function updateModalStarPicker(val) {
    savePromptRating = val;
    const stars = document.querySelectorAll('.modal-star-picker .modal-star-btn');
    stars.forEach(btn => {
      const s = parseInt(btn.getAttribute('data-star'), 10);
      if (s <= val) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    if (dom.savePromptRatingText) {
      dom.savePromptRatingText.textContent = val > 0 ? `${val} / 5 Stars ⭐` : 'Unrated';
    }
  }

  // Wire modal star click
  document.querySelectorAll('.modal-star-picker .modal-star-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = parseInt(btn.getAttribute('data-star'), 10);
      if (savePromptRating === s) {
        updateModalStarPicker(0);
      } else {
        updateModalStarPicker(s);
      }
    });
  });

  function openSavePromptModal() {
    if (!dom.savePromptModal) return;
    const defaultTitle = state.currentPrompt.role || (state.currentPrompt.task ? state.currentPrompt.task.substring(0, 32).trim() : "Custom Prompt");
    if (dom.savePromptTitleInput) {
      dom.savePromptTitleInput.value = defaultTitle;
    }
    if (dom.savePromptDescInput) {
      dom.savePromptDescInput.value = state.currentPrompt.context ? state.currentPrompt.context.substring(0, 60).trim() : 'Custom prompt saved from Studio.';
    }
    if (dom.savePromptNotesInput) {
      dom.savePromptNotesInput.value = '';
    }
    updateModalStarPicker(0);

    selectedSaveCategory = 'writing';
    if (dom.saveCategoryPills) {
      dom.saveCategoryPills.forEach(p => {
        if (p.getAttribute('data-save-cat') === 'writing') {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
    }

    openModal(dom.savePromptModal, dom.saveCurrentPromptBtn);
  }

  function closeSavePromptModal() {
    closeModal(dom.savePromptModal);
  }

  if (dom.saveCurrentPromptBtn) {
    dom.saveCurrentPromptBtn.addEventListener('click', openSavePromptModal);
  }

  if (dom.closeSavePromptModalBtn) {
    dom.closeSavePromptModalBtn.addEventListener('click', closeSavePromptModal);
  }

  if (dom.savePromptCancelBtn) {
    dom.savePromptCancelBtn.addEventListener('click', closeSavePromptModal);
  }

  if (dom.saveCategoryPills) {
    dom.saveCategoryPills.forEach(pill => {
      pill.addEventListener('click', () => {
        dom.saveCategoryPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        selectedSaveCategory = pill.getAttribute('data-save-cat') || 'writing';
      });
    });
  }

  if (dom.savePromptConfirmBtn) {
    dom.savePromptConfirmBtn.addEventListener('click', async () => {
      const title = dom.savePromptTitleInput ? dom.savePromptTitleInput.value.trim() : '';
      if (!title) {
        showToast("Please enter a title for your prompt!");
        if (dom.savePromptTitleInput) dom.savePromptTitleInput.focus();
        return;
      }

      const desc = (dom.savePromptDescInput && dom.savePromptDescInput.value.trim())
        ? dom.savePromptDescInput.value.trim()
        : 'Saved custom prompt template.';

      const notes = (dom.savePromptNotesInput && dom.savePromptNotesInput.value.trim())
        ? dom.savePromptNotesInput.value.trim()
        : '';

      const newItem = {
        id: `custom-${Date.now()}`,
        title: title,
        category: selectedSaveCategory,
        description: desc,
        rating: savePromptRating || 0,
        notes: notes,
        role: state.currentPrompt.role || '',
        context: state.currentPrompt.context || '',
        task: state.currentPrompt.task || '',
        constraints: state.currentPrompt.constraints || '',
        outputFormat: state.currentPrompt.outputFormat || '',
        fewShot: state.currentPrompt.fewShot || ''
      };

      closeSavePromptModal();

      if (state.directoryHandle) {
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const filename = `${cleanTitle}_${Date.now()}.json`;
        try {
          const fileHandle = await state.directoryHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(newItem, null, 2));
          await writable.close();
          
          showToast(`Saved "${title}" to local folder! 💾`);
          await updateVaultFromLocalDirectory();
          return;
        } catch (err) {
          console.error("Failed to save template to local directory:", err);
          showToast("Failed to write to folder. Saving to browser memory fallback.");
        }
      }

      state.vault.unshift(newItem);
      localStorage.setItem('ph_vault', JSON.stringify(state.vault));
      renderVault();
      renderTemplateHub();
      showToast(`Saved "${title}" to Vault (${selectedSaveCategory.toUpperCase()})! 💾`);
    });
  }

  if (dom.connectFolderBtnVault) {
    dom.connectFolderBtnVault.addEventListener('click', () => {
      if (dom.connectFolderBtn) dom.connectFolderBtn.click();
    });
  }

  // --- Prompt Chain Builder Controller ---
  
  function getActiveChain() {
    if (!state.activeChain || !Array.isArray(state.activeChain.steps)) {
      const saved = localStorage.getItem('ph_active_chain');
      if (saved) {
        try {
          state.activeChain = JSON.parse(saved);
        } catch (e) {}
      }
      if (!state.activeChain || !Array.isArray(state.activeChain.steps)) {
        if (typeof BUILTIN_CHAINS !== 'undefined' && BUILTIN_CHAINS.length > 0) {
          state.activeChain = JSON.parse(JSON.stringify(BUILTIN_CHAINS[0]));
        } else {
          state.activeChain = {
            id: "custom-chain",
            title: "Custom Multi-Step Chain",
            steps: [
              {
                id: "step-1",
                name: "Step 1: Information Extraction",
                targetModel: "gemini",
                role: "Research Specialist",
                task: "Analyze {{topic}} and extract key takeaways.",
                constraints: "Be concise.",
                outputFormat: "Bulleted list.",
                variables: [{ name: "topic", label: "Topic", default: "Modern AI Engineering" }],
                output: ""
              }
            ]
          };
        }
      }
    }
    return state.activeChain;
  }

  function saveActiveChain() {
    localStorage.setItem('ph_active_chain', JSON.stringify(state.activeChain));
  }

  function assembleStepPrompt(step, idx, allSteps) {
    let text = '';
    const role = step.role || '';
    const task = step.task || '';
    const constraints = step.constraints || '';
    const outputFormat = step.outputFormat || '';

    // Replace variables in task/role
    let compiledTask = task;
    (step.variables || []).forEach(v => {
      const val = v.default || '';
      const regex = new RegExp(`{{\\s*${v.name}\\s*}}`, 'gi');
      compiledTask = compiledTask.replace(regex, val);
    });

    // Replace previous step outputs (e.g. {{step1_output}}, {{step2_output}})
    for (let k = 0; k < idx; k++) {
      const prevStep = allSteps[k];
      const prevOut = (prevStep && prevStep.output && prevStep.output.trim().length > 0) 
        ? prevStep.output.trim() 
        : `[Awaiting output from Step ${k + 1}: ${prevStep.name}]`;
      const stepTagRegex = new RegExp(`{{\\s*step${k + 1}_output\\s*}}`, 'gi');
      compiledTask = compiledTask.replace(stepTagRegex, prevOut);
    }

    if (role) {
      text += `[SYSTEM / ROLE]\n${role}\n\n`;
    }
    if (compiledTask) {
      text += `[TASK & INSTRUCTIONS]\n${compiledTask}\n\n`;
    }
    if (constraints) {
      text += `[RULES & CONSTRAINTS]\n${constraints}\n\n`;
    }
    if (outputFormat) {
      text += `[DESIRED OUTPUT FORMAT]\n${outputFormat}\n\n`;
    }

    return text.trim();
  }

  function renderChainBuilder() {
    if (!dom.chainStepsContainer || !dom.chainTrackerBar) return;
    const chain = getActiveChain();
    const steps = chain.steps;

    // 1. Render Progress Tracker Bar
    dom.chainTrackerBar.innerHTML = '';
    steps.forEach((step, idx) => {
      const isDone = !!(step.output && step.output.trim().length > 0);
      const isReady = idx === 0 || !!(steps[idx - 1].output && steps[idx - 1].output.trim().length > 0);

      const trackStep = document.createElement('div');
      trackStep.className = `chain-tracker-step ${isDone ? 'completed' : (isReady ? 'active' : '')}`;
      trackStep.innerHTML = `
        <span>${isDone ? '✓' : (isReady ? '⚡' : '⏳')}</span>
        <span>Step ${idx + 1}: <strong>${escapeHtml(step.name || `Step ${idx + 1}`)}</strong></span>
      `;
      trackStep.addEventListener('click', () => {
        const targetCard = document.getElementById(`chainCard_${step.id}`);
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      dom.chainTrackerBar.appendChild(trackStep);

      if (idx < steps.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'chain-tracker-arrow';
        arrow.textContent = '➔';
        dom.chainTrackerBar.appendChild(arrow);
      }
    });

    // 2. Render Step Cards & Flow Connectors
    dom.chainStepsContainer.innerHTML = '';

    steps.forEach((step, idx) => {
      const isDone = !!(step.output && step.output.trim().length > 0);
      const compiledPrompt = assembleStepPrompt(step, idx, steps);

      const card = document.createElement('div');
      card.id = `chainCard_${step.id}`;
      card.className = `chain-step-card ${isDone ? 'step-completed' : ''}`;

      card.innerHTML = `
        <div class="chain-step-header">
          <div class="chain-step-title-group">
            <span class="chain-step-number-badge">Step ${idx + 1}</span>
            <input type="text" class="chain-step-name-input" data-step-id="${escapeHtml(step.id)}" value="${escapeHtml(step.name || '')}" placeholder="Step Title...">
          </div>
          <div class="chain-step-actions">
            <select class="custom-select chain-step-model-select" data-step-id="${escapeHtml(step.id)}" style="height: 30px; font-size: 0.775rem; padding: 2px 8px;">
              <option value="gemini" ${step.targetModel === 'gemini' ? 'selected' : ''}>✨ Google Gemini</option>
              <option value="claude" ${step.targetModel === 'claude' ? 'selected' : ''}>🧠 Anthropic Claude</option>
              <option value="chatgpt" ${step.targetModel === 'chatgpt' ? 'selected' : ''}>🤖 OpenAI ChatGPT</option>
              <option value="deepseek" ${step.targetModel === 'deepseek' ? 'selected' : ''}>⚡ DeepSeek Reasoner</option>
            </select>
            ${idx > 0 ? `<button type="button" class="btn btn-sm btn-icon move-step-up-btn" data-idx="${idx}" title="Move Step Up">⬆️</button>` : ''}
            ${idx < steps.length - 1 ? `<button type="button" class="btn btn-sm btn-icon move-step-down-btn" data-idx="${idx}" title="Move Step Down">⬇️</button>` : ''}
            ${steps.length > 1 ? `<button type="button" class="btn btn-sm btn-icon btn-rose delete-chain-step-btn" data-step-id="${escapeHtml(step.id)}" title="Delete Step">🗑️</button>` : ''}
          </div>
        </div>

        <div class="chain-step-grid">
          <!-- Left Column: Step Configuration -->
          <div class="chain-step-editor-col">
            <div class="form-group">
              <label class="form-label" style="font-size: 0.775rem;">System Role / Persona</label>
              <input type="text" class="form-input chain-step-role-input" data-step-id="${escapeHtml(step.id)}" value="${escapeHtml(step.role || '')}" placeholder="e.g. Senior Copywriter, QA Lead...">
            </div>

            <div class="form-group">
              <label class="form-label" style="font-size: 0.775rem; display:flex; justify-content:space-between;">
                <span>Task & Instructions</span>
                ${idx > 0 ? `<span style="color:var(--accent-cyan); font-weight:600;">Supports {{step${idx}_output}}</span>` : ''}
              </label>
              <textarea class="form-textarea chain-step-task-textarea" data-step-id="${escapeHtml(step.id)}" style="height: 110px;" placeholder="Instructions for this step...">${escapeHtml(step.task || '')}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label" style="font-size: 0.775rem;">Rules & Constraints</label>
              <input type="text" class="form-input chain-step-constraints-input" data-step-id="${escapeHtml(step.id)}" value="${escapeHtml(step.constraints || '')}" placeholder="e.g. Under 200 words, no jargon...">
            </div>

            ${(step.variables && step.variables.length > 0) ? `
              <div class="chain-step-vars-box" style="padding: 8px 12px; background: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                <div style="font-size: 0.725rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Input Variables:</div>
                ${step.variables.map(v => `
                  <div style="margin-bottom: 6px;">
                    <label style="font-size: 0.75rem; color: var(--text-secondary); display: block; margin-bottom: 2px;">{{${escapeHtml(v.name)}}}:</label>
                    <input type="text" class="form-input chain-var-input" data-step-id="${escapeHtml(step.id)}" data-var-name="${escapeHtml(v.name)}" value="${escapeHtml(v.default || '')}" style="height: 28px; font-size: 0.775rem;">
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <!-- Right Column: Live Runner & Output Capture -->
          <div class="chain-step-runner-col">
            <div class="chain-runner-header">
              <span class="chain-runner-title">⚡ Live Assembled Prompt</span>
              <button type="button" class="btn btn-sm btn-primary copy-step-prompt-btn" data-step-id="${escapeHtml(step.id)}" title="Copy full assembled prompt for this step">
                📋 Copy Step ${idx + 1} Prompt
              </button>
            </div>

            <div class="chain-prompt-preview-box" id="preview_${step.id}">${escapeHtml(compiledPrompt)}</div>

            <div class="form-group" style="margin-top: 4px;">
              <label class="form-label" style="font-size: 0.775rem; display:flex; justify-content:space-between; align-items:center;">
                <span>📥 Paste AI Response Output for Step ${idx + 1}</span>
                ${isDone ? '<span class="status-pill-dual pass" style="padding:1px 6px; font-size:0.7rem;">✓ Output Captured</span>' : '<span style="font-size:0.7rem; color:var(--text-muted);">Feeds into next step</span>'}
              </label>
              <textarea class="chain-output-textarea" data-step-id="${escapeHtml(step.id)}" placeholder="Paste the output generated by ${step.targetModel ? step.targetModel.toUpperCase() : 'AI'} here to link into next step...">${escapeHtml(step.output || '')}</textarea>
            </div>
          </div>
        </div>
      `;

      dom.chainStepsContainer.appendChild(card);

      // Append Flow Connector
      if (idx < steps.length - 1) {
        const connector = document.createElement('div');
        connector.className = 'chain-flow-connector';
        connector.innerHTML = `
          <span>⬇️ Passes <strong>{{step${idx + 1}_output}}</strong> to Step ${idx + 2}</span>
        `;
        dom.chainStepsContainer.appendChild(connector);
      }
    });

    // Wire Card Event Handlers
    // 1. Output Textarea
    dom.chainStepsContainer.querySelectorAll('.chain-output-textarea').forEach(tx => {
      tx.addEventListener('input', () => {
        const stepId = tx.getAttribute('data-step-id');
        const step = steps.find(s => s.id === stepId);
        if (step) {
          step.output = tx.value;
          saveActiveChain();
          updateChainDownstreamPreviews();
        }
      });
    });

    // 2. Step Inputs
    dom.chainStepsContainer.querySelectorAll('.chain-step-name-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const stepId = inp.getAttribute('data-step-id');
        const step = steps.find(s => s.id === stepId);
        if (step) {
          step.name = inp.value;
          saveActiveChain();
          updateChainTrackerOnly();
        }
      });
    });

    dom.chainStepsContainer.querySelectorAll('.chain-step-role-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const stepId = inp.getAttribute('data-step-id');
        const step = steps.find(s => s.id === stepId);
        if (step) {
          step.role = inp.value;
          saveActiveChain();
          updateChainDownstreamPreviews();
        }
      });
    });

    dom.chainStepsContainer.querySelectorAll('.chain-step-task-textarea').forEach(tx => {
      tx.addEventListener('input', () => {
        const stepId = tx.getAttribute('data-step-id');
        const step = steps.find(s => s.id === stepId);
        if (step) {
          step.task = tx.value;
          saveActiveChain();
          updateChainDownstreamPreviews();
        }
      });
    });

    dom.chainStepsContainer.querySelectorAll('.chain-step-constraints-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const stepId = inp.getAttribute('data-step-id');
        const step = steps.find(s => s.id === stepId);
        if (step) {
          step.constraints = inp.value;
          saveActiveChain();
          updateChainDownstreamPreviews();
        }
      });
    });

    dom.chainStepsContainer.querySelectorAll('.chain-var-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const stepId = inp.getAttribute('data-step-id');
        const varName = inp.getAttribute('data-var-name');
        const step = steps.find(s => s.id === stepId);
        if (step && step.variables) {
          const v = step.variables.find(x => x.name === varName);
          if (v) {
            v.default = inp.value;
            saveActiveChain();
            updateChainDownstreamPreviews();
          }
        }
      });
    });

    dom.chainStepsContainer.querySelectorAll('.chain-step-model-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const stepId = sel.getAttribute('data-step-id');
        const step = steps.find(s => s.id === stepId);
        if (step) {
          step.targetModel = sel.value;
          saveActiveChain();
        }
      });
    });

    // 3. Copy Step Prompt Button
    dom.chainStepsContainer.querySelectorAll('.copy-step-prompt-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const stepId = btn.getAttribute('data-step-id');
        const idx = steps.findIndex(s => s.id === stepId);
        if (idx === -1) return;
        const compiled = assembleStepPrompt(steps[idx], idx, steps);

        try {
          await navigator.clipboard.writeText(compiled);
          showToast(`Copied Step ${idx + 1} Prompt to clipboard! Paste into your AI tool! 📋`);
        } catch (e) {
          const ta = document.createElement('textarea');
          ta.value = compiled;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          showToast(`Copied Step ${idx + 1} Prompt! 📋`);
        }
      });
    });

    // 4. Move Up / Move Down / Delete Step
    dom.chainStepsContainer.querySelectorAll('.move-step-up-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (idx > 0) {
          const temp = steps[idx];
          steps[idx] = steps[idx - 1];
          steps[idx - 1] = temp;
          saveActiveChain();
          renderChainBuilder();
          showToast("Moved step up! ⬆️");
        }
      });
    });

    dom.chainStepsContainer.querySelectorAll('.move-step-down-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (idx < steps.length - 1) {
          const temp = steps[idx];
          steps[idx] = steps[idx + 1];
          steps[idx + 1] = temp;
          saveActiveChain();
          renderChainBuilder();
          showToast("Moved step down! ⬇️");
        }
      });
    });

    dom.chainStepsContainer.querySelectorAll('.delete-chain-step-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const stepId = btn.getAttribute('data-step-id');
        const idx = steps.findIndex(s => s.id === stepId);
        if (idx === -1) return;

        const confirmed = await showConfirmDialog({
          title: "Delete Chain Step?",
          message: `Are you sure you want to delete Step ${idx + 1}: "${steps[idx].name}"?`,
          confirmText: "🗑️ Delete Step",
          confirmClass: "btn-rose",
          icon: "🗑️"
        });
        if (!confirmed) return;

        steps.splice(idx, 1);
        saveActiveChain();
        renderChainBuilder();
        showToast("Deleted step from chain. 🗑️");
      });
    });
  }

  function updateChainDownstreamPreviews() {
    const chain = getActiveChain();
    const steps = chain.steps;
    steps.forEach((step, idx) => {
      const box = document.getElementById(`preview_${step.id}`);
      if (box) {
        box.textContent = assembleStepPrompt(step, idx, steps);
      }
      const card = document.getElementById(`chainCard_${step.id}`);
      if (card) {
        if (step.output && step.output.trim().length > 0) {
          card.classList.add('step-completed');
        } else {
          card.classList.remove('step-completed');
        }
      }
    });
    updateChainTrackerOnly();
  }

  function updateChainTrackerOnly() {
    if (!dom.chainTrackerBar) return;
    const chain = getActiveChain();
    const steps = chain.steps;
    const trackerItems = dom.chainTrackerBar.querySelectorAll('.chain-tracker-step');
    trackerItems.forEach((trackStep, idx) => {
      const step = steps[idx];
      if (!step) return;
      const isDone = !!(step.output && step.output.trim().length > 0);
      const isReady = idx === 0 || !!(steps[idx - 1].output && steps[idx - 1].output.trim().length > 0);

      trackStep.className = `chain-tracker-step ${isDone ? 'completed' : (isReady ? 'active' : '')}`;
      trackStep.innerHTML = `
        <span>${isDone ? '✓' : (isReady ? '⚡' : '⏳')}</span>
        <span>Step ${idx + 1}: <strong>${escapeHtml(step.name || `Step ${idx + 1}`)}</strong></span>
      `;
    });
  }

  // Chain Builder Top Actions
  if (dom.addChainStepBtn) {
    dom.addChainStepBtn.addEventListener('click', () => {
      const chain = getActiveChain();
      const nextNum = chain.steps.length + 1;
      chain.steps.push({
        id: `step-${Date.now()}`,
        name: `Step ${nextNum}: Follow-Up & Refinement`,
        targetModel: "claude",
        role: "Specialist Consultant",
        task: `Review and build upon the output of Step ${nextNum - 1}:\n\n=== PREVIOUS STEP OUTPUT ===\n{{step${nextNum - 1}_output}}`,
        constraints: "Focus on clarity and actionability.",
        outputFormat: "Structured response.",
        variables: [],
        output: ""
      });
      saveActiveChain();
      renderChainBuilder();
      showToast(`Added Step ${nextNum} to prompt chain! ➕`);
    });
  }

  if (dom.chainPresetSelect) {
    dom.chainPresetSelect.addEventListener('change', () => {
      const val = dom.chainPresetSelect.value;
      if (!val || typeof BUILTIN_CHAINS === 'undefined') return;
      const preset = BUILTIN_CHAINS.find(c => c.id === val);
      if (preset) {
        state.activeChain = JSON.parse(JSON.stringify(preset));
        saveActiveChain();
        renderChainBuilder();
        showToast(`Loaded "${preset.title}"! 🚀`);
        dom.chainPresetSelect.value = '';
      }
    });
  }

  if (dom.exportChainBtn) {
    dom.exportChainBtn.addEventListener('click', async () => {
      const chain = getActiveChain();
      let md = `# 🔗 ${chain.title || 'Prompt Workflow Playbook'}\n\n`;
      if (chain.description) md += `> ${chain.description}\n\n---\n\n`;

      chain.steps.forEach((s, i) => {
        md += `## Step ${i + 1}: ${s.name}\n`;
        md += `**Target Model:** \`${s.targetModel || 'any'}\`\n\n`;
        md += `### Prompt Instructions\n\`\`\`\n${assembleStepPrompt(s, i, chain.steps)}\n\`\`\`\n\n`;
        if (s.output && s.output.trim().length > 0) {
          md += `### Output Received\n${s.output.trim()}\n\n`;
        } else {
          md += `*Output: (Pending)*\n\n`;
        }
        md += `---\n\n`;
      });

      try {
        await navigator.clipboard.writeText(md);
        showToast("Copied Complete Chain Workflow Playbook (Markdown) to clipboard! 📋");
      } catch (e) {
        showToast("Export generated!");
      }
    });
  }

  if (dom.resetChainBtn) {
    dom.resetChainBtn.addEventListener('click', async () => {
      const confirmed = await showConfirmDialog({
        title: "Reset Prompt Chain?",
        message: "Do you want to clear all recorded outputs and reset the active prompt chain?",
        confirmText: "🔄 Reset Outputs",
        confirmClass: "btn-primary",
        icon: "🔄"
      });
      if (!confirmed) return;

      const chain = getActiveChain();
      chain.steps.forEach(s => s.output = '');
      saveActiveChain();
      renderChainBuilder();
      showToast("Reset all step outputs in chain! 🔄");
    });
  }

  // --- Health Checklist Renderer & Actionable Fixes ---
  function renderHealthChecklist() {
    if (!dom.healthChecklistContainer) return;
    const text = assemblePromptText();
    const { score, checks } = calculateHealthScore(text);
    const failingCount = checks.filter(c => !c.passed).length;

    let badgeHtml = '';
    if (failingCount === 0) {
      badgeHtml = `<span class="status-pill-dual pass" style="padding: 4px 10px;"><span>✓</span> Prompt is Ready to Use</span>`;
    } else if (failingCount <= 2) {
      badgeHtml = `<span class="status-pill-dual warn" style="padding: 4px 10px;"><span>▲</span> ${failingCount} Suggested Improvement${failingCount > 1 ? 's' : ''}</span>`;
    } else {
      badgeHtml = `<span class="status-pill-dual fail" style="padding: 4px 10px;"><span>✕</span> Needs Key Details</span>`;
    }

    let html = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
        <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin:0;">Prompt Readiness & Health</h3>
        ${badgeHtml}
      </div>
      <div class="health-checklist-list">
    `;

    checks.forEach(c => {
      html += `
        <div class="health-check-card ${c.passed ? 'passed' : 'failing'}">
          <div class="health-check-info">
            <div class="health-check-header" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 700; color: ${c.passed ? 'var(--accent-emerald)' : 'var(--accent-amber)'};">${c.passed ? '✓' : '▲'}</span>
              <span style="font-weight: 600;">${escapeHtml(c.question)}</span>
              <span class="status-pill-dual ${c.passed ? 'pass' : 'warn'}" style="font-size: 0.7rem; padding: 1px 6px; margin-left: auto;">
                ${c.passed ? 'PASSED' : 'NEEDS DETAIL'}
              </span>
            </div>
            <span class="health-check-tip" style="margin-top: 4px; display: block;">${escapeHtml(c.tip)}</span>
          </div>
          ${!c.passed && c.fixLabel ? `
            <button class="btn btn-sm btn-primary health-check-fix-btn" data-fix="${c.id}">${c.fixLabel}</button>
          ` : ''}
        </div>
      `;
    });

    html += `</div>`;
    dom.healthChecklistContainer.innerHTML = html;

    // Attach 1-Click Fix Handlers
    dom.healthChecklistContainer.querySelectorAll('.health-check-fix-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fixId = btn.getAttribute('data-fix');
        handleHealthCheckFix(fixId);
      });
    });
  }

  function handleHealthCheckFix(fixId) {
    if (fixId === 'role') {
      if (state.studioMode === 'raw') {
        if (dom.rawMarkdownTextarea) {
          dom.rawMarkdownTextarea.value = "You are an expert advisor and specialist.\n\n" + (dom.rawMarkdownTextarea.value || '');
          dom.rawMarkdownTextarea.focus();
        }
      } else {
        state.currentPrompt.role = "You are an expert specialist and thoughtful advisor.";
        if (dom.promptRole) dom.promptRole.value = state.currentPrompt.role;
        if (state.viewMode === 'wizard') {
          state.wizardStep = 2;
          updateWizardUI();
        }
        if (dom.promptRole) dom.promptRole.focus();
      }
      initFormValues();
      updateLivePreview();
      showToast("Added helpful expert role! 🎭");
    }
    else if (fixId === 'task') {
      if (state.studioMode === 'raw') {
        if (dom.rawMarkdownTextarea) {
          dom.rawMarkdownTextarea.focus();
        }
      } else {
        if (state.viewMode === 'wizard') {
          state.wizardStep = 1;
          updateWizardUI();
        }
        if (dom.promptTask) {
          dom.promptTask.focus();
          dom.promptTask.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      showToast("Type your task goal here! ✏️");
    }
    else if (fixId === 'constraints') {
      if (dom.enhancePromptBtn) {
        dom.enhancePromptBtn.click();
      } else {
        state.currentPrompt.constraints = "Do not hallucinate facts outside context.\nIf unsure, explicitly state 'Information unavailable'.";
        if (dom.promptConstraints) dom.promptConstraints.value = state.currentPrompt.constraints;
        initFormValues();
        updateLivePreview();
        showToast("Added Trust & Accuracy Rules! 🛡️");
      }
    }
    else if (fixId === 'outputFormat') {
      const defaultFormat = "A structured Markdown document with clear headings, bullet points, and concise explanations.";
      state.currentPrompt.outputFormat = defaultFormat;
      if (dom.promptOutputFormat) dom.promptOutputFormat.value = defaultFormat;
      if (state.viewMode === 'wizard') {
        state.wizardStep = 1;
        updateWizardUI();
      }
      initFormValues();
      updateLivePreview();
      showToast("Added Markdown output format! 📑");
    }
    else if (fixId === 'variables') {
      if (dom.variablesFillingPanel) {
        dom.variablesFillingPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const firstInput = dom.variablesFillingPanel.querySelector('.var-input');
        if (firstInput) firstInput.focus();
      }
      showToast("Fill in your {{blank}} variables below! 🔤");
    }
  }

  // --- Export Modal Handler ---
  dom.openExportModalBtn.addEventListener('click', () => {
    openModal(dom.exportModal, dom.openExportModalBtn);
    updateExportCode();
  });

  dom.closeExportModalBtn.addEventListener('click', () => {
    closeModal(dom.exportModal);
  });

  dom.exportOptionsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      dom.exportOptionsTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.exportType = tab.getAttribute('data-export');
      updateExportCode();
    });
  });

  function updateExportCode() {
    const promptText = assemblePromptText();
    const modelId = (dom.modelIdInput && dom.modelIdInput.value.trim()) ? dom.modelIdInput.value.trim() : 'gemini';
    let formatted = '';

    if (state.exportType === 'markdown') {
      formatted = promptText;
    } 
    else if (state.exportType === 'json') {
      formatted = JSON.stringify({
        model: modelId,
        prompt: promptText,
        system_instruction: state.currentPrompt.role,
        variables: state.variableValues
      }, null, 2);
    } 
    else if (state.exportType === 'python') {
      formatted = `import google.generativeai as genai\n\ngenai.configure(api_key="YOUR_API_KEY")\nmodel = genai.GenerativeModel("${modelId}")\n\nprompt = """${promptText.replace(/"""/g, '\\"\\"\\"')}"""\n\nresponse = model.generate_content(prompt)\nprint(response.text)`;
    } 
    else if (state.exportType === 'js') {
      formatted = `import { GoogleGenerativeAI } from "@google/genai";\n\nconst ai = new GoogleGenerativeAI({ apiKey: process.env.API_KEY });\nconst prompt = \`${promptText.replace(/`/g, '\\`')}\`;\n\nconst response = await ai.models.generateContent({\n  model: "${modelId}",\n  contents: prompt\n});\n\nconsole.log(response.text);`;
    } 
    else if (state.exportType === 'curl') {
      formatted = `curl "https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=YOUR_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  -d '{"contents": [{"parts":[{"text": ${JSON.stringify(promptText)}}]}]}'`;
    }

    dom.exportFormattedCode.value = formatted;
  }

  dom.copyExportCodeBtn.addEventListener('click', () => {
    copyToClipboard(dom.exportFormattedCode.value, 'Export code copied to clipboard! 📋', dom.exportFormattedCode);
  });

  dom.downloadExportFileBtn.addEventListener('click', () => {
    const ext = state.exportType === 'json' ? 'json' : (state.exportType === 'python' ? 'py' : (state.exportType === 'js' ? 'js' : 'md'));
    const blob = new Blob([dom.exportFormattedCode.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-helper-export.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded prompt-helper-export.${ext}! 💾`);
  });



  // --- Enhanced Toast Notification System ---
  function dismissToast(toast) {
    if (!toast || toast.classList.contains('toast-dismissing')) return;
    toast.classList.add('toast-dismissing');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 250);
  }

  function showToast(message, type = null, customDuration = null) {
    if (!dom.toastContainer) return;

    // Auto-detect type if not explicitly provided
    let toastType = type;
    if (!toastType) {
      const lower = (message || '').toLowerCase();
      if (lower.includes('fail') || lower.includes('error') || lower.includes('unsupported') || lower.includes('too large') || lower.includes('⚠️') || lower.includes('exceeded')) {
        toastType = 'warning';
      } else if (lower.includes('copied') || lower.includes('saved') || lower.includes('restored') || lower.includes('added') || lower.includes('created') || lower.includes('✓') || lower.includes('enabled')) {
        toastType = 'success';
      } else {
        toastType = 'info';
      }
    }

    // Determine duration based on type
    const duration = customDuration || (toastType === 'warning' || toastType === 'error' ? 4500 : 3000);

    // Get matching icon
    let icon = '⚡';
    if (toastType === 'success') icon = '✓';
    else if (toastType === 'warning') icon = '⚠️';
    else if (toastType === 'error') icon = '✕';
    else if (toastType === 'info') icon = 'ℹ️';

    // Stacking limit: If there are already MAX_VISIBLE_TOASTS active toasts, dismiss the oldest
    const existingToasts = dom.toastContainer.querySelectorAll('.toast:not(.toast-dismissing)');
    if (existingToasts.length >= MAX_VISIBLE_TOASTS) {
      for (let i = 0; i <= existingToasts.length - MAX_VISIBLE_TOASTS; i++) {
        dismissToast(existingToasts[i]);
      }
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${toastType}`;
    toast.setAttribute('role', 'alert');
    
    toast.innerHTML = `
      <span class="toast-icon" style="font-weight: 700;">${icon}</span>
      <span class="toast-content">${escapeHtml(message)}</span>
      <button type="button" class="toast-close-btn" aria-label="Dismiss notification" title="Dismiss">✕</button>
      <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
    `;

    // Click on close button or anywhere on toast to dismiss
    const closeBtn = toast.querySelector('.toast-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissToast(toast);
      });
    }

    toast.addEventListener('click', () => {
      dismissToast(toast);
    });

    let dismissTimer = setTimeout(() => {
      dismissToast(toast);
    }, duration);

    // Pause dismissal timer on hover
    toast.addEventListener('mouseenter', () => {
      clearTimeout(dismissTimer);
    });

    toast.addEventListener('mouseleave', () => {
      clearTimeout(dismissTimer);
      dismissTimer = setTimeout(() => {
        dismissToast(toast);
      }, 1500);
    });

    dom.toastContainer.appendChild(toast);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- Prompt Version History & Diff Logic ---

  /**
   * Calculates the number of changed lines between two text blocks.
   * @param {string} text1 First text block
   * @param {string} text2 Second text block
   * @returns {number} Total added and removed line count
   */
  function countLineDiffs(text1, text2) {
    if (text1 === text2) return 0;
    const diffs = diffTexts(text1 || '', text2 || '');
    let changes = 0;
    diffs.forEach(d => {
      if (d.type === 'diff-added' || d.type === 'diff-removed') {
        changes++;
      }
    });
    return changes;
  }

  /**
   * Saves a snapshot of current prompt state.
   * Performs deduplication and in-place merging for near-duplicate rapid edits.
   * @param {string|null} [customTitle=null] Custom user label for milestone versions
   * @param {string|null} [autoDesc=null] Automatic action description
   */
  function saveVersion(customTitle = null, autoDesc = null) {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const id = `hist-${Date.now()}`;
    const title = customTitle || (autoDesc ? autoDesc : `Snapshot - ${timestamp}`);
    const currentText = assemblePromptText().trim();

    if (!currentText) {
      if (customTitle) showToast("Cannot save snapshot of an empty prompt!");
      return;
    }

    const newItem = {
      id,
      timestamp: new Date().toLocaleString(),
      title,
      model: state.targetModel,
      modelId: (dom.modelIdInput && dom.modelIdInput.value.trim()) ? dom.modelIdInput.value.trim() : 'gemini',
      studioMode: state.studioMode,
      prompt: JSON.parse(JSON.stringify(state.currentPrompt)),
      variableValues: JSON.parse(JSON.stringify(state.variableValues)),
      assembledText: currentText
    };

    if (state.history.length > 0) {
      const latest = state.history[0];
      const latestText = (latest.assembledText || '').trim();

      // 1. Check exact identical or whitespace-only match
      if (latestText === currentText) {
        if (customTitle) {
          showToast("No changes detected since last snapshot version!");
        }
        return;
      }

      // 2. Check near-duplicate (<= 2 changed lines and not an explicit custom milestone title)
      const lineDiffCount = countLineDiffs(latestText, currentText);
      if (!customTitle && lineDiffCount <= 2) {
        // Merge into the latest entry in-place to prevent history bloat
        latest.timestamp = newItem.timestamp;
        latest.prompt = newItem.prompt;
        latest.variableValues = newItem.variableValues;
        latest.model = newItem.model;
        latest.modelId = newItem.modelId;
        latest.studioMode = newItem.studioMode;
        latest.assembledText = newItem.assembledText;
        SafeStorage.setItem('ph_history', JSON.stringify(state.history));
        renderVersionHistory();
        return;
      }
    }

    state.history.unshift(newItem);
    
    // Cap history at 50 versions to keep local storage clean
    if (state.history.length > 50) {
      state.history.pop();
    }

    SafeStorage.setItem('ph_history', JSON.stringify(state.history));
    
    if (customTitle) {
      showToast(`Saved version: "${title}"! 📜`);
    }
  }

  /**
   * Scans history and removes consecutive near-duplicate snapshots that differ by <= 2 lines.
   */
  function deduplicateVersionHistory() {
    if (state.history.length <= 1) {
      showToast("Version history is already clean and optimal! ✨");
      return;
    }

    const initialCount = state.history.length;
    const cleaned = [];

    for (let i = 0; i < state.history.length; i++) {
      const current = state.history[i];
      if (cleaned.length === 0) {
        cleaned.push(current);
        continue;
      }

      const prev = cleaned[cleaned.length - 1];
      const textA = (prev.assembledText || '').trim();
      const textB = (current.assembledText || '').trim();

      // If exactly identical or differing by <= 2 lines, skip the redundant entry
      const diffLines = countLineDiffs(textA, textB);
      if (textA === textB || diffLines <= 2) {
        continue;
      }
      cleaned.push(current);
    }

    const removedCount = initialCount - cleaned.length;
    if (removedCount > 0) {
      state.history = cleaned;
      state.selectedHistoryIndex = -1;
      SafeStorage.setItem('ph_history', JSON.stringify(state.history));
      renderVersionHistory();
      showToast(`Merged & cleaned ${removedCount} redundant snapshot${removedCount > 1 ? 's' : ''}! 🧹`);
    } else {
      showToast("All historical snapshots contain significant unique changes! ✨");
    }
  }

  /**
   * Renders the list of saved prompt snapshots into the History Modal sidebar.
   */
  function renderVersionHistory() {
    dom.versionListContainer.innerHTML = '';
    
    if (state.history.length === 0) {
      dom.versionListContainer.innerHTML = `
        <div class="empty-state-card" style="padding: 24px 14px; margin: 6px 0;">
          <div class="empty-state-icon" style="font-size: 1.8rem; margin-bottom: 8px;">📜</div>
          <div class="empty-state-title" style="font-size: 0.95rem;">No Snapshots Saved</div>
          <p class="empty-state-desc" style="font-size: 0.775rem; margin-bottom: 14px;">Save snapshots of your prompt as you make edits to inspect line-by-line diffs and restore versions anytime.</p>
          <button class="btn btn-sm btn-primary" id="emptySaveSnapshotBtn">📸 Save Snapshot Now</button>
        </div>
      `;
      const saveSnapBtn = document.getElementById('emptySaveSnapshotBtn');
      if (saveSnapBtn && dom.saveVersionBtn) {
        saveSnapBtn.addEventListener('click', () => {
          dom.saveVersionBtn.click();
        });
      }
      dom.restoreVersionBtn.style.display = 'none';
      dom.diffTitle.textContent = "Select a historical version to compare with current prompt";
      dom.diffOutputContainer.innerHTML = `<div class="diff-placeholder">Select a version from the left panel to run a line-by-line diff with the current prompt state.</div>`;
      return;
    }

    state.history.forEach((item, idx) => {
      const isSelected = idx === state.selectedHistoryIndex;
      const div = document.createElement('div');
      div.className = `version-item ${isSelected ? 'active' : ''}`;
      div.setAttribute('data-idx', idx);
      
      div.innerHTML = `
        <div class="version-item-header">
          <span class="version-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
          <button class="version-item-delete" data-idx="${idx}" title="Delete version">✕</button>
        </div>
        <div class="version-item-meta">
          <span class="version-item-time">${item.timestamp.split(', ')[1] || item.timestamp}</span>
          <span class="brand-badge" style="font-size: 0.6rem; padding: 1px 4px;">${escapeHtml(item.model.toUpperCase())}</span>
        </div>
      `;

      div.addEventListener('click', (e) => {
        if (e.target.classList.contains('version-item-delete')) {
          e.stopPropagation();
          const deleteIdx = parseInt(e.target.getAttribute('data-idx'), 10);
          state.history.splice(deleteIdx, 1);
          if (state.selectedHistoryIndex === deleteIdx) {
            state.selectedHistoryIndex = -1;
          } else if (state.selectedHistoryIndex > deleteIdx) {
            state.selectedHistoryIndex--;
          }
          SafeStorage.setItem('ph_history', JSON.stringify(state.history));
          renderVersionHistory();
          showToast("Deleted history version.");
          return;
        }

        const clickIdx = parseInt(div.getAttribute('data-idx'), 10);
        state.selectedHistoryIndex = clickIdx;
        
        // Highlight active item
        document.querySelectorAll('.version-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        
        renderDiff(clickIdx);
      });

      dom.versionListContainer.appendChild(div);
    });

    if (state.selectedHistoryIndex !== -1 && state.history[state.selectedHistoryIndex]) {
      renderDiff(state.selectedHistoryIndex);
    } else {
      dom.restoreVersionBtn.style.display = 'none';
      dom.diffTitle.textContent = "Select a historical version to compare with current prompt";
      dom.diffOutputContainer.innerHTML = `<div class="diff-placeholder">Select a version from the left panel to run a line-by-line diff with the current prompt state.</div>`;
    }
  }

  /**
   * Computes line-by-line LCS dynamic programming difference between two text blocks.
   * @param {string} oldText Previous version text
   * @param {string} newText Current version text
   * @returns {Array<{type: 'diff-context'|'diff-added'|'diff-removed', text: string}>}
   */
  function diffTexts(oldText, newText) {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    // Simple LCS DP Matrix
    const n = oldLines.length;
    const m = newLines.length;
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find diff
    const result = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        result.unshift({ type: 'diff-context', text: oldLines[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({ type: 'diff-added', text: newLines[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        result.unshift({ type: 'diff-removed', text: oldLines[i - 1] });
        i--;
      }
    }
    return result;
  }

  /**
   * Renders the color-coded line-by-line diff comparing a snapshot against active studio state.
   * @param {number} index Index in state.history
   */
  function renderDiff(index) {
    const historicalItem = state.history[index];
    if (!historicalItem) return;

    dom.restoreVersionBtn.style.display = 'block';
    dom.diffTitle.textContent = `Comparing: "${historicalItem.title}" vs. Current Active State`;

    const oldText = historicalItem.assembledText || '';
    const newText = assemblePromptText() || '';

    // Micro loading state
    dom.diffOutputContainer.innerHTML = `
      <div class="diff-loading-indicator">
        <div class="diff-spinner-ring"></div>
        <span>Analyzing differences...</span>
      </div>
    `;

    requestAnimationFrame(() => {
      const diffLines = diffTexts(oldText, newText);
      dom.diffOutputContainer.innerHTML = '';
      
      let oldLineNo = 1;
      let newLineNo = 1;

      diffLines.forEach(line => {
        const lineDiv = document.createElement('div');
        lineDiv.className = `diff-line ${line.type}`; // 'diff-added', 'diff-removed', 'diff-context'

        const noSpan = document.createElement('span');
        noSpan.className = 'diff-lineno';
        if (line.type === 'diff-added') {
          noSpan.textContent = `+${newLineNo}`;
          newLineNo++;
        } else if (line.type === 'diff-removed') {
          noSpan.textContent = `-${oldLineNo}`;
          oldLineNo++;
        } else {
          noSpan.textContent = `${newLineNo}`;
          newLineNo++;
          oldLineNo++;
        }

        const contentSpan = document.createElement('span');
        contentSpan.className = 'diff-content';
        contentSpan.textContent = line.text || ' ';

        lineDiv.appendChild(noSpan);
        lineDiv.appendChild(contentSpan);
        dom.diffOutputContainer.appendChild(lineDiv);
      });
    });
  }

  async function restoreVersion(index) {
    const item = state.history[index];
    if (!item) return;

    const confirmed = await showConfirmDialog({
      title: "Restore Historical Version?",
      message: `Restore version "${item.title}" to Prompt Studio? This will replace your active constructor inputs.`,
      confirmText: "🕒 Restore Version",
      confirmClass: "btn-rose",
      icon: "🕒"
    });
    if (!confirmed) return;

    // Deep copy state properties back
    state.currentPrompt = JSON.parse(JSON.stringify(item.prompt));
    state.variableValues = JSON.parse(JSON.stringify(item.variableValues || {}));
    state.targetModel = item.model;
    state.studioMode = item.studioMode || 'form';

    // Update controls
    dom.modelSelect.value = state.targetModel;
    if (dom.modelIdInput) {
      dom.modelIdInput.value = item.modelId || '';
    }
    updateModelIdInputVisibility();

    if (state.studioMode === 'form') {
      dom.modeFormPill.classList.add('active');
      dom.modeRawPill.classList.remove('active');
      dom.formBuilderView.style.display = 'block';
      dom.rawMarkdownView.style.display = 'none';
      initFormValues();
    } else {
      dom.modeRawPill.classList.add('active');
      dom.modeFormPill.classList.remove('active');
      dom.formBuilderView.style.display = 'none';
      dom.rawMarkdownView.style.display = 'flex';
      dom.rawMarkdownTextarea.value = state.currentPrompt.rawText || '';
    }

    updateLivePreview();
    dom.historyModal.classList.remove('active');
    showToast(`Restored version: "${item.title}"! 🕒`);
  }

  // --- History UI Listeners ---
  if (dom.openHistoryModalBtn) {
    dom.openHistoryModalBtn.addEventListener('click', () => {
      openModal(dom.historyModal, dom.openHistoryModalBtn);
      renderVersionHistory();
    });
  }

  if (dom.closeHistoryModalBtn) {
    dom.closeHistoryModalBtn.addEventListener('click', () => {
      closeModal(dom.historyModal);
    });
  }

  if (dom.saveVersionBtn) {
    dom.saveVersionBtn.addEventListener('click', async () => {
      const customTitle = await showInputPromptDialog({
        title: "📜 Save Prompt Snapshot",
        message: "Enter a label for this version snapshot:",
        defaultValue: `Version ${state.history.length + 1}`,
        placeholder: "e.g. Added constraints",
        submitText: "Save Snapshot"
      });
      if (customTitle !== null && customTitle.trim().length > 0) {
        saveVersion(customTitle.trim());
        renderVersionHistory();
      }
    });
  }

  if (dom.restoreVersionBtn) {
    dom.restoreVersionBtn.addEventListener('click', () => {
      if (state.selectedHistoryIndex !== -1) {
        restoreVersion(state.selectedHistoryIndex);
      }
    });
  }

  if (dom.cleanHistoryBtn) {
    dom.cleanHistoryBtn.addEventListener('click', () => {
      deduplicateVersionHistory();
    });
  }



  // --- Constraints Guardrail Quick-Pills Logic ---
  function syncGuardrailPills() {
    const currentText = dom.promptConstraints ? dom.promptConstraints.value : '';
    const lines = currentText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    document.querySelectorAll('.guardrail-pill').forEach(pill => {
      const rule = pill.getAttribute('data-rule');
      if (!rule || pill.id === 'enhancePromptBtn') return;
      if (lines.some(l => l.toLowerCase() === rule.toLowerCase())) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    if (dom.enhancePromptBtn) {
      const hasRule1 = lines.some(l => l.toLowerCase() === TRUST_RULE_1.toLowerCase());
      const hasRule2 = lines.some(l => l.toLowerCase() === TRUST_RULE_2.toLowerCase());
      if (hasRule1 && hasRule2) {
        dom.enhancePromptBtn.classList.add('active');
      } else {
        dom.enhancePromptBtn.classList.remove('active');
      }
    }
  }

  // --- Prompt Compression Modal & Optimization Controller ---
  let activeCompressionResult = null;

  function openCompressModal() {
    if (!dom.compressModal) return;
    openModal(dom.compressModal, dom.openCompressModalBtn || dom.statCompressChip);
    updateCompressModalPreview();
  }

  function closeCompressModal() {
    if (dom.compressModal) {
      closeModal(dom.compressModal);
    }
  }

  function getCompressionOptions() {
    return {
      stripFluff: dom.compressOptionFluff ? dom.compressOptionFluff.checked : true,
      simplifyPhrases: dom.compressOptionPhrases ? dom.compressOptionPhrases.checked : true,
      cleanWhitespace: dom.compressOptionWhitespace ? dom.compressOptionWhitespace.checked : true
    };
  }

  function updateCompressModalPreview() {
    if (!dom.compressModal) return;
    const currentFullText = assemblePromptText();
    const options = getCompressionOptions();
    activeCompressionResult = compressPromptText(currentFullText, options);

    if (dom.compressOriginalTokens) {
      dom.compressOriginalTokens.textContent = `${activeCompressionResult.originalTokens}`;
    }
    if (dom.compressOptimizedTokens) {
      dom.compressOptimizedTokens.textContent = `${activeCompressionResult.compressedTokens}`;
    }
    if (dom.compressSavedTokens) {
      dom.compressSavedTokens.textContent = `${activeCompressionResult.tokensSaved} (${activeCompressionResult.percentSaved}%)`;
    }
    if (dom.compressSavedWords) {
      dom.compressSavedWords.textContent = `${activeCompressionResult.wordsSaved} words`;
    }
    if (dom.compressRuleMatchCount) {
      dom.compressRuleMatchCount.textContent = activeCompressionResult.hasChanges
        ? `${activeCompressionResult.ruleMatchesCount} optimizations found`
        : 'Already optimal';
    }

    // Render line-by-line diff inside modal
    if (dom.compressDiffContainer) {
      if (!activeCompressionResult.hasChanges) {
        dom.compressDiffContainer.innerHTML = `
          <div style="text-align: center; color: var(--accent-emerald); padding: 24px 10px;">
            <div style="font-size: 1.6rem; margin-bottom: 6px;">✨</div>
            <strong>Your prompt is already lean and concise!</strong>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">No redundant conversational fillers or wordy phrasing detected under the selected rules.</p>
          </div>
        `;
        if (dom.compressApplyBtn) {
          dom.compressApplyBtn.disabled = true;
          dom.compressApplyBtn.style.opacity = '0.6';
        }
      } else {
        if (dom.compressApplyBtn) {
          dom.compressApplyBtn.disabled = false;
          dom.compressApplyBtn.style.opacity = '1';
        }
        const diffChunks = diffTexts(activeCompressionResult.originalText, activeCompressionResult.compressedText);
        let diffHtml = '';
        diffChunks.forEach(chunk => {
          if (chunk.type === 'diff-removed') {
            diffHtml += `<div class="compress-diff-line removed">- ${escapeHtml(chunk.text)}</div>`;
          } else if (chunk.type === 'diff-added') {
            diffHtml += `<div class="compress-diff-line added">+ ${escapeHtml(chunk.text)}</div>`;
          } else {
            diffHtml += `<div class="compress-diff-line context">${escapeHtml(chunk.text)}</div>`;
          }
        });
        dom.compressDiffContainer.innerHTML = diffHtml;
      }
    }
  }

  function applyPromptCompression() {
    if (!activeCompressionResult || !activeCompressionResult.hasChanges) {
      closeCompressModal();
      return;
    }

    const options = getCompressionOptions();

    // 1. Save an automatic snapshot in Version History before applying compression
    saveVersion(`Before Compression (${activeCompressionResult.originalTokens} tokens)`);

    // 2. Apply compression to form fields or raw editor
    if (state.studioMode === 'raw') {
      const compressedRaw = compressPromptText(dom.rawMarkdownTextarea.value, options).compressedText;
      dom.rawMarkdownTextarea.value = compressedRaw;
      state.currentPrompt.rawText = compressedRaw;
    } else {
      // Compress each active constructor field
      if (state.currentPrompt.task) {
        state.currentPrompt.task = compressPromptText(state.currentPrompt.task, options).compressedText;
        if (dom.promptTask) dom.promptTask.value = state.currentPrompt.task;
      }
      if (state.currentPrompt.context) {
        state.currentPrompt.context = compressPromptText(state.currentPrompt.context, options).compressedText;
        if (dom.promptContext) dom.promptContext.value = state.currentPrompt.context;
      }
      if (state.currentPrompt.role) {
        state.currentPrompt.role = compressPromptText(state.currentPrompt.role, options).compressedText;
        if (dom.promptRole) dom.promptRole.value = state.currentPrompt.role;
      }
      if (state.currentPrompt.constraints) {
        state.currentPrompt.constraints = compressPromptText(state.currentPrompt.constraints, options).compressedText;
        if (dom.promptConstraints) dom.promptConstraints.value = state.currentPrompt.constraints;
      }
    }

    // 3. Save snapshot after compression
    saveVersion(`Compressed Prompt (Saved ${activeCompressionResult.tokensSaved} tokens)`);

    // 4. Update preview, recalculate stats, close modal
    updateLivePreview();
    closeCompressModal();
    showToast(`Prompt compressed! Saved ${activeCompressionResult.tokensSaved} tokens (~${activeCompressionResult.percentSaved}%) ⚡`);
  }

  // Attach Compression Modal Listeners
  if (dom.openCompressModalBtn) {
    dom.openCompressModalBtn.addEventListener('click', () => {
      openCompressModal();
    });
  }

  if (dom.statCompressChip) {
    dom.statCompressChip.addEventListener('click', () => {
      openCompressModal();
    });
  }

  if (dom.closeCompressModalBtn) {
    dom.closeCompressModalBtn.addEventListener('click', () => {
      closeCompressModal();
    });
  }

  if (dom.compressCancelBtn) {
    dom.compressCancelBtn.addEventListener('click', () => {
      closeCompressModal();
    });
  }

  if (dom.compressApplyBtn) {
    dom.compressApplyBtn.addEventListener('click', () => {
      applyPromptCompression();
    });
  }

  [dom.compressOptionFluff, dom.compressOptionPhrases, dom.compressOptionWhitespace].forEach(chk => {
    if (chk) {
      chk.addEventListener('change', () => {
        updateCompressModalPreview();
      });
    }
  });

  // --- Shortcuts Modal Listeners ---
  function openShortcutsModal() {
    if (dom.shortcutsModal) {
      openModal(dom.shortcutsModal, dom.openShortcutsModalBtn);
    }
  }

  function closeShortcutsModal() {
    if (dom.shortcutsModal) {
      closeModal(dom.shortcutsModal);
    }
  }

  if (dom.openShortcutsModalBtn) {
    dom.openShortcutsModalBtn.addEventListener('click', () => {
      openShortcutsModal();
    });
  }

  if (dom.closeShortcutsModalBtn) {
    dom.closeShortcutsModalBtn.addEventListener('click', () => {
      closeShortcutsModal();
    });
  }

  // --- Command Palette Registry & Logic ---
  const commands = [
    { name: "Switch to Prompt Studio", icon: "🎨", kbd: "G S", action: () => document.querySelector('.nav-item[data-tab="tab-studio"]').click() },
    { name: "Switch to Template Hub", icon: "📚", kbd: "G T", action: () => document.querySelector('.nav-item[data-tab="tab-templates"]').click() },
    { name: "Switch to Prompt Vault", icon: "💾", kbd: "G V", action: () => document.querySelector('.nav-item[data-tab="tab-vault"]').click() },
    { name: "Switch to Prompt Chains", icon: "🔗", kbd: "G C", action: () => document.querySelector('.nav-item[data-tab="tab-chains"]').click() },
    
    { name: "Load Research & Briefing Chain", icon: "📝", kbd: "", action: () => {
      if (typeof BUILTIN_CHAINS !== 'undefined') {
        state.activeChain = JSON.parse(JSON.stringify(BUILTIN_CHAINS[0]));
        saveActiveChain();
        renderChainBuilder();
        document.querySelector('.nav-item[data-tab="tab-chains"]').click();
        showToast("Loaded Research & Briefing Chain! 📝");
      }
    }},
    { name: "Load Code & Test Suite Chain", icon: "💻", kbd: "", action: () => {
      if (typeof BUILTIN_CHAINS !== 'undefined') {
        state.activeChain = JSON.parse(JSON.stringify(BUILTIN_CHAINS[1]));
        saveActiveChain();
        renderChainBuilder();
        document.querySelector('.nav-item[data-tab="tab-chains"]').click();
        showToast("Loaded Code & Test Suite Chain! 💻");
      }
    }},
    { name: "Load Marketing Launch Chain", icon: "🎯", kbd: "", action: () => {
      if (typeof BUILTIN_CHAINS !== 'undefined') {
        state.activeChain = JSON.parse(JSON.stringify(BUILTIN_CHAINS[2]));
        saveActiveChain();
        renderChainBuilder();
        document.querySelector('.nav-item[data-tab="tab-chains"]').click();
        showToast("Loaded Marketing Launch Chain! 🎯");
      }
    }},

    { name: "Compress & Optimize Prompt", icon: "⚡", kbd: "O", action: () => openCompressModal() },
    { name: "Surprise Me (Load Random Prompt)", icon: "🎲", kbd: "Ctrl+K", action: () => triggerSurpriseMePrompt() },
    { name: "Add Trust & Accuracy Rules", icon: "🛡️", kbd: "Ctrl+Enter", action: () => dom.enhancePromptBtn.click() },
    { name: "Copy Studio Prompt", icon: "📋", kbd: "Ctrl+Shift+C", action: handleStudioPromptCopy },
    { name: "Toggle Theme Mode", icon: "🌙", kbd: "T", action: () => dom.themeToggleBtn.click() },
    
    { name: "Open Keyboard Shortcuts", icon: "⌨️", kbd: "?", action: () => openShortcutsModal() },
    { name: "Open Version History Modal", icon: "📜", kbd: "H", action: () => dom.openHistoryModalBtn.click() },
    { name: "Deduplicate & Clean History", icon: "🧹", kbd: "", action: () => {
      if (dom.openHistoryModalBtn) dom.openHistoryModalBtn.click();
      deduplicateVersionHistory();
    }},
    { name: "Open Export Prompt Modal", icon: "📤", kbd: "E", action: () => dom.openExportModalBtn.click() },
    { name: "Open Settings & Preferences", icon: "⚙️", kbd: "S", action: () => { if (dom.openSettingsModalBtn) dom.openSettingsModalBtn.click(); } }
  ];

  function openCommandPalette() {
    dom.commandPaletteInput.value = '';
    activePaletteIndex = 0;
    renderCommandPaletteItems();
    openModal(dom.commandPalette, dom.commandPalette);
  }

  function closeCommandPalette() {
    closeModal(dom.commandPalette);
  }

  function renderCommandPaletteItems() {
    const query = dom.commandPaletteInput.value.toLowerCase().trim();
    filteredCommands = commands.filter(cmd => 
      cmd.name.toLowerCase().includes(query)
    );

    dom.commandPaletteList.innerHTML = '';
    
    if (filteredCommands.length === 0) {
      dom.commandPaletteList.innerHTML = `
        <div class="command-palette-empty">
          <div class="command-palette-empty-icon">⚡</div>
          <div class="command-palette-empty-title">No commands matching "${escapeHtml(query)}"</div>
          <div class="command-palette-empty-hints">
            Try searching for <span>Studio</span>, <span>Vault</span>, <span>Compress</span>, <span>Copy</span>, <span>Theme</span>, or press <kbd style="font-size:0.75rem; padding: 2px 5px; background: rgba(255,255,255,0.08); border-radius: 4px; border: 1px solid var(--border-color);">Esc</kbd> to close.
          </div>
        </div>
      `;
      return;
    }

    if (activePaletteIndex >= filteredCommands.length) {
      activePaletteIndex = filteredCommands.length - 1;
    }
    if (activePaletteIndex < 0) {
      activePaletteIndex = 0;
    }

    filteredCommands.forEach((cmd, idx) => {
      const isActive = idx === activePaletteIndex;
      const itemDiv = document.createElement('div');
      itemDiv.className = `command-palette-item ${isActive ? 'active' : ''}`;
      
      itemDiv.innerHTML = `
        <div class="command-palette-item-content">
          <span class="command-palette-item-icon">${cmd.icon}</span>
          <span class="command-palette-item-name">${cmd.name}</span>
        </div>
        <span class="command-palette-item-kbd">${cmd.kbd}</span>
      `;

      itemDiv.addEventListener('click', () => {
        cmd.action();
        closeCommandPalette();
      });

      dom.commandPaletteList.appendChild(itemDiv);
    });

    // Ensure selected item is scrolled into view
    const activeEl = dom.commandPaletteList.querySelector('.command-palette-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  // Key Event Listeners for Command Palette Input
  if (dom.commandPaletteInput) {
    dom.commandPaletteInput.addEventListener('input', () => {
      activePaletteIndex = 0;
      renderCommandPaletteItems();
    });

    dom.commandPaletteInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activePaletteIndex = (activePaletteIndex + 1) % filteredCommands.length;
        renderCommandPaletteItems();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activePaletteIndex = (activePaletteIndex - 1 + filteredCommands.length) % filteredCommands.length;
        renderCommandPaletteItems();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[activePaletteIndex]) {
          filteredCommands[activePaletteIndex].action();
          closeCommandPalette();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeCommandPalette();
      }
    });
  }

  // Close when clicking overlay backdrop
  if (dom.commandPalette) {
    dom.commandPalette.addEventListener('click', (e) => {
      if (e.target === dom.commandPalette) {
        closeCommandPalette();
      }
    });
  }

  // Global Keyboard Shortcuts Event Listeners
  window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isEditing = activeEl && (
      activeEl.tagName === 'INPUT' || 
      activeEl.tagName === 'TEXTAREA' || 
      activeEl.isContentEditable || 
      activeEl.tagName === 'SELECT'
    );

    // 1. Ctrl+K (or Cmd+K) to Toggle Command Palette
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (dom.commandPalette && dom.commandPalette.classList.contains('active')) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
      return;
    }

    // 2. '?' or Ctrl+/ to Toggle Keyboard Shortcuts Cheatsheet
    if ((e.key === '?' && !isEditing) || ((e.ctrlKey || e.metaKey) && e.key === '/')) {
      e.preventDefault();
      if (dom.shortcutsModal && dom.shortcutsModal.classList.contains('active')) {
        closeShortcutsModal();
      } else {
        openShortcutsModal();
      }
      return;
    }

    // 3. Ctrl+Enter to Add Trust & Accuracy Rules (inside input boxes or globally)
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      if (dom.enhancePromptBtn) dom.enhancePromptBtn.click();
      return;
    }

    // 4. Ctrl+B (or Cmd+B) to convert selected text to a {{blank}} variable
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
      if (isEditing && activeEl.tagName !== 'SELECT') {
        e.preventDefault();
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        const selectedText = activeEl.value.substring(start, end).trim();

        if (selectedText.length > 0) {
          let varName = selectedText
            .toLowerCase()
            .replace(/[{}]/g, '')
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
          if (!varName) varName = 'blank';

          const replacement = `{{${varName}}}`;
          activeEl.value = activeEl.value.substring(0, start) + replacement + activeEl.value.substring(end);
          activeEl.selectionStart = start;
          activeEl.selectionEnd = start + replacement.length;
          activeEl.dispatchEvent(new Event('input', { bubbles: true }));
          showToast(`Created {{${varName}}} fill-in blank! 🔤`);
        } else {
          showToast("Highlight a word or phrase and press Ctrl+B to make a {{blank}}! 💡");
        }
        return;
      }
    }

    // 5. Ctrl+Shift+C to Copy Prompt
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      if (dom.copyPromptBtn) {
        dom.copyPromptBtn.click();
      }
      return;
    }

    // 6. Ctrl+Shift+O to Open Compression Optimizer
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      openCompressModal();
      return;
    }

    // 7. Escape key closes any active modal or palette, or dismisses the top toast
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal-overlay.active:not(#dropOverlay)');
      if (activeModal) {
        closeCommandPalette();
        if (dom.compressModal) closeModal(dom.compressModal);
        if (dom.shortcutsModal) closeModal(dom.shortcutsModal);
        if (dom.settingsModal) closeModal(dom.settingsModal);
        if (dom.savePromptModal) closeModal(dom.savePromptModal);
        if (dom.exportModal) closeModal(dom.exportModal);
        if (dom.historyModal) closeModal(dom.historyModal);
        if (dom.confirmModal) closeModal(dom.confirmModal);
        if (dom.inputPromptModal) closeModal(dom.inputPromptModal);
      } else {
        // Dismiss newest visible toast if no modal is active
        const activeToasts = dom.toastContainer ? dom.toastContainer.querySelectorAll('.toast:not(.toast-dismissing)') : [];
        if (activeToasts.length > 0) {
          dismissToast(activeToasts[activeToasts.length - 1]);
        }
      }
      return;
    }

    // 8. Non-input single key navigation & shortcuts
    if (!isEditing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const key = e.key.toLowerCase();

      // Handle 'G' prefix navigation sequence (G then S / T / V)
      if (key === 'g') {
        isGSequenceActive = true;
        clearTimeout(gSequenceTimer);
        gSequenceTimer = setTimeout(() => { isGSequenceActive = false; }, 1000);
        return;
      }

      if (isGSequenceActive) {
        isGSequenceActive = false;
        clearTimeout(gSequenceTimer);
        if (key === 's') {
          const studioNav = document.querySelector('.nav-item[data-tab="tab-studio"]');
          if (studioNav) studioNav.click();
          return;
        }
        if (key === 't') {
          const templatesNav = document.querySelector('.nav-item[data-tab="tab-templates"]');
          if (templatesNav) templatesNav.click();
          return;
        }
        if (key === 'v') {
          const vaultNav = document.querySelector('.nav-item[data-tab="tab-vault"]');
          if (vaultNav) vaultNav.click();
          return;
        }
        if (key === 'c') {
          const chainsNav = document.querySelector('.nav-item[data-tab="tab-chains"]');
          if (chainsNav) chainsNav.click();
          return;
        }
      }

      // Standalone modal/action hotkeys (when not inside modals)
      const hasActiveModal = document.querySelector('.modal-overlay.active:not(#dropOverlay)');
      if (!hasActiveModal) {
        if (key === 't' && dom.themeToggleBtn) {
          dom.themeToggleBtn.click();
        } else if (key === 'h' && dom.openHistoryModalBtn) {
          dom.openHistoryModalBtn.click();
        } else if (key === 'o') {
          openCompressModal();
        } else if (key === 'e' && dom.openExportModalBtn) {
          dom.openExportModalBtn.click();
        } else if (key === 's' && dom.openSettingsModalBtn) {
          dom.openSettingsModalBtn.click();
        }
      }
    }
  });

  // --- Drag and Drop File Importer Logic ---
  // --- Drag and Drop File Importer & Content Sanitization ---

  /**
   * Validates imported file metadata (extension, size, and MIME type).
   * @param {File} file Uploaded file object
   * @returns {{valid: boolean, error?: string}} Validation outcome
   */
  function validateImportFile(file) {
    if (!file) return { valid: false, error: "No file selected." };

    const filename = (file.name || '').toLowerCase();
    const parts = filename.split('.');
    const ext = parts.pop();

    // 1. Check double extensions or dangerous executables
    const dangerousExts = ['exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'dll', 'bin', 'msi', 'scr', 'com', 'pif'];
    if (parts.some(p => dangerousExts.includes(p)) || dangerousExts.includes(ext)) {
      return { valid: false, error: "Executable files are blocked for security. Please import a .txt, .md, or .json prompt file." };
    }

    // 2. Validate allowed file extensions
    if (!['txt', 'md', 'json'].includes(ext)) {
      return { valid: false, error: "Unsupported format! Please drop a .txt, .md, or .json file." };
    }

    // 3. Validate file size (10MB maximum limit)
    if (file.size > 10 * 1024 * 1024) {
      return { valid: false, error: "File is too large (>10MB). Please select a text/prompt file." };
    }

    // 4. Validate MIME Type
    const mime = (file.type || '').toLowerCase();
    const blockedMimePrefixes = ['image/', 'video/', 'audio/', 'application/x-msdownload', 'application/x-executable', 'application/x-sh'];
    if (blockedMimePrefixes.some(prefix => mime.startsWith(prefix))) {
      return { valid: false, error: "Binary or media file detected. Please upload a plain text prompt file." };
    }

    return { valid: true };
  }

  /**
   * Strips binary null bytes, ANSI escapes, and dangerous non-printable control characters.
   * @param {string} text Raw text content
   * @returns {string|null} Sanitized string or null if text is binary
   */
  function sanitizeTextContent(text) {
    if (typeof text !== 'string') return '';

    // Detect binary content (null bytes or excessive control chars)
    if (text.includes('\0')) {
      // Check ratio of null/control bytes
      let controlCount = 0;
      for (let i = 0; i < Math.min(text.length, 1000); i++) {
        const code = text.charCodeAt(i);
        if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
          controlCount++;
        }
      }
      if (controlCount > 5) {
        return null; // Flag as binary file
      }
    }

    // Strip null bytes and ANSI escape sequences
    return text
      .replace(/\0/g, '')
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  /**
   * Validates and sanitizes imported JSON prompt packages against prototype pollution and schema mismatch.
   * @param {Object} parsed Parsed JSON object
   * @returns {Object|null} Whitelisted and sanitized prompt object, or null if schema invalid
   */
  function sanitizeImportedJson(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    // Check if nested in .prompt property or at root
    const rawTarget = (parsed.prompt && typeof parsed.prompt === 'object' && !Array.isArray(parsed.prompt))
      ? parsed.prompt
      : parsed;

    const hasStudioKeys = rawTarget.role !== undefined || rawTarget.context !== undefined || rawTarget.task !== undefined || rawTarget.constraints !== undefined;
    if (!hasStudioKeys) return null;

    const clean = {
      role: '',
      context: '',
      task: '',
      constraints: '',
      outputFormat: '',
      fewShot: '',
      variables: Object.create(null)
    };

    if (rawTarget.role) clean.role = sanitizeTextContent(String(rawTarget.role)) || '';
    if (rawTarget.context) clean.context = sanitizeTextContent(String(rawTarget.context)) || '';
    if (rawTarget.task) clean.task = sanitizeTextContent(String(rawTarget.task)) || '';

    if (Array.isArray(rawTarget.constraints)) {
      clean.constraints = rawTarget.constraints
        .map(c => sanitizeTextContent(String(c)) || '')
        .filter(c => c.length > 0)
        .join('\n');
    } else if (rawTarget.constraints) {
      clean.constraints = sanitizeTextContent(String(rawTarget.constraints)) || '';
    }

    if (rawTarget.outputFormat) clean.outputFormat = sanitizeTextContent(String(rawTarget.outputFormat)) || '';
    if (rawTarget.fewShot) clean.fewShot = sanitizeTextContent(String(rawTarget.fewShot)) || '';

    // Safe variable extraction (rejecting prototype poisoning)
    if (parsed.variables && typeof parsed.variables === 'object' && !Array.isArray(parsed.variables)) {
      for (const [k, v] of Object.entries(parsed.variables)) {
        if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype' && typeof k === 'string') {
          clean.variables[k] = sanitizeTextContent(String(v || '')) || '';
        }
      }
    }

    return clean;
  }

  if (dom.dropOverlay) {
    // Show overlay when dragging files over window
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.dropOverlay.classList.add('active');
    });

    // Hide overlay when leaving window
    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      // Ensure we only hide if we drag completely off window
      if (e.relatedTarget === null || e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        dom.dropOverlay.classList.remove('active');
      }
    });

    window.addEventListener('dragend', (e) => {
      e.preventDefault();
      dom.dropOverlay.classList.remove('active');
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.dropOverlay.classList.remove('active');

      const files = e.dataTransfer ? e.dataTransfer.files : null;
      if (!files || files.length === 0) return;

      const file = files[0];
      const validation = validateImportFile(file);
      if (!validation.valid) {
        showToast(validation.error, 'warning');
        return;
      }

      const ext = (file.name.toLowerCase().split('.').pop() || '');
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const rawText = event.target ? event.target.result : '';
        const sanitized = sanitizeTextContent(rawText);

        if (sanitized === null) {
          showToast("Binary file detected. Import rejected for security. ⚠️", "error");
          return;
        }

        if (ext === 'json') {
          const parsed = SafeStorage.parseJson(sanitized, null);
          const sanitizedPrompt = sanitizeImportedJson(parsed);

          if (sanitizedPrompt) {
            // Load structured prompt package into Form Builder
            state.currentPrompt.role = sanitizedPrompt.role;
            state.currentPrompt.context = sanitizedPrompt.context;
            state.currentPrompt.task = sanitizedPrompt.task;
            state.currentPrompt.constraints = sanitizedPrompt.constraints;
            state.currentPrompt.outputFormat = sanitizedPrompt.outputFormat;
            state.currentPrompt.fewShot = sanitizedPrompt.fewShot;
            if (Object.keys(sanitizedPrompt.variables).length > 0) {
              state.variableValues = Object.assign(state.variableValues, sanitizedPrompt.variables);
            }

            state.studioMode = 'form';
            dom.modeFormPill.classList.add('active');
            dom.modeRawPill.classList.remove('active');
            dom.formBuilderView.style.display = 'block';
            dom.rawMarkdownView.style.display = 'none';

            initFormValues();
            updateLivePreview();
            showToast(`Imported Prompt Package: "${file.name}" 📂`, 'success');
          } else {
            // Load as raw text inside raw editor
            loadAsRawPrompt(sanitized, file.name);
          }
        } else {
          // txt or md file
          loadAsRawPrompt(sanitized, file.name);
        }
      };

      reader.onerror = () => {
        showToast("Failed to read file from disk. ⚠️", "error");
      };

      reader.readAsText(file);
    });
  }

  function loadAsRawPrompt(text, filename) {
    state.currentPrompt.rawText = text;
    state.studioMode = 'raw';
    
    dom.modeRawPill.classList.add('active');
    dom.modeFormPill.classList.remove('active');
    dom.formBuilderView.style.display = 'none';
    dom.rawMarkdownView.style.display = 'flex';
    
    dom.rawMarkdownTextarea.value = text;
    updateLivePreview();
    showToast(`Imported Raw Prompt: "${filename}" 📂`, 'success');
  }

  // --- Visual Token Breakdown & Cost Allocation Bar Logic ---
  function renderTokenBreakdown() {
    if (!dom.tokenBreakdownBar || !dom.tokenBreakdownLegend) return;

    dom.tokenBreakdownBar.innerHTML = '';
    dom.tokenBreakdownLegend.innerHTML = '';

    if (state.studioMode === 'raw') {
      // In Raw Mode, render a single block representing the raw text
      const rawText = dom.rawMarkdownTextarea.value || '';
      const charCount = rawText.length;
      const tokenCount = Math.ceil(charCount / 4);

      if (tokenCount === 0) {
        dom.tokenBreakdownBar.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; width: 100%; line-height: 10px;">Empty Prompt</div>`;
        return;
      }

      // Bar Segment
      const seg = document.createElement('div');
      seg.className = 'token-segment seg-raw';
      seg.style.width = '100%';
      seg.title = `Raw Prompt: ${tokenCount} tokens (100%)`;
      dom.tokenBreakdownBar.appendChild(seg);

      // Legend Item
      dom.tokenBreakdownLegend.innerHTML = `
        <div class="legend-item">
          <span class="legend-dot seg-raw"></span>
          <span>Raw Editor:</span>
          <span class="legend-val">${tokenCount} tokens (100%)</span>
        </div>
      `;
      return;
    }

    // Form Builder Mode: Calculate breakdown of individual components
    const roleText = state.currentPrompt.role || '';
    const contextText = state.currentPrompt.context || '';
    const taskText = state.currentPrompt.task || '';
    const constraintsText = state.currentPrompt.constraints || '';
    const formatText = state.currentPrompt.outputFormat || '';
    const fewShotText = state.currentPrompt.fewShot || '';

    const segments = [
      { key: 'role', label: 'Role/Persona', text: roleText, class: 'seg-role' },
      { key: 'context', label: 'Context', text: contextText, class: 'seg-context' },
      { key: 'task', label: 'Task Instructions', text: taskText, class: 'seg-task' },
      { key: 'constraints', label: 'Guardrails', text: constraintsText, class: 'seg-constraints' },
      { key: 'outputFormat', label: 'Output Format', text: formatText, class: 'seg-outputFormat' },
      { key: 'fewShot', label: 'Examples', text: fewShotText, class: 'seg-fewShot' }
    ];

    const parsedSegments = segments.map(seg => {
      const charLen = seg.text.length;
      const tokens = Math.ceil(charLen / 4);
      return { ...seg, tokens };
    });

    const totalTokens = parsedSegments.reduce((sum, s) => sum + s.tokens, 0);

    if (totalTokens === 0) {
      dom.tokenBreakdownBar.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; width: 100%; line-height: 10px;">Empty Prompt</div>`;
      return;
    }

    parsedSegments.forEach(seg => {
      if (seg.tokens === 0) return;
      const pct = ((seg.tokens / totalTokens) * 100).toFixed(1);

      // Append Segment Bar
      const segEl = document.createElement('div');
      segEl.className = `token-segment ${seg.class}`;
      segEl.style.width = `${pct}%`;
      segEl.title = `${seg.label}: ${seg.tokens} tokens (${pct}%)`;
      dom.tokenBreakdownBar.appendChild(segEl);

      // Append Legend Item
      const legendItem = document.createElement('div');
      legendItem.className = 'legend-item';
      legendItem.innerHTML = `
        <span class="legend-dot ${seg.class}"></span>
        <span>${seg.label}:</span>
        <span class="legend-val">${seg.tokens} tkn (${pct}%)</span>
      `;
      dom.tokenBreakdownLegend.appendChild(legendItem);
    });
  }

  // --- Initial Setup Execution ---
  loadDraftFromStorage();
  initTheme();
  initDevMode();
  initColorblindMode();
  if (dom.modelSelect) {
    dom.modelSelect.value = state.targetModel;
  }
  updateModelIdInputVisibility();
  initFormValues();
  renderTemplateHub();
  renderVault();
  initVaultSyncStatus();
  renderChainBuilder();
  initWizard();
  initClearStepHandlers();
  initTonePresetHandlers();
  initGuardrailPillHandlers();
  syncTonePillUI();
  initWelcomeBanner();
  initModalTouchGestures();
  updateLivePreview();

  // --- PWA Service Worker Registration ---
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then((registration) => {
          console.log('Prompt Helper Service Worker registered:', registration.scope);
        })
        .catch((error) => {
          console.warn('Service Worker registration failed:', error);
        });
    });
  }

});


