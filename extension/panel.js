// DEBUG VERSION - Unified DevTools Panel with Extensive Logging
class CSSDevToolsPanel {
    constructor() {
        console.log('[PANEL DEBUG] Constructor started');
        this.isTracking = false;
        this.detectedChanges = [];
        this.selectedChanges = new Set();
        this.currentDomain = '';
        this.stylesheetCache = new Map();
        this.debuggerAttached = false;
        this.eventCount = 0;
        
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
        
        console.log('[PANEL DEBUG] Constructor completed, starting init');
        this.init();
    }

    async init() {
        console.log('[PANEL DEBUG] Init started');
        this.loadSettings();
        this.getCurrentDomain();
        this.setupEventListeners();
        this.checkServerStatus();
        
        // Check status periodically
        setInterval(() => this.checkServerStatus(), 5000);
        
        this.log('Panel initialized and ready');
        console.log('[PANEL DEBUG] Init completed');
    }

    loadSettings() {
        console.log('[PANEL DEBUG] Loading settings from Chrome storage');
        chrome.storage.local.get(['cssPath', 'detectionMode'], (result) => {
            console.log('[PANEL DEBUG] Settings loaded:', result);
            if (result.cssPath) {
                this.cssPathEl.value = result.cssPath;
            }
            if (result.detectionMode) {
                this.detectionModeEl.value = result.detectionMode;
            }
        });
    }

    getCurrentDomain() {
        console.log('[PANEL DEBUG] Getting current domain');
        chrome.devtools.inspectedWindow.eval('window.location.hostname', (result) => {
            console.log('[PANEL DEBUG] Domain result:', result);
            this.currentDomain = result || 'unknown';
            this.currentDomainEl.textContent = this.currentDomain;
        });
    }

    setupEventListeners() {
        console.log('[PANEL DEBUG] Setting up event listeners');
        
        this.saveConfigBtnEl.addEventListener('click', () => {
            console.log('[PANEL DEBUG] Save config button clicked');
            this.saveConfiguration();
        });
        
        this.startBtnEl.addEventListener('click', () => {
            console.log('[PANEL DEBUG] Start tracking button clicked');
            this.startTracking();
        });
        
        this.stopBtnEl.addEventListener('click', () => {
            console.log('[PANEL DEBUG] Stop tracking button clicked');
            this.stopTracking();
        });
        
        this.clearBtnEl.addEventListener('click', () => {
            console.log('[PANEL DEBUG] Clear changes button clicked');
            this.clearAllChanges();
        });
        
        this.selectAllBtnEl.addEventListener('click', () => this.selectAllChanges());
        this.applySelectedBtnEl.addEventListener('click', () => this.applySelectedChanges());
        this.removeSelectedBtnEl.addEventListener('click', () => this.removeSelectedChanges());

        // Listen for CSS change events from debugger
        chrome.debugger.onEvent.addListener((source, method, params) => {
            this.eventCount++;
            console.log(`[PANEL DEBUG] Event #${this.eventCount} received:`, {
                source,
                method,
                params,
                isOurTab: source.tabId === chrome.devtools.inspectedWindow.tabId
            });
            
            if (source.tabId === chrome.devtools.inspectedWindow.tabId) {
                console.log(`[PANEL DEBUG] Processing event for our tab: ${method}`);
                this.handleDebuggerEvent(method, params);
            } else {
                console.log(`[PANEL DEBUG] Ignoring event for different tab: ${source.tabId} vs ${chrome.devtools.inspectedWindow.tabId}`);
            }
        });

        // Clean up on panel close
        window.addEventListener('beforeunload', () => {
            console.log('[PANEL DEBUG] Panel unloading, cleaning up');
            this.cleanup();
        });
        
        console.log('[PANEL DEBUG] Event listeners setup completed');
    }

