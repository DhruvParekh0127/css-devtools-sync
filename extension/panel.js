// Unified DevTools Panel with Configuration and Change Management
class CSSDevToolsPanel {
    constructor() {
        this.isTracking = false;
        this.detectedChanges = [];
        this.selectedChanges = new Set();
        this.currentDomain = '';
        
        // UI Elements
        this.statusEl = document.getElementById('sync-status');
        this.cssPathEl = document.getElementById('css-path');
        this.detectionModeEl = document.getElementById('detection-mode');
        this.currentDomainEl = document.getElementById('current-domain');
        this.saveConfigBtnEl = document.getElementById('save-config-btn');
        this.startBtnEl = document.getElementById('start-btn');
        this.stopBtnEl = document.getElementById('stop-btn');
        this.clearBtnEl = document.getElementById('clear-btn');
        this.changesListEl = document.getElementById('changes-list');
        this.changesCountEl = document.getElementById('changes-count');
        this.bulkActionsEl = document.getElementById('bulk-actions');
        this.selectedCountEl = document.getElementById('selected-count');
        this.selectAllBtnEl = document.getElementById('select-all-btn');
        this.applySelectedBtnEl = document.getElementById('apply-selected-btn');
        this.removeSelectedBtnEl = document.getElementById('remove-selected-btn');
        this.logEl = document.getElementById('log');
        
        this.init();
    }

    async init() {
        this.loadSettings();
        this.getCurrentDomain();
        this.setupEventListeners();
        this.checkServerStatus();
        
        // Check status periodically
        setInterval(() => this.checkServerStatus(), 5000);
        
        this.log('Panel initialized and ready');
    }

    loadSettings() {
        // Load from Chrome storage
        chrome.storage.local.get(['cssPath', 'detectionMode'], (result) => {
            if (result.cssPath) {
                this.cssPathEl.value = result.cssPath;
            }
            if (result.detectionMode) {
                this.detectionModeEl.value = result.detectionMode;
            }
        });
    }

    getCurrentDomain() {
        chrome.devtools.inspectedWindow.eval('window.location.hostname', (result) => {
            this.currentDomain = result || 'unknown';
            this.currentDomainEl.textContent = this.currentDomain;
        });
    }

