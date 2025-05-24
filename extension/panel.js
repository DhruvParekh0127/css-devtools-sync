// IMPROVED Panel Script - Better error handling and state management
class CSSDevToolsPanel {
    constructor() {
        console.log('[PANEL] Initializing CSSDevToolsPanel...');
        
        this.isTracking = false;
        this.detectedChanges = [];
        this.selectedChanges = new Set();
        this.currentDomain = '';
        this.serverConnected = false;
        
        // UI Elements
        this.initializeUIElements();
        
        // State management
        this.state = {
            isInitialized: false,
            serverStatus: 'checking',
            trackingStatus: 'stopped',
            lastError: null
        };
        
        this.init();
    }

    initializeUIElements() {
        // Get all UI elements with error checking
        const elements = [
            'sync-status', 'css-path', 'detection-mode', 'current-domain',
            'save-config-btn', 'start-btn', 'stop-btn', 'clear-btn',
            'changes-list', 'changes-count', 'bulk-actions', 'selected-count',
            'select-all-btn', 'apply-selected-btn', 'remove-selected-btn', 'log'
        ];

        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                const camelCaseId = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase()) + 'El';
                this[camelCaseId] = element;
            } else {
                console.warn(`[PANEL] Element not found: ${id}`);
            }
        });
    }

    async init() {
        console.log('[PANEL] Starting initialization...');
        
        try {
            await this.loadSettings();
            await this.getCurrentDomain();
            this.setupEventListeners();
            this.setupMessageListeners();
            
            // Initial server status check
            await this.checkServerStatus();
            
            // Set up periodic status checks
            this.setupPeriodicChecks();
            
            this.state.isInitialized = true;
            this.log('Panel initialized successfully', 'success');
            
        } catch (error) {
            console.error('[PANEL] Initialization error:', error);
            this.log(`Initialization failed: ${error.message}`, 'error');
            this.state.lastError = error.message;
        }
    }

    async loadSettings() {
        console.log('[PANEL] Loading settings...');
        
        return new Promise((resolve) => {
            chrome.storage.local.get(['cssPath', 'detectionMode'], (result) => {
                console.log('[PANEL] Settings loaded:', result);
                
                if (this.csspathEl && result.cssPath) {
                    this.csspathEl.value = result.cssPath;
                }
                if (this.detectionmodeEl && result.detectionMode) {
                    this.detectionmodeEl.value = result.detectionMode;
                }
                
                resolve(result);
            });
        });
    }

    async getCurrentDomain() {
        console.log('[PANEL] Getting current domain...');
        
        return new Promise((resolve) => {
            chrome.devtools.inspectedWindow.eval('window.location.hostname', (result, isException) => {
                if (!isException) {
                    this.currentDomain = result || 'unknown';
                    if (this.currentdomainEl) {
                        this.currentdomainEl.textContent = this.currentDomain;
                    }
                    console.log('[PANEL] Domain set to:', this.currentDomain);
                } else {
                    console.error('[PANEL] Failed to get domain:', result);
                    this.currentDomain = 'unknown';
                }
                resolve(this.currentDomain);
            });
        });
    }

    setupEventListeners() {
        console.log('[PANEL] Setting up event listeners...');
        
        // Configuration
        if (this.saveConfigBtnEl) {
            this.saveConfigBtnEl.addEventListener('click', () => this.saveConfiguration());
        }
        
        // Tracking controls
        if (this.startBtnEl) {
            this.startBtnEl.addEventListener('click', () => this.startTracking());
        }
        if (this.stopBtnEl) {
            this.stopBtnEl.addEventListener('click', () => this.stopTracking());
        }
        if (this.clearBtnEl) {
            this.clearBtnEl.addEventListener('click', () => this.clearAllChanges());
        }
        
        // Bulk actions
        if (this.selectAllBtnEl) {
            this.selectAllBtnEl.addEventListener('click', () => this.selectAllChanges());
        }
        if (this.applySelectedBtnEl) {
            this.applySelectedBtnEl.addEventListener('click', () => this.applySelectedChanges());
        }
        if (this.removeSelectedBtnEl) {
            this.removeSelectedBtnEl.addEventListener('click', () => this.removeSelectedChanges());
        }
    }

    setupMessageListeners() {
        console.log('[PANEL] Setting up message listeners...');
        
        // Listen for messages from DevTools script
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            
            const { type, data } = event.data;
            console.log('[PANEL] Message received:', { type, data });
            
            switch (type) {
                case 'CSS_CHANGE_DETECTED':
                    this.handleCSSChangeDetected(data);
                    break;
                case 'STYLESHEET_CHANGED':
                    this.handleStylesheetChanged(data);
                    break;
                case 'TRACKING_ERROR':
                    this.handleTrackingError(data);
                    break;
                case 'ELEMENT_SELECTED':
                    this.handleElementSelected(data);
                    break;
            }
        });
    }

    setupPeriodicChecks() {
        // Check server status every 5 seconds
        setInterval(() => {
            if (this.state.isInitialized) {
                this.checkServerStatus();
            }
        }, 5000);
        
        // Ping background script every 10 seconds
        setInterval(() => {
            this.pingBackgroundScript();
        }, 10000);
    }

    async checkServerStatus() {
        console.log('[PANEL] Checking server status...');
        
        try {
            const response = await this.sendMessage('GET_SERVER_STATUS', { domain: this.currentDomain });
            
            if (response && response.connected) {
                this.serverConnected = true;
                this.state.serverStatus = 'connected';
                this.updateStatus('active', 'Connected');
                
                if (response.activePath) {
                    this.log(`Active project: ${response.activePath}`, 'info');
                }
            } else {
                this.serverConnected = false;
                this.state.serverStatus = 'disconnected';
                this.updateStatus('inactive', response?.error || 'Server not running');
            }
        } catch (error) {
            console.error('[PANEL] Server status check failed:', error);
            this.serverConnected = false;
            this.state.serverStatus = 'error';
            
            if (error.message.includes('Extension context invalidated')) {
                this.updateStatus('inactive', 'Extension restarting...');
            } else {
                this.updateStatus('inactive', 'Connection failed');
            }
        }
    }

    async pingBackgroundScript() {
        try {
            const response = await this.sendMessage('PING');
            if (!response || !response.alive) {
                console.warn('[PANEL] Background script not responding');
                this.log('Background script not responding', 'error');
            }
        } catch (error) {
            console.error('[PANEL] Background script ping failed:', error);
        }
    }

    async sendMessage(type, data = {}) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Message timeout'));
            }, 10000);
            
            chrome.runtime.sendMessage({ type, data }, (response) => {
                clearTimeout(timeout);
                
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    updateStatus(type, text) {
        if (this.syncStatusEl) {
            this.syncStatusEl.className = `status ${type}`;
            const span = this.syncStatusEl.querySelector('span');
            if (span) span.textContent = text;
        }
    }

    async saveConfiguration() {
        if (!this.cssPathEl || !this.detectionModeEl) {
            this.log('Configuration elements not found', 'error');
            return;
        }
        
        const cssPath = this.cssPathEl.value.trim();
        const detectionMode = this.detectionModeEl.value;

        if (!cssPath) {
            alert('Please enter a CSS project path');
            return;
        }

        this.saveConfigBtnEl.disabled = true;
        this.saveConfigBtnEl.textContent = 'Saving...';

        try {
            const response = await this.sendMessage('SET_PROJECT_CONFIGURATION', {
                projectPath: cssPath,
                detectionMode,
                currentDomain: this.currentDomain
            });

            if (response && response.success) {
                this.log('Configuration saved successfully', 'success');
                this.saveConfigBtnEl.textContent = 'Saved!';
                
                // Save to local storage as well
                await chrome.storage.local.set({ cssPath, detectionMode });
                
                setTimeout(() => {
                    this.saveConfigBtnEl.textContent = 'Save Config';
                    this.saveConfigBtnEl.disabled = false;
                }, 2000);
            } else {
                throw new Error(response?.error || 'Failed to save configuration');
            }
        } catch (error) {
            console.error('[PANEL] Save configuration error:', error);
            this.log(`Configuration error: ${error.message}`, 'error');
            this.saveConfigBtnEl.textContent = 'Save Config';
            this.saveConfigBtnEl.disabled = false;
        }
    }

    startTracking() {
        console.log('[PANEL] Starting tracking...');
        
        if (!this.serverConnected) {
            this.log('Cannot start tracking: server not connected', 'error');
            return;
        }
        
        this.isTracking = true;
        this.state.trackingStatus = 'active';
        this.updateTrackingUI();
        this.log('CSS change tracking started', 'success');
        
        // Send message to DevTools script to start tracking
        window.postMessage({ type: 'START_TRACKING' }, '*');
    }

    stopTracking() {
        console.log('[PANEL] Stopping tracking...');
        
        this.isTracking = false;
        this.state.trackingStatus = 'stopped';
        this.updateTrackingUI();
        this.log('CSS change tracking stopped', 'info');
        
        // Send message to DevTools script to stop tracking
        window.postMessage({ type: 'STOP_TRACKING' }, '*');
    }

    updateTrackingUI() {
        if (this.startBtnEl && this.stopBtnEl) {
            if (this.isTracking) {
                this.startBtnEl.style.display = 'none';
                this.stopBtnEl.style.display = 'inline-block';
            } else {
                this.startBtnEl.style.display = 'inline-block';
                this.stopBtnEl.style.display = 'none';
            }
        }
    }

    handleCSSChangeDetected(changeData) {
        console.log('[PANEL] CSS change detected:', changeData);
        
        const change = {
            id: Date.now() + Math.random(),
            ...changeData,
            timestamp: new Date(),
            applied: false
        };

        this.detectedChanges.unshift(change);
        this.renderChanges();
        this.log(`CSS change detected: ${change.selector}`, 'success');
    }

    handleStylesheetChanged(data) {
        console.log('[PANEL] Stylesheet changed:', data);
        this.log(`Stylesheet ${data.styleSheetId} was modified`, 'info');
    }

    handleTrackingError(data) {
        console.error('[PANEL] Tracking error:', data);
        this.log(`Tracking error: ${data.error}`, 'error');
        this.isTracking = false;
        this.updateTrackingUI();
    }

    handleElementSelected(data) {
        console.log('[PANEL] Element selected:', data);
        this.log(`Selected: ${data.selector}`, 'info');
    }

    clearAllChanges() {
        this.detectedChanges = [];
        this.selectedChanges.clear();
        this.renderChanges();
        this.log('All changes cleared', 'info');
    }

    renderChanges() {
        if (!this.changesListEl || !this.changesCountEl) return;
        
        this.changesCountEl.textContent = this.detectedChanges.length;

        if (this.detectedChanges.length === 0) {
            this.changesListEl.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🎨</div>
                    <div>No CSS changes detected yet.</div>
                    <div style="font-size: 11px; margin-top: 5px;">Start tracking and make changes in DevTools Elements panel.</div>
                </div>`;
            if (this.bulkActionsEl) this.bulkActionsEl.style.display = 'none';
            return;
        }

        const changesHtml = this.detectedChanges.map(change => this.renderChangeItem(change)).join('');
        this.changesListEl.innerHTML = changesHtml;
        
        if (this.bulkActionsEl) this.bulkActionsEl.style.display = 'flex';
        this.updateBulkActionsUI();
        this.setupChangeItemListeners();
    }

    renderChangeItem(change) {
        const isSelected = this.selectedChanges.has(change.id);
        
        let changesText = '';
        if (change.inlineStyles && Object.keys(change.inlineStyles).length > 0) {
            changesText = Object.entries(change.inlineStyles)
                .map(([prop, value]) => `
                    <div class="change-property">
                        <span class="property-name">${prop}:</span>
                        <span class="property-value new">${value}</span>
                    </div>
                `).join('');
        } else if (change.changes) {
            changesText = Object.entries(change.changes)
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
        }

        return `
            <div class="change-item ${isSelected ? 'selected' : ''}" data-change-id="${change.id}">
                <input type="checkbox" class="checkbox change-checkbox" ${isSelected ? 'checked' : ''}>
                <div class="change-details">
                    <div class="change-selector">${change.selector || 'Unknown selector'}</div>
                    ${changesText}
                    <div style="font-size: 10px; color: #999; margin-top: 4px;">
                        ${change.timestamp.toLocaleTimeString()} • ${change.type || 'style_change'}
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
        if (this.selectedCountEl) {
            this.selectedCountEl.textContent = this.selectedChanges.size;
        }
        if (this.applySelectedBtnEl) {
            this.applySelectedBtnEl.disabled = this.selectedChanges.size === 0;
        }
        if (this.removeSelectedBtnEl) {
            this.removeSelectedBtnEl.disabled = this.selectedChanges.size === 0;
        }
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
                const response = await this.sendMessage('APPLY_CSS_CHANGE', change);

                if (response && response.success) {
                    change.applied = true;
                    this.log(`Applied: ${change.selector} to ${response.file}`, 'success');
                } else {
                    this.log(`Failed to apply: ${change.selector} - ${response?.error}`, 'error');
                }
            } catch (error) {
                console.error('[PANEL] Error applying change:', error);
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
        if (!this.logEl) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
        
        this.logEl.appendChild(entry);
        this.logEl.scrollTop = this.logEl.scrollHeight;
        
        // Keep only last 50 entries
        while (this.logEl.children.length > 50) {
            this.logEl.removeChild(this.logEl.firstChild);
        }
        
        console.log(`[PANEL LOG] ${message}`);
    }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[PANEL] DOM loaded, initializing panel...');
        new CSSDevToolsPanel();
    });
} else {
    console.log('[PANEL] DOM already loaded, initializing panel...');
    new CSSDevToolsPanel();
}