    async saveConfiguration() {
        const cssPath = this.cssPathEl.value.trim();
        const detectionMode = this.detectionModeEl.value;

        console.log('[PANEL DEBUG] Saving configuration:', { cssPath, detectionMode });

        if (!cssPath) {
            alert('Please enter a CSS project path');
            return;
        }

        this.saveConfigBtnEl.disabled = true;
        this.saveConfigBtnEl.textContent = 'Saving...';

        try {
            await chrome.storage.local.set({ cssPath, detectionMode });
            console.log('[PANEL DEBUG] Saved to Chrome storage');
            
            const response = await chrome.runtime.sendMessage({
                type: 'SET_PROJECT_CONFIGURATION',
                data: { 
                    projectPath: cssPath,
                    detectionMode,
                    currentDomain: this.currentDomain
                }
            });

            console.log('[PANEL DEBUG] Server response:', response);

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
            console.error('[PANEL DEBUG] Save configuration error:', error);
            this.log(`Configuration error: ${error.message}`, 'error');
            this.saveConfigBtnEl.textContent = 'Save Config';
            this.saveConfigBtnEl.disabled = false;
        }
    }

    async checkServerStatus() {
        console.log('[PANEL DEBUG] Checking server status');
        try {
            // First, ping the background script to make sure it's alive
            const pingResult = await this.pingBackgroundScript();
            if (!pingResult.alive) {
                console.log('[PANEL DEBUG] Background script not responding, updating status');
                this.updateStatus('inactive', 'Extension restarting...');
                return;
            }

            const response = await chrome.runtime.sendMessage({ 
                type: 'GET_SERVER_STATUS',
                domain: this.currentDomain 
            });
            
            console.log('[PANEL DEBUG] Server status response:', response);
            
            if (response && response.connected) {
                this.updateStatus('active', 'Connected');
            } else {
                this.updateStatus('inactive', response?.error || 'Server not running');
            }
        } catch (error) {
            console.error('[PANEL DEBUG] Server status error:', error);
            
            if (error.message.includes('Extension context invalidated')) {
                this.updateStatus('inactive', 'Extension restarting...');
                console.log('[PANEL DEBUG] Extension context invalidated - will retry');
            } else {
                this.updateStatus('inactive', 'Connection failed');
            }
        }
    }