    setupEventListeners() {
        this.saveConfigBtnEl.addEventListener('click', () => this.saveConfiguration());
        this.startBtnEl.addEventListener('click', () => this.startTracking());
        this.stopBtnEl.addEventListener('click', () => this.stopTracking());
        this.clearBtnEl.addEventListener('click', () => this.clearAllChanges());
        this.selectAllBtnEl.addEventListener('click', () => this.selectAllChanges());
        this.applySelectedBtnEl.addEventListener('click', () => this.applySelectedChanges());
        this.removeSelectedBtnEl.addEventListener('click', () => this.removeSelectedChanges());

        // Listen for messages from content script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'CSS_CHANGE_DETECTED') {
                this.handleNewChange(message.data);
            }
        });
    }

    async saveConfiguration() {
        const cssPath = this.cssPathEl.value.trim();
        const detectionMode = this.detectionModeEl.value;

        if (!cssPath) {
            alert('Please enter a CSS project path');
            return;
        }

        this.saveConfigBtnEl.disabled = true;
        this.saveConfigBtnEl.textContent = 'Saving...';

        try {
            // Save to Chrome storage
            await chrome.storage.local.set({ cssPath, detectionMode });
            
            // Send to server
            const response = await chrome.runtime.sendMessage({
                type: 'SET_PROJECT_CONFIGURATION',
                data: { 
                    projectPath: cssPath,
                    detectionMode,
                    currentDomain: this.currentDomain
                }
            });

            if (response && response.success) {
                this.log('Configuration saved successfully', 'success');
                this.saveConfigBtnEl.textContent = 'Saved!';
                setTimeout(() => {
                    this.saveConfigBtnEl.textContent = 'Save Config';
                    this.saveConfigBtnEl.disabled = false;
                }, 2000);
            } else {
                throw new Error(response?.error || 'Failed to save configuration');
            }
        } catch (error) {
            this.log(`Configuration error: ${error.message}`, 'error');
            this.saveConfigBtnEl.textContent = 'Save Config';
            this.saveConfigBtnEl.disabled = false;
        }
    }

    async checkServerStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ 
                type: 'GET_SERVER_STATUS',
                domain: this.currentDomain 
            });
            
            if (response && response.connected) {
                this.updateStatus('active', 'Connected');
            } else {
                this.updateStatus('inactive', 'Server not running');
            }
        } catch (error) {
            this.updateStatus('inactive', 'Connection failed');
        }
    }

    updateStatus(type, text) {
        this.statusEl.className = `status ${type}`;
        this.statusEl.querySelector('span').textContent = text;
    }

    async startTracking() {
        if (this.isTracking) return;

        try {
            await this.injectChangeDetector();
            this.isTracking = true;
            this.updateTrackingUI();
            this.log('Started tracking CSS changes', 'info');
        } catch (error) {
            this.log(`Failed to start tracking: ${error.message}`, 'error');
        }
    }

    stopTracking() {
        this.isTracking = false;
        this.updateTrackingUI();
        this.log('Stopped tracking CSS changes', 'info');
    }

    updateTrackingUI() {
        if (this.isTracking) {
            this.startBtnEl.style.display = 'none';
            this.stopBtnEl.style.display = 'inline-block';
        } else {
            this.startBtnEl.style.display = 'inline-block';
            this.stopBtnEl.style.display = 'none';
        }
    }

    clearAllChanges() {
        this.detectedChanges = [];
        this.selectedChanges.clear();
        this.renderChanges();
        this.log('Cleared all changes', 'info');
    }

    handleNewChange(changeData) {
        if (!this.isTracking) return;

        // Add unique ID and timestamp
        const change = {
            id: Date.now() + Math.random(),
            ...changeData,
            timestamp: new Date(),
            applied: false
        };

        this.detectedChanges.unshift(change); // Add to beginning
        this.renderChanges();
        this.log(`New change detected: ${change.selector}`, 'info');
    }

    renderChanges() {
        this.changesCountEl.textContent = this.detectedChanges.length;

        if (this.detectedChanges.length === 0) {
            this.changesListEl.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🎨</div>
                    <div>No CSS changes detected yet.</div>
                    <div style="font-size: 11px; margin-top: 5px;">Start tracking and make changes in DevTools Elements panel.</div>
                </div>`;
            this.bulkActionsEl.style.display = 'none';
            return;
        }

        const changesHtml = this.detectedChanges.map(change => this.renderChangeItem(change)).join('');
        this.changesListEl.innerHTML = changesHtml;
        this.bulkActionsEl.style.display = 'flex';
        this.updateBulkActionsUI();

        // Add event listeners to checkboxes and buttons
        this.setupChangeItemListeners();
    }

    renderChangeItem(change) {
        const isSelected = this.selectedChanges.has(change.id);
        const changesText = Object.entries(change.changes || {})
            .map(([prop, value]) => {
                if (typeof value === 'object' && value.from && value.to) {
                    return `
                        <div class="change-property">
                            <span class="property-name">${prop}:</span>
                            <span class="property-value old">${value.from}</span> → 
                            <span class="property-value new">${value.to}</span>
                        </div>`;
                } else {
                    return `
                        <div class="change-property">
                            <span class="property-name">${prop}:</span>
                            <span class="property-value new">${value}</span>
                        </div>`;
                }
            }).join('');

        return `
            <div class="change-item ${isSelected ? 'selected' : ''}" data-change-id="${change.id}">
                <input type="checkbox" class="checkbox change-checkbox" ${isSelected ? 'checked' : ''}>
                <div class="change-details">
                    <div class="change-selector">${change.selector}</div>
                    ${changesText}
                    <div style="font-size: 10px; color: #999; margin-top: 4px;">
                        ${change.timestamp.toLocaleTimeString()} • ${change.source || 'unknown'}
                        ${change.applied ? ' • <span style="color: #28a745;">Applied</span>' : ''}
                    </div>
                </div>
                <div class="change-actions">
                    <button class="btn btn-mini success apply-single-btn" ${change.applied ? 'disabled' : ''}>
                        ${change.applied ? 'Applied' : 'Apply'}
                    </button>
                    <button class="btn btn-mini danger remove-single-btn">Remove</button>
                </div>
            </div>`;
    }

    setupChangeItemListeners() {
        // Checkbox listeners
        document.querySelectorAll('.change-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const changeId = e.target.closest('.change-item').dataset.changeId;
                if (e.target.checked) {
                    this.selectedChanges.add(changeId);
                } else {
                    this.selectedChanges.delete(changeId);
                }
                this.updateBulkActionsUI();
                this.updateChangeItemSelection();
            });
        });

        // Apply single change
        document.querySelectorAll('.apply-single-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const changeId = e.target.closest('.change-item').dataset.changeId;
                this.applySingleChange(changeId);
            });
        });

        // Remove single change
        document.querySelectorAll('.remove-single-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const changeId = e.target.closest('.change-item').dataset.changeId;
                this.removeSingleChange(changeId);
            });
        });
    }

    updateChangeItemSelection() {
        document.querySelectorAll('.change-item').forEach(item => {
            const changeId = item.dataset.changeId;
            if (this.selectedChanges.has(changeId)) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    updateBulkActionsUI() {
        this.selectedCountEl.textContent = this.selectedChanges.size;
        this.applySelectedBtnEl.disabled = this.selectedChanges.size === 0;
        this.removeSelectedBtnEl.disabled = this.selectedChanges.size === 0;
    }

    selectAllChanges() {
        this.detectedChanges.forEach(change => {
            this.selectedChanges.add(change.id);
        });
        this.renderChanges();
    }

    async applySingleChange(changeId) {
        const change = this.detectedChanges.find(c => c.id == changeId);
        if (!change) return;

        await this.applyChangesToFiles([change]);
    }

    async applySelectedChanges() {
        const selectedChanges = this.detectedChanges.filter(change => 
            this.selectedChanges.has(change.id)
        );
        
        if (selectedChanges.length === 0) return;

        await this.applyChangesToFiles(selectedChanges);
    }

    async applyChangesToFiles(changes) {
        this.log(`Applying ${changes.length} changes to files...`, 'info');

        for (const change of changes) {
            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'APPLY_CSS_CHANGE',
                    data: change
                });

                if (response && response.success) {
                    change.applied = true;
                    this.log(`Applied: ${change.selector} to ${response.file}`, 'success');
                } else {
                    this.log(`Failed to apply: ${change.selector} - ${response?.error}`, 'error');
                }
            } catch (error) {
                this.log(`Error applying ${change.selector}: ${error.message}`, 'error');
            }
        }

        this.renderChanges();
    }

    removeSingleChange(changeId) {
        this.detectedChanges = this.detectedChanges.filter(c => c.id != changeId);
        this.selectedChanges.delete(changeId);
        this.renderChanges();
    }

    removeSelectedChanges() {
        this.detectedChanges = this.detectedChanges.filter(change => 
            !this.selectedChanges.has(change.id)
        );
        this.selectedChanges.clear();
        this.renderChanges();
        this.log('Removed selected changes', 'info');
    }

    async injectChangeDetector() {
        // Instead of injecting into page, use Chrome DevTools Protocol
        return this.setupDevToolsProtocolListener();
    }

    async setupDevToolsProtocolListener() {
        try {
            const tabId = chrome.devtools.inspectedWindow.tabId;
            
            // First, try to detach any existing debugger
            try {
                await chrome.debugger.detach({ tabId });
                this.log('Detached existing debugger', 'info');
            } catch (e) {
                // No existing debugger, continue
            }
            
            // Attach debugger with proper version
            await chrome.debugger.attach({ tabId }, "1.3");
            this.log('Debugger attached successfully', 'info');
            
            // Enable DOM first (required for CSS)
            await chrome.debugger.sendCommand({ tabId }, "DOM.enable");
            this.log('DOM agent enabled', 'info');
            
            // Then enable CSS
            await chrome.debugger.sendCommand({ tabId }, "CSS.enable");
            this.log('CSS agent enabled', 'info');
            
            // Listen for CSS stylesheet changes
            chrome.debugger.onEvent.addListener(this.handleDebuggerEvent.bind(this));
            
            this.log('DevTools Protocol CSS monitoring started', 'success');
            return 'CSS monitoring initialized';
        } catch (error) {
            this.log(`Failed to setup CSS monitoring: ${error.message}`, 'error');
            console.error('DevTools Protocol error:', error);
            throw error;
        }
    }

    handleDebuggerEvent(source, method, params) {
        if (source.tabId !== chrome.devtools.inspectedWindow.tabId) return;

        switch (method) {
            case 'CSS.styleSheetChanged':
                this.handleStyleSheetChanged(params);
                break;
            case 'DOM.documentUpdated':
                // Document changed, might need to re-enable CSS
                this.handleDocumentUpdated();
                break;
        }
    }

    async handleDocumentUpdated() {
        // Re-enable CSS when document updates
        try {
            await chrome.debugger.sendCommand(
                { tabId: chrome.devtools.inspectedWindow.tabId }, 
                "CSS.enable"
            );
            this.log('CSS re-enabled after document update', 'info');
        } catch (error) {
            this.log(`Failed to re-enable CSS: ${error.message}`, 'error');
        }
    }

    async handleStyleSheetChanged(params) {
        try {
            const { styleSheetId } = params;
            const tabId = chrome.devtools.inspectedWindow.tabId;
            
            this.log(`Stylesheet changed: ${styleSheetId}`, 'info');
            
            // Get the modified stylesheet content
            const styleSheetResult = await chrome.debugger.sendCommand(
                { tabId },
                "CSS.getStyleSheetText",
                { styleSheetId }
            );

            // Get stylesheet header info for more context
            let styleSheetInfo = null;
            try {
                const allStyleSheets = await chrome.debugger.sendCommand(
                    { tabId },
                    "CSS.getMatchedStylesForNode",
                    { nodeId: 1 }
                );
                // Find the stylesheet info (simplified approach)
                styleSheetInfo = { sourceURL: 'external-css' };
            } catch (e) {
                // Fallback if can't get stylesheet info
                styleSheetInfo = { sourceURL: 'unknown' };
            }

            // Parse the changes and extract meaningful modifications
            await this.analyzeStyleSheetChanges(styleSheetId, styleSheetResult.text, styleSheetInfo);
            
        } catch (error) {
            this.log(`Error handling stylesheet change: ${error.message}`, 'error');
            console.error('Stylesheet change error:', error);
        }
    }

    async analyzeStyleSheetChanges(styleSheetId, newContent, styleSheetInfo) {
        // Store previous content to compare
        if (!this.stylesheetCache) {
            this.stylesheetCache = new Map();
        }

        const cacheKey = `${styleSheetId}`;
        const previousContent = this.stylesheetCache.get(cacheKey);
        this.stylesheetCache.set(cacheKey, newContent);

        if (!previousContent) {
            // First time seeing this stylesheet, just cache it
            this.log(`Cached stylesheet: ${styleSheetInfo.sourceURL}`, 'info');
            return;
        }

        // Skip if content is identical
        if (previousContent === newContent) {
            return;
        }

        this.log(`Analyzing changes in: ${styleSheetInfo.sourceURL}`, 'info');

        // Compare old vs new content to find specific changes
        const changes = this.detectCSSRuleChanges(previousContent, newContent, styleSheetInfo);
        
        if (changes.length > 0) {
            this.log(`Found ${changes.length} CSS rule changes`, 'success');
            changes.forEach(change => this.handleNewChange(change));
        } else {
            this.log('No significant rule changes detected', 'info');
        }
    }

    detectCSSRuleChanges(oldContent, newContent, styleSheetInfo) {
        const changes = [];
        
        try {
            // Parse both old and new CSS
            const oldRules = this.parseCSS(oldContent);
            const newRules = this.parseCSS(newContent);
            
            this.log(`Comparing ${oldRules.length} old rules with ${newRules.length} new rules`, 'info');
            
            // Compare rules to find modifications
            for (const newRule of newRules) {
                const oldRule = oldRules.find(r => this.normalizeSelector(r.selector) === this.normalizeSelector(newRule.selector));
                
                if (oldRule) {
                    // Check for property changes
                    const propertyChanges = this.compareRuleProperties(oldRule.properties, newRule.properties);
                    
                    if (Object.keys(propertyChanges).length > 0) {
                        changes.push({
                            selector: newRule.selector,
                            changes: propertyChanges,
                            source: 'external-css',
                            sourceFile: styleSheetInfo.sourceURL,
                            type: 'rule-modified'
                        });
                    }
                } else if (Object.keys(newRule.properties).length > 0) {
                    // New rule added (ignore empty rules)
                    changes.push({
                        selector: newRule.selector,
                        changes: newRule.properties,
                        source: 'external-css',
                        sourceFile: styleSheetInfo.sourceURL,
                        type: 'rule-added'
                    });
                }
            }
            
            // Check for deleted rules (optional, can be noisy)
            // Commenting out for now as it might be too verbose
            /*
            for (const oldRule of oldRules) {
                const stillExists = newRules.find(r => this.normalizeSelector(r.selector) === this.normalizeSelector(oldRule.selector));
                if (!stillExists && Object.keys(oldRule.properties).length > 0) {
                    changes.push({
                        selector: oldRule.selector,
                        changes: {},
                        source: 'external-css',
                        sourceFile: styleSheetInfo.sourceURL,
                        type: 'rule-deleted'
                    });
                }
            }
            */
            
        } catch (error) {
            this.log(`Error parsing CSS changes: ${error.message}`, 'error');
            console.error('CSS parsing error:', error);
        }
        
        return changes;
    }

    normalizeSelector(selector) {
        // Normalize selector for comparison (remove extra whitespace, etc.)
        return selector.replace(/\s+/g, ' ').trim().toLowerCase();
    }

    parseCSS(cssText) {
        const rules = [];
        
        try {
            // Improved CSS parser with better handling
            // Remove comments first
            const cleanCSS = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
            
            // Match CSS rules more carefully
            const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
            let match;
            
            while ((match = ruleRegex.exec(cleanCSS)) !== null) {
                const selector = match[1].trim();
                const declarations = match[2].trim();
                
                // Skip empty selectors or media queries for now
                if (!selector || selector.includes('@') || !declarations) {
                    continue;
                }
                
                const properties = {};
                
                // Parse declarations more carefully
                const declarations_split = declarations.split(';');
                for (const decl of declarations_split) {
                    const colonIndex = decl.indexOf(':');
                    if (colonIndex > 0) {
                        const property = decl.substring(0, colonIndex).trim();
                        const value = decl.substring(colonIndex + 1).trim();
                        
                        if (property && value) {
                            properties[property] = value;
                        }
                    }
                }
                
                if (Object.keys(properties).length > 0) {
                    rules.push({
                        selector,
                        properties
                    });
                }
            }
        } catch (error) {
            this.log(`CSS parsing error: ${error.message}`, 'error');
        }
        
        return rules;
    }

    compareRuleProperties(oldProps, newProps) {
        const changes = {};
        
        // Check for modified and new properties
        for (const [prop, newValue] of Object.entries(newProps)) {
            const oldValue = oldProps[prop];
            if (oldValue !== newValue) {
                changes[prop] = {
                    from: oldValue || '(not set)',
                    to: newValue
                };
            }
        }
        
        // Check for deleted properties
        for (const [prop, oldValue] of Object.entries(oldProps)) {
            if (!(prop in newProps)) {
                changes[prop] = {
                    from: oldValue,
                    to: '(deleted)'
                };
            }
        }
        
        return changes;
    }

    async stopTracking() {
        if (this.isTracking) {
            try {
                // Detach debugger
                await chrome.debugger.detach({ tabId: chrome.devtools.inspectedWindow.tabId });
                this.log('Debugger detached successfully', 'info');
            } catch (error) {
                this.log(`Error stopping tracking: ${error.message}`, 'error');
            }
        }
        
        this.isTracking = false;
        this.updateTrackingUI();
        this.log('Stopped tracking CSS changes', 'info');
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
        
        this.logEl.appendChild(entry);
        this.logEl.scrollTop = this.logEl.scrollHeight;
        
        // Keep only last 100 entries
        while (this.logEl.children.length > 100) {
            this.logEl.removeChild(this.logEl.firstChild);
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CSSDevToolsPanel();
});