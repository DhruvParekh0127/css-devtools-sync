// Unified DevTools Panel with Working CSS Change Detection
class CSSDevToolsPanel {
    constructor() {
        this.isTracking = false;
        this.detectedChanges = [];
        this.selectedChanges = new Set();
        this.currentDomain = '';
        this.stylesheetCache = new Map();
        this.debuggerAttached = false;
        
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

        // Listen for CSS change events from debugger
        chrome.debugger.onEvent.addListener((source, method, params) => {
            if (source.tabId === chrome.devtools.inspectedWindow.tabId) {
                this.handleDebuggerEvent(method, params);
            }
        });

        // Clean up on panel close
        window.addEventListener('beforeunload', () => {
            this.cleanup();
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
            await chrome.storage.local.set({ cssPath, detectionMode });
            
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
            await this.attachDebugger();
            await this.enableCSSTracking();
            await this.captureInitialStylesheets();
            
            this.isTracking = true;
            this.updateTrackingUI();
            this.log('Started tracking CSS changes', 'success');
        } catch (error) {
            this.log(`Failed to start tracking: ${error.message}`, 'error');
            console.error('Tracking start error:', error);
        }
    }

    async stopTracking() {
        if (!this.isTracking) return;
        
        try {
            await this.cleanup();
            this.isTracking = false;
            this.updateTrackingUI();
            this.log('Stopped tracking CSS changes', 'info');
        } catch (error) {
            this.log(`Error stopping tracking: ${error.message}`, 'error');
        }
    }

    async cleanup() {
        if (this.debuggerAttached) {
            try {
                await chrome.debugger.detach({ tabId: chrome.devtools.inspectedWindow.tabId });
                this.debuggerAttached = false;
                this.log('Debugger detached', 'info');
            } catch (error) {
                console.log('Debugger detach error (expected if already detached):', error.message);
            }
        }
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

    async attachDebugger() {
        const tabId = chrome.devtools.inspectedWindow.tabId;
        
        // Always try to detach first to avoid conflicts
        try {
            await chrome.debugger.detach({ tabId });
        } catch (e) {
            // Expected if no debugger attached
        }

        try {
            await chrome.debugger.attach({ tabId }, "1.3");
            this.debuggerAttached = true;
            this.log('Debugger attached successfully', 'info');
        } catch (error) {
            throw new Error(`Failed to attach debugger: ${error.message}`);
        }
    }

    async enableCSSTracking() {
        const tabId = chrome.devtools.inspectedWindow.tabId;
        
        try {
            // Enable required domains
            await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
            await chrome.debugger.sendCommand({ tabId }, "DOM.enable");
            await chrome.debugger.sendCommand({ tabId }, "CSS.enable");
            
            this.log('CSS tracking enabled', 'info');
        } catch (error) {
            throw new Error(`Failed to enable CSS tracking: ${error.message}`);
        }
    }

    async captureInitialStylesheets() {
        const tabId = chrome.devtools.inspectedWindow.tabId;
        
        try {
            this.log('Capturing initial stylesheets...', 'info');
            
            // Try to get all stylesheets (may not work in newer Chrome)
            const result = await chrome.debugger.sendCommand({ tabId }, "CSS.getAllStyleSheets");
            
            if (!result || !result.headers) {
                this.log('No stylesheets returned from API', 'info');
                return;
            }

            this.log(`Found ${result.headers.length} initial stylesheets`, 'success');
            
            // Cache each stylesheet's content
            for (const header of result.headers) {
                await this.cacheStylesheet(header, tabId);
            }
            
        } catch (error) {
            // CSS.getAllStyleSheets is deprecated/removed in newer Chrome
            this.log(`Initial stylesheet capture not available: ${JSON.stringify(error)}`, 'info');
            this.log('Will detect changes via events instead (this is normal)', 'info');
        }
    }

    async cacheStylesheet(header, tabId = null) {
        if (!tabId) {
            tabId = chrome.devtools.inspectedWindow.tabId;
        }
        
        try {
            // Only cache author stylesheets (user/page stylesheets, not browser defaults)
            if (header.origin === 'regular' || header.origin === 'author') {
                const content = await chrome.debugger.sendCommand({ tabId }, "CSS.getStyleSheetText", {
                    styleSheetId: header.styleSheetId
                });
                
                this.stylesheetCache.set(header.styleSheetId, {
                    content: content.text,
                    sourceURL: header.sourceURL || 'embedded',
                    origin: header.origin,
                    header: header
                });
                
                const sourceDisplay = header.sourceURL || 'embedded styles';
                this.log(`Cached: ${sourceDisplay} (${content.text.length} chars)`, 'info');
                
                return true;
            } else {
                this.log(`Skipped ${header.origin} stylesheet: ${header.sourceURL || 'embedded'}`, 'info');
                return false;
            }
        } catch (error) {
            this.log(`Failed to cache stylesheet ${header.styleSheetId}: ${error.message}`, 'error');
            return false;
        }
    }

    handleDebuggerEvent(method, params) {
        switch (method) {
            case 'CSS.styleSheetChanged':
                this.handleStyleSheetChanged(params);
                break;
            case 'CSS.styleSheetAdded':
                this.handleStyleSheetAdded(params);
                break;
            case 'CSS.styleSheetRemoved':
                this.handleStyleSheetRemoved(params);
                break;
            case 'DOM.documentUpdated':
                this.handleDocumentUpdated();
                break;
        }
    }

    async handleStyleSheetChanged(params) {
        if (!this.isTracking) return;
        
        try {
            const { styleSheetId } = params;
            this.log(`Stylesheet changed: ${styleSheetId}`, 'info');
            
            const tabId = chrome.devtools.inspectedWindow.tabId;
            
            // Get the new content
            const result = await chrome.debugger.sendCommand({ tabId }, "CSS.getStyleSheetText", {
                styleSheetId
            });
            
            const newContent = result.text;
            const cached = this.stylesheetCache.get(styleSheetId);
            
            if (cached) {
                // Compare with cached version
                const changes = this.detectCSSChanges(cached.content, newContent, cached);
                
                if (changes.length > 0) {
                    this.log(`Detected ${changes.length} CSS rule changes`, 'success');
                    changes.forEach(change => this.addDetectedChange(change));
                }
                
                // Update cache
                cached.content = newContent;
            } else {
                // New stylesheet, get its info and cache it
                try {
                    const allSheets = await chrome.debugger.sendCommand({ tabId }, "CSS.getAllStyleSheets");
                    const header = allSheets.headers?.find(h => h.styleSheetId === styleSheetId);
                    
                    if (header) {
                        this.stylesheetCache.set(styleSheetId, {
                            content: newContent,
                            sourceURL: header.sourceURL || 'embedded',
                            origin: header.origin,
                            header: header
                        });
                        this.log(`Cached new stylesheet: ${header.sourceURL || 'embedded'}`, 'info');
                    }
                } catch (error) {
                    this.log(`Failed to get stylesheet info: ${error.message}`, 'error');
                }
            }
            
        } catch (error) {
            this.log(`Error handling stylesheet change: ${error.message}`, 'error');
        }
    }

    async handleStyleSheetAdded(params) {
        if (!this.isTracking) return;
        
        try {
            const { header } = params;
            const sourceDisplay = header.sourceURL || 'embedded styles';
            
            // Cache the new stylesheet
            const cached = await this.cacheStylesheet(header);
            
            if (cached) {
                this.log(`New stylesheet detected: ${sourceDisplay}`, 'success');
            } else {
                this.log(`New stylesheet ignored: ${sourceDisplay} (${header.origin})`, 'info');
            }
            
        } catch (error) {
            this.log(`Error handling new stylesheet: ${error.message}`, 'error');
        }
    }

    handleStyleSheetRemoved(params) {
        const { styleSheetId } = params;
        this.stylesheetCache.delete(styleSheetId);
        this.log(`Stylesheet removed: ${styleSheetId}`, 'info');
    }

    async handleDocumentUpdated() {
        // Document changed, re-enable CSS to catch new stylesheets
        try {
            const tabId = chrome.devtools.inspectedWindow.tabId;
            await chrome.debugger.sendCommand({ tabId }, "CSS.enable");
            this.log('CSS re-enabled after document update', 'info');
        } catch (error) {
            this.log(`Failed to re-enable CSS: ${error.message}`, 'error');
        }
    }

    detectCSSChanges(oldContent, newContent, stylesheetInfo) {
        const changes = [];
        
        if (oldContent === newContent) {
            return changes;
        }
        
        try {
            const oldRules = this.parseCSS(oldContent);
            const newRules = this.parseCSS(newContent);
            
            // Find modified rules
            for (const newRule of newRules) {
                const oldRule = oldRules.find(r => 
                    this.normalizeSelector(r.selector) === this.normalizeSelector(newRule.selector)
                );
                
                if (oldRule) {
                    const propertyChanges = this.compareRuleProperties(oldRule.properties, newRule.properties);
                    
                    if (Object.keys(propertyChanges).length > 0) {
                        changes.push({
                            selector: newRule.selector,
                            changes: propertyChanges,
                            source: 'devtools-edit',
                            sourceFile: stylesheetInfo.sourceURL,
                            type: 'rule-modified',
                            styleSheetId: stylesheetInfo.header?.styleSheetId
                        });
                    }
                } else if (Object.keys(newRule.properties).length > 0) {
                    // New rule
                    changes.push({
                        selector: newRule.selector,
                        changes: newRule.properties,
                        source: 'devtools-edit',
                        sourceFile: stylesheetInfo.sourceURL,
                        type: 'rule-added',
                        styleSheetId: stylesheetInfo.header?.styleSheetId
                    });
                }
            }
            
        } catch (error) {
            this.log(`Error parsing CSS changes: ${error.message}`, 'error');
        }
        
        return changes;
    }

    parseCSS(cssText) {
        const rules = [];
        
        try {
            // Remove comments and normalize whitespace
            const cleanCSS = cssText
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\s+/g, ' ')
                .trim();
            
            // More robust CSS parsing
            const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
            let match;
            
            while ((match = ruleRegex.exec(cleanCSS)) !== null) {
                const selector = match[1].trim();
                const declarations = match[2].trim();
                
                // Skip empty selectors, at-rules, or keyframes
                if (!selector || 
                    selector.includes('@') || 
                    selector.includes('%') ||
                    !declarations) {
                    continue;
                }
                
                const properties = {};
                
                // Parse declarations
                const declSplit = declarations.split(';');
                for (const decl of declSplit) {
                    const colonIndex = decl.indexOf(':');
                    if (colonIndex > 0) {
                        const property = decl.substring(0, colonIndex).trim();
                        const value = decl.substring(colonIndex + 1).trim();
                        
                        if (property && value && !property.startsWith('-webkit-') && !property.startsWith('-moz-')) {
                            properties[property] = value;
                        }
                    }
                }
                
                if (Object.keys(properties).length > 0) {
                    rules.push({ selector, properties });
                }
            }
        } catch (error) {
            this.log(`CSS parsing error: ${error.message}`, 'error');
        }
        
        return rules;
    }

    normalizeSelector(selector) {
        return selector.replace(/\s+/g, ' ').trim().toLowerCase();
    }

    compareRuleProperties(oldProps, newProps) {
        const changes = {};
        
        // Check for modified and new properties
        for (const [prop, newValue] of Object.entries(newProps)) {
            const oldValue = oldProps[prop];
            if (oldValue !== newValue) {
                changes[prop] = oldValue ? { from: oldValue, to: newValue } : newValue;
            }
        }
        
        // Check for deleted properties
        for (const [prop, oldValue] of Object.entries(oldProps)) {
            if (!(prop in newProps)) {
                changes[prop] = { from: oldValue, to: '(deleted)' };
            }
        }
        
        return changes;
    }

    addDetectedChange(changeData) {
        const change = {
            id: Date.now() + Math.random(),
            ...changeData,
            timestamp: new Date(),
            applied: false
        };

        this.detectedChanges.unshift(change);
        this.renderChanges();
        this.log(`New change: ${change.selector} in ${change.sourceFile}`, 'success');
    }

    clearAllChanges() {
        this.detectedChanges = [];
        this.selectedChanges.clear();
        this.renderChanges();
        this.log('Cleared all changes', 'info');
    }

    renderChanges() {
        this.changesCountEl.textContent = this.detectedChanges.length;

        if (this.detectedChanges.length === 0) {
            this.changesListEl.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🎨</div>
                    <div>No CSS changes detected yet.</div>
                    <div style="font-size: 11px; margin-top: 5px;">Start tracking and make changes in DevTools Styles panel.</div>
                </div>`;
            this.bulkActionsEl.style.display = 'none';
            return;
        }

        const changesHtml = this.detectedChanges.map(change => this.renderChangeItem(change)).join('');
        this.changesListEl.innerHTML = changesHtml;
        this.bulkActionsEl.style.display = 'flex';
        this.updateBulkActionsUI();
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
                        ${change.timestamp.toLocaleTimeString()} • ${change.sourceFile || 'unknown'}
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

        document.querySelectorAll('.apply-single-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const changeId = e.target.closest('.change-item').dataset.changeId;
                this.applySingleChange(changeId);
            });
        });

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
        
        // Also log to console for debugging
        console.log(`[CSS Sync] ${message}`, { type, timestamp });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CSSDevToolsPanel();
});