    async pingBackgroundScript() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'PING' });
            console.log('[PANEL DEBUG] Background script ping response:', response);
            return response || { alive: false };
        } catch (error) {
            console.log('[PANEL DEBUG] Background script ping failed:', error.message);
            return { alive: false, error: error.message };
        }
    }

    updateStatus(type, text) {
        console.log('[PANEL DEBUG] Updating status:', { type, text });
        this.statusEl.className = `status ${type}`;
        this.statusEl.querySelector('span').textContent = text;
    }

    async startTracking() {
        console.log('[PANEL DEBUG] Start tracking called, current state:', {
            isTracking: this.isTracking,
            debuggerAttached: this.debuggerAttached
        });
        
        if (this.isTracking) {
            console.log('[PANEL DEBUG] Already tracking, returning');
            return;
        }

        try {
            console.log('[PANEL DEBUG] Starting tracking sequence...');
            
            await this.attachDebugger();
            console.log('[PANEL DEBUG] Debugger attached');
            
            await this.enableCSSTracking();
            console.log('[PANEL DEBUG] CSS tracking enabled');
            
            await this.captureInitialStylesheets();
            console.log('[PANEL DEBUG] Initial stylesheets captured');
            
            this.isTracking = true;
            this.updateTrackingUI();
            this.log('Started tracking CSS changes', 'success');
            console.log('[PANEL DEBUG] Tracking started successfully');
        } catch (error) {
            console.error('[PANEL DEBUG] Failed to start tracking:', error);
            this.log(`Failed to start tracking: ${error.message}`, 'error');
        }
    }

    async stopTracking() {
        console.log('[PANEL DEBUG] Stop tracking called');
        if (!this.isTracking) {
            console.log('[PANEL DEBUG] Not tracking, returning');
            return;
        }
        
        try {
            await this.cleanup();
            this.isTracking = false;
            this.updateTrackingUI();
            this.log('Stopped tracking CSS changes', 'info');
            console.log('[PANEL DEBUG] Tracking stopped successfully');
        } catch (error) {
            console.error('[PANEL DEBUG] Error stopping tracking:', error);
            this.log(`Error stopping tracking: ${error.message}`, 'error');
        }
    }

    async cleanup() {
        console.log('[PANEL DEBUG] Cleanup called, debuggerAttached:', this.debuggerAttached);
        if (this.debuggerAttached) {
            try {
                await chrome.debugger.detach({ tabId: chrome.devtools.inspectedWindow.tabId });
                this.debuggerAttached = false;
                this.log('Debugger detached', 'info');
                console.log('[PANEL DEBUG] Debugger detached successfully');
            } catch (error) {
                console.log('[PANEL DEBUG] Debugger detach error (expected if already detached):', error.message);
            }
        }
    }

    updateTrackingUI() {
        console.log('[PANEL DEBUG] Updating tracking UI, isTracking:', this.isTracking);
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
        console.log('[PANEL DEBUG] Attaching debugger to tab:', tabId);
        
        // Always try to detach first to avoid conflicts
        try {
            await chrome.debugger.detach({ tabId });
            console.log('[PANEL DEBUG] Detached existing debugger');
        } catch (e) {
            console.log('[PANEL DEBUG] No existing debugger to detach (expected)');
        }

        try {
            await chrome.debugger.attach({ tabId }, "1.3");
            this.debuggerAttached = true;
            this.log('Debugger attached successfully', 'info');
            console.log('[PANEL DEBUG] Debugger attached successfully');
        } catch (error) {
            console.error('[PANEL DEBUG] Debugger attach failed:', error);
            throw new Error(`Failed to attach debugger: ${error.message}`);
        }
    }

    async enableCSSTracking() {
        const tabId = chrome.devtools.inspectedWindow.tabId;
        console.log('[PANEL DEBUG] Enabling CSS tracking for tab:', tabId);
        
        try {
            console.log('[PANEL DEBUG] Enabling Runtime domain...');
            await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
            console.log('[PANEL DEBUG] Runtime enabled');
            
            console.log('[PANEL DEBUG] Enabling DOM domain...');
            await chrome.debugger.sendCommand({ tabId }, "DOM.enable");
            console.log('[PANEL DEBUG] DOM enabled');
            
            console.log('[PANEL DEBUG] Enabling CSS domain...');
            await chrome.debugger.sendCommand({ tabId }, "CSS.enable");
            console.log('[PANEL DEBUG] CSS enabled');
            
            this.log('CSS tracking enabled', 'info');
            console.log('[PANEL DEBUG] All domains enabled successfully');
        } catch (error) {
            console.error('[PANEL DEBUG] Failed to enable domains:', error);
            throw new Error(`Failed to enable CSS tracking: ${error.message}`);
        }
    }

    async captureInitialStylesheets() {
        const tabId = chrome.devtools.inspectedWindow.tabId;
        console.log('[PANEL DEBUG] Capturing initial stylesheets for tab:', tabId);
        
        try {
            this.log('Capturing initial stylesheets...', 'info');
            
            console.log('[PANEL DEBUG] Sending CSS.getAllStyleSheets command...');
            const result = await chrome.debugger.sendCommand({ tabId }, "CSS.getAllStyleSheets");
            console.log('[PANEL DEBUG] CSS.getAllStyleSheets result:', result);
            
            if (!result || !result.headers) {
                console.log('[PANEL DEBUG] No stylesheets returned from API');
                this.log('No stylesheets returned from API', 'info');
                return;
            }

            console.log('[PANEL DEBUG] Found stylesheets:', result.headers.length);
            this.log(`Found ${result.headers.length} initial stylesheets`, 'success');
            
            // Cache each stylesheet's content
            for (let i = 0; i < result.headers.length; i++) {
                const header = result.headers[i];
                console.log(`[PANEL DEBUG] Processing stylesheet ${i + 1}/${result.headers.length}:`, header);
                await this.cacheStylesheet(header, tabId);
            }
            
        } catch (error) {
            console.log('[PANEL DEBUG] Initial stylesheet capture error:', error);
            this.log(`Initial stylesheet capture not available: ${JSON.stringify(error)}`, 'info');
            this.log('Will detect changes via events instead (this is normal)', 'info');
        }
    }

    async cacheStylesheet(header, tabId = null) {
        if (!tabId) {
            tabId = chrome.devtools.inspectedWindow.tabId;
        }
        
        console.log('[PANEL DEBUG] Caching stylesheet:', header);
        
        try {
            // Only cache author stylesheets (user/page stylesheets, not browser defaults)
            if (header.origin === 'regular' || header.origin === 'author') {
                console.log('[PANEL DEBUG] Getting stylesheet text for:', header.styleSheetId);
                
                const content = await chrome.debugger.sendCommand({ tabId }, "CSS.getStyleSheetText", {
                    styleSheetId: header.styleSheetId
                });
                
                console.log('[PANEL DEBUG] Got stylesheet content, length:', content.text.length);
                
                this.stylesheetCache.set(header.styleSheetId, {
                    content: content.text,
                    sourceURL: header.sourceURL || 'embedded',
                    origin: header.origin,
                    header: header
                });
                
                const sourceDisplay = header.sourceURL || 'embedded styles';
                this.log(`Cached: ${sourceDisplay} (${content.text.length} chars)`, 'info');
                console.log('[PANEL DEBUG] Successfully cached stylesheet:', sourceDisplay);
                
                return true;
            } else {
                console.log('[PANEL DEBUG] Skipping non-author stylesheet:', header.origin, header.sourceURL);
                this.log(`Skipped ${header.origin} stylesheet: ${header.sourceURL || 'embedded'}`, 'info');
                return false;
            }
        } catch (error) {
            console.error('[PANEL DEBUG] Failed to cache stylesheet:', error);
            this.log(`Failed to cache stylesheet ${header.styleSheetId}: ${error.message}`, 'error');
            return false;
        }
    }

    handleDebuggerEvent(method, params) {
        console.log(`[PANEL DEBUG] Handling debugger event: ${method}`, params);
        
        switch (method) {
            case 'CSS.styleSheetChanged':
                console.log('[PANEL DEBUG] CSS.styleSheetChanged event detected!');
                this.handleStyleSheetChanged(params);
                break;
            case 'CSS.styleSheetAdded':
                console.log('[PANEL DEBUG] CSS.styleSheetAdded event detected!');
                this.handleStyleSheetAdded(params);
                break;
            case 'CSS.styleSheetRemoved':
                console.log('[PANEL DEBUG] CSS.styleSheetRemoved event detected!');
                this.handleStyleSheetRemoved(params);
                break;
            case 'DOM.documentUpdated':
                console.log('[PANEL DEBUG] DOM.documentUpdated event detected!');
                this.handleDocumentUpdated();
                break;
            default:
                console.log(`[PANEL DEBUG] Unhandled event: ${method}`);
        }
    }

    async handleStyleSheetChanged(params) {
        console.log('[PANEL DEBUG] *** STYLESHEET CHANGED EVENT ***', params);
        
        if (!this.isTracking) {
            console.log('[PANEL DEBUG] Not tracking, ignoring stylesheet change');
            return;
        }
        
        try {
            const { styleSheetId } = params;
            console.log('[PANEL DEBUG] Stylesheet ID that changed:', styleSheetId);
            this.log(`Stylesheet changed: ${styleSheetId}`, 'info');
            
            const tabId = chrome.devtools.inspectedWindow.tabId;
            console.log('[PANEL DEBUG] Getting new stylesheet content...');
            
            // Get the new content
            const result = await chrome.debugger.sendCommand({ tabId }, "CSS.getStyleSheetText", {
                styleSheetId
            });
            
            console.log('[PANEL DEBUG] New stylesheet content length:', result.text.length);
            console.log('[PANEL DEBUG] First 200 chars of new content:', result.text.substring(0, 200));
            
            const newContent = result.text;
            const cached = this.stylesheetCache.get(styleSheetId);
            
            console.log('[PANEL DEBUG] Cached stylesheet exists:', !!cached);
            
            if (cached) {
                console.log('[PANEL DEBUG] Comparing with cached version...');
                console.log('[PANEL DEBUG] Cached content length:', cached.content.length);
                console.log('[PANEL DEBUG] Content changed:', cached.content !== newContent);
                
                // Compare with cached version
                const changes = this.detectCSSChanges(cached.content, newContent, cached);
                
                console.log('[PANEL DEBUG] Detected changes count:', changes.length);
                console.log('[PANEL DEBUG] Changes details:', changes);
                
                if (changes.length > 0) {
                    this.log(`Detected ${changes.length} CSS rule changes`, 'success');
                    changes.forEach((change, index) => {
                        console.log(`[PANEL DEBUG] Adding change ${index + 1}:`, change);
                        this.addDetectedChange(change);
                    });
                } else {
                    console.log('[PANEL DEBUG] No meaningful changes detected');
                    this.log('No meaningful changes detected in stylesheet', 'info');
                }
                
                // Update cache
                console.log('[PANEL DEBUG] Updating cache with new content');
                cached.content = newContent;
            } else {
                console.log('[PANEL DEBUG] No cached version found, getting stylesheet info...');
                // New stylesheet, get its info and cache it
                try {
                    const allSheets = await chrome.debugger.sendCommand({ tabId }, "CSS.getAllStyleSheets");
                    const header = allSheets.headers?.find(h => h.styleSheetId === styleSheetId);
                    
                    console.log('[PANEL DEBUG] Found header for new stylesheet:', header);
                    
                    if (header) {
                        this.stylesheetCache.set(styleSheetId, {
                            content: newContent,
                            sourceURL: header.sourceURL || 'embedded',
                            origin: header.origin,
                            header: header
                        });
                        this.log(`Cached new stylesheet: ${header.sourceURL || 'embedded'}`, 'info');
                        console.log('[PANEL DEBUG] Cached new stylesheet successfully');
                    }
                } catch (error) {
                    console.error('[PANEL DEBUG] Failed to get stylesheet info:', error);
                    this.log(`Failed to get stylesheet info: ${error.message}`, 'error');
                }
            }
            
        } catch (error) {
            console.error('[PANEL DEBUG] Error handling stylesheet change:', error);
            this.log(`Error handling stylesheet change: ${error.message}`, 'error');
        }
    }

    async handleStyleSheetAdded(params) {
        console.log('[PANEL DEBUG] *** STYLESHEET ADDED EVENT ***', params);
        
        if (!this.isTracking) {
            console.log('[PANEL DEBUG] Not tracking, ignoring stylesheet addition');
            return;
        }
        
        try {
            const { header } = params;
            const sourceDisplay = header.sourceURL || 'embedded styles';
            console.log('[PANEL DEBUG] New stylesheet header:', header);
            
            // Cache the new stylesheet
            const cached = await this.cacheStylesheet(header);
            
            if (cached) {
                this.log(`New stylesheet detected: ${sourceDisplay}`, 'success');
                console.log('[PANEL DEBUG] New stylesheet cached successfully');
            } else {
                this.log(`New stylesheet ignored: ${sourceDisplay} (${header.origin})`, 'info');
                console.log('[PANEL DEBUG] New stylesheet ignored due to origin');
            }
            
        } catch (error) {
            console.error('[PANEL DEBUG] Error handling new stylesheet:', error);
            this.log(`Error handling new stylesheet: ${error.message}`, 'error');
        }
    }

    handleStyleSheetRemoved(params) {
        console.log('[PANEL DEBUG] *** STYLESHEET REMOVED EVENT ***', params);
        const { styleSheetId } = params;
        this.stylesheetCache.delete(styleSheetId);
        this.log(`Stylesheet removed: ${styleSheetId}`, 'info');
        console.log('[PANEL DEBUG] Stylesheet removed from cache');
    }

    async handleDocumentUpdated() {
        console.log('[PANEL DEBUG] *** DOCUMENT UPDATED EVENT ***');
        // Document changed, re-enable CSS to catch new stylesheets
        try {
            const tabId = chrome.devtools.inspectedWindow.tabId;
            await chrome.debugger.sendCommand({ tabId }, "CSS.enable");
            this.log('CSS re-enabled after document update', 'info');
            console.log('[PANEL DEBUG] CSS re-enabled after document update');
        } catch (error) {
            console.error('[PANEL DEBUG] Failed to re-enable CSS:', error);
            this.log(`Failed to re-enable CSS: ${error.message}`, 'error');
        }
    }

    detectCSSChanges(oldContent, newContent, stylesheetInfo) {
        console.log('[PANEL DEBUG] *** DETECTING CSS CHANGES ***');
        console.log('[PANEL DEBUG] Old content length:', oldContent.length);
        console.log('[PANEL DEBUG] New content length:', newContent.length);
        console.log('[PANEL DEBUG] Stylesheet info:', stylesheetInfo);
        
        const changes = [];
        
        if (oldContent === newContent) {
            console.log('[PANEL DEBUG] Content identical, no changes');
            return changes;
        }
        
        console.log('[PANEL DEBUG] Content differs, parsing...');
        
        try {
            const oldRules = this.parseCSS(oldContent);
            const newRules = this.parseCSS(newContent);
            
            console.log('[PANEL DEBUG] Old rules count:', oldRules.length);
            console.log('[PANEL DEBUG] New rules count:', newRules.length);
            console.log('[PANEL DEBUG] Old rules:', oldRules);
            console.log('[PANEL DEBUG] New rules:', newRules);
            
            // Find modified rules
            for (let i = 0; i < newRules.length; i++) {
                const newRule = newRules[i];
                console.log(`[PANEL DEBUG] Processing new rule ${i + 1}:`, newRule);
                
                const oldRule = oldRules.find(r => 
                    this.normalizeSelector(r.selector) === this.normalizeSelector(newRule.selector)
                );
                
                if (oldRule) {
                    console.log('[PANEL DEBUG] Found matching old rule:', oldRule);
                    const propertyChanges = this.compareRuleProperties(oldRule.properties, newRule.properties);
                    console.log('[PANEL DEBUG] Property changes:', propertyChanges);
                    
                    if (Object.keys(propertyChanges).length > 0) {
                        const change = {
                            selector: newRule.selector,
                            changes: propertyChanges,
                            source: 'devtools-edit',
                            sourceFile: stylesheetInfo.sourceURL,
                            type: 'rule-modified',
                            styleSheetId: stylesheetInfo.header?.styleSheetId
                        };
                        
                        console.log('[PANEL DEBUG] Adding modified rule change:', change);
                        changes.push(change);
                    }
                } else if (Object.keys(newRule.properties).length > 0) {
                    console.log('[PANEL DEBUG] New rule detected (no matching old rule)');
                    // New rule
                    const change = {
                        selector: newRule.selector,
                        changes: newRule.properties,
                        source: 'devtools-edit',
                        sourceFile: stylesheetInfo.sourceURL,
                        type: 'rule-added',
                        styleSheetId: stylesheetInfo.header?.styleSheetId
                    };
                    
                    console.log('[PANEL DEBUG] Adding new rule change:', change);
                    changes.push(change);
                }
            }
            
            console.log('[PANEL DEBUG] Final changes array:', changes);
            
        } catch (error) {
            console.error('[PANEL DEBUG] Error parsing CSS changes:', error);
            this.log(`Error parsing CSS changes: ${error.message}`, 'error');
        }
        
        return changes;
    }

    parseCSS(cssText) {
        console.log('[PANEL DEBUG] *** PARSING CSS ***');
        console.log('[PANEL DEBUG] CSS text length:', cssText.length);
        console.log('[PANEL DEBUG] First 300 chars:', cssText.substring(0, 300));
        
        const rules = [];
        
        try {
            // Remove comments and normalize whitespace
            const cleanCSS = cssText
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\s+/g, ' ')
                .trim();
            
            console.log('[PANEL DEBUG] Cleaned CSS length:', cleanCSS.length);
            console.log('[PANEL DEBUG] First 300 chars of cleaned CSS:', cleanCSS.substring(0, 300));
            
            // More robust CSS parsing
            const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
            let match;
            let ruleCount = 0;
            
            while ((match = ruleRegex.exec(cleanCSS)) !== null) {
                ruleCount++;
                const selector = match[1].trim();
                const declarations = match[2].trim();
                
                console.log(`[PANEL DEBUG] Rule ${ruleCount} - Selector: "${selector}", Declarations: "${declarations}"`);
                
                // Skip empty selectors, at-rules, or keyframes
                if (!selector || 
                    selector.includes('@') || 
                    selector.includes('%') ||
                    !declarations) {
                    console.log(`[PANEL DEBUG] Skipping rule ${ruleCount} (empty or at-rule)`);
                    continue;
                }
                
                const properties = {};
                
                // Parse declarations
                const declSplit = declarations.split(';');
                console.log(`[PANEL DEBUG] Rule ${ruleCount} declarations split:`, declSplit);
                
                for (const decl of declSplit) {
                    const colonIndex = decl.indexOf(':');
                    if (colonIndex > 0) {
                        const property = decl.substring(0, colonIndex).trim();
                        const value = decl.substring(colonIndex + 1).trim();
                        
                        if (property && value && !property.startsWith('-webkit-') && !property.startsWith('-moz-')) {
                            properties[property] = value;
                            console.log(`[PANEL DEBUG] Rule ${ruleCount} property: ${property} = ${value}`);
                        }
                    }
                }
                
                if (Object.keys(properties).length > 0) {
                    const rule = { selector, properties };
                    rules.push(rule);
                    console.log(`[PANEL DEBUG] Added rule ${ruleCount}:`, rule);
                } else {
                    console.log(`[PANEL DEBUG] Rule ${ruleCount} has no valid properties`);
                }
            }
            
            console.log('[PANEL DEBUG] Total rules parsed:', rules.length);
            
        } catch (error) {
            console.error('[PANEL DEBUG] CSS parsing error:', error);
            this.log(`CSS parsing error: ${error.message}`, 'error');
        }
        
        return rules;
    }

    normalizeSelector(selector) {
        const normalized = selector.replace(/\s+/g, ' ').trim().toLowerCase();
        console.log('[PANEL DEBUG] Normalized selector:', selector, '->', normalized);
        return normalized;
    }

    compareRuleProperties(oldProps, newProps) {
        console.log('[PANEL DEBUG] *** COMPARING RULE PROPERTIES ***');
        console.log('[PANEL DEBUG] Old properties:', oldProps);
        console.log('[PANEL DEBUG] New properties:', newProps);
        
        const changes = {};
        
        // Check for modified and new properties
        for (const [prop, newValue] of Object.entries(newProps)) {
            const oldValue = oldProps[prop];
            if (oldValue !== newValue) {
                changes[prop] = oldValue ? { from: oldValue, to: newValue } : newValue;
                console.log(`[PANEL DEBUG] Property changed: ${prop} from "${oldValue}" to "${newValue}"`);
            }
        }
        
        // Check for deleted properties
        for (const [prop, oldValue] of Object.entries(oldProps)) {
            if (!(prop in newProps)) {
                changes[prop] = { from: oldValue, to: '(deleted)' };
                console.log(`[PANEL DEBUG] Property deleted: ${prop} was "${oldValue}"`);
            }
        }
        
        console.log('[PANEL DEBUG] Final property changes:', changes);
        return changes;
    }

    addDetectedChange(changeData) {
        console.log('[PANEL DEBUG] *** ADDING DETECTED CHANGE ***', changeData);
        
        const change = {
            id: Date.now() + Math.random(),
            ...changeData,
            timestamp: new Date(),
            applied: false
        };

        console.log('[PANEL DEBUG] Created change object:', change);
        this.detectedChanges.unshift(change);
        console.log('[PANEL DEBUG] Added to detectedChanges array, total count:', this.detectedChanges.length);
        
        this.renderChanges();
        this.log(`New change: ${change.selector} in ${change.sourceFile}`, 'success');
        console.log('[PANEL DEBUG] Change added and UI updated');
    }

    clearAllChanges() {
        console.log('[PANEL DEBUG] Clearing all changes');
        this.detectedChanges = [];
        this.selectedChanges.clear();
        this.renderChanges();
        this.log('Cleared all changes', 'info');
    }

    renderChanges() {
        console.log('[PANEL DEBUG] *** RENDERING CHANGES ***');
        console.log('[PANEL DEBUG] Changes count:', this.detectedChanges.length);
        console.log('[PANEL DEBUG] Changes array:', this.detectedChanges);
        
        this.changesCountEl.textContent = this.detectedChanges.length;

        if (this.detectedChanges.length === 0) {
            console.log('[PANEL DEBUG] No changes, showing empty state');
            this.changesListEl.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🎨</div>
                    <div>No CSS changes detected yet.</div>
                    <div style="font-size: 11px; margin-top: 5px;">Start tracking and make changes in DevTools Styles panel.</div>
                </div>`;
            this.bulkActionsEl.style.display = 'none';
            return;
        }

        console.log('[PANEL DEBUG] Rendering changes list');
        const changesHtml = this.detectedChanges.map((change, index) => {
            console.log(`[PANEL DEBUG] Rendering change ${index + 1}:`, change);
            return this.renderChangeItem(change);
        }).join('');
        
        console.log('[PANEL DEBUG] Generated HTML length:', changesHtml.length);
        this.changesListEl.innerHTML = changesHtml;
        this.bulkActionsEl.style.display = 'flex';
        this.updateBulkActionsUI();
        this.setupChangeItemListeners();
        console.log('[PANEL DEBUG] Changes UI rendered');
    }

    renderChangeItem(change) {
        console.log('[PANEL DEBUG] Rendering individual change item:', change);
        
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

        const html = `
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
        
        console.log('[PANEL DEBUG] Generated HTML for change item:', html.substring(0, 200) + '...');
        return html;
    }

    setupChangeItemListeners() {
        console.log('[PANEL DEBUG] Setting up change item listeners');
        
        document.querySelectorAll('.change-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const changeId = e.target.closest('.change-item').dataset.changeId;
                console.log('[PANEL DEBUG] Checkbox changed for change ID:', changeId);
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
                console.log('[PANEL DEBUG] Apply single button clicked for change ID:', changeId);
                this.applySingleChange(changeId);
            });
        });

        document.querySelectorAll('.remove-single-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const changeId = e.target.closest('.change-item').dataset.changeId;
                console.log('[PANEL DEBUG] Remove single button clicked for change ID:', changeId);
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
        console.log('[PANEL DEBUG] Select all changes clicked');
        this.detectedChanges.forEach(change => {
            this.selectedChanges.add(change.id);
        });
        this.renderChanges();
    }

    async applySingleChange(changeId) {
        console.log('[PANEL DEBUG] Apply single change:', changeId);
        const change = this.detectedChanges.find(c => c.id == changeId);
        if (!change) {
            console.log('[PANEL DEBUG] Change not found:', changeId);
            return;
        }
        await this.applyChangesToFiles([change]);
    }

    async applySelectedChanges() {
        console.log('[PANEL DEBUG] Apply selected changes');
        const selectedChanges = this.detectedChanges.filter(change => 
            this.selectedChanges.has(change.id)
        );
        if (selectedChanges.length === 0) {
            console.log('[PANEL DEBUG] No changes selected');
            return;
        }
        await this.applyChangesToFiles(selectedChanges);
    }

    async applyChangesToFiles(changes) {
        console.log('[PANEL DEBUG] Applying changes to files:', changes);
        this.log(`Applying ${changes.length} changes to files...`, 'info');

        for (const change of changes) {
            try {
                console.log('[PANEL DEBUG] Sending change to background script:', change);
                const response = await chrome.runtime.sendMessage({
                    type: 'APPLY_CSS_CHANGE',
                    data: change
                });

                console.log('[PANEL DEBUG] Response from background script:', response);

                if (response && response.success) {
                    change.applied = true;
                    this.log(`Applied: ${change.selector} to ${response.file}`, 'success');
                } else {
                    this.log(`Failed to apply: ${change.selector} - ${response?.error}`, 'error');
                }
            } catch (error) {
                console.error('[PANEL DEBUG] Error applying change:', error);
                this.log(`Error applying ${change.selector}: ${error.message}`, 'error');
            }
        }

        this.renderChanges();
    }

    removeSingleChange(changeId) {
        console.log('[PANEL DEBUG] Remove single change:', changeId);
        this.detectedChanges = this.detectedChanges.filter(c => c.id != changeId);
        this.selectedChanges.delete(changeId);
        this.renderChanges();
    }

    removeSelectedChanges() {
        console.log('[PANEL DEBUG] Remove selected changes');
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
    console.log('[PANEL DEBUG] DOM loaded, initializing panel');
    new CSSDevToolsPanel();
});