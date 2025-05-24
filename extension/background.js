// FIXED Background Script - Improved error handling and context management
console.log('[BACKGROUND] Starting background script...');

class CSSChangeProcessor {
    constructor() {
        console.log('[BACKGROUND] Initializing CSSChangeProcessor');
        this.serverUrl = 'http://localhost:3001';
        this.changeQueue = [];
        this.isProcessing = false;
        this.currentConfiguration = {
            projectPath: null,
            domainMappings: {},
            activePath: null
        };
        
        // Enhanced keep-alive mechanism
        this.setupKeepAlive();
        this.setupMessageListeners();
        this.loadSavedConfiguration();
        
        console.log('[BACKGROUND] CSSChangeProcessor initialized');
    }

    setupKeepAlive() {
        console.log('[BACKGROUND] Setting up enhanced keep-alive');
        
        // Multiple keep-alive strategies
        const keepAliveInterval = setInterval(() => {
            console.log('[BACKGROUND] Keep-alive ping');
            // Touch chrome APIs to prevent suspension
            chrome.storage.local.get(null).catch(() => {});
        }, 15000);

        // Listen for important events
        chrome.runtime.onStartup.addListener(() => {
            console.log('[BACKGROUND] Runtime startup');
            this.loadSavedConfiguration();
        });
        
        chrome.runtime.onInstalled.addListener((details) => {
            console.log('[BACKGROUND] Extension installed/updated:', details.reason);
            if (details.reason === 'update') {
                this.loadSavedConfiguration();
            }
        });

        // Handle tab updates to maintain connection
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                console.log('[BACKGROUND] Tab updated:', tabId, tab.url);
            }
        });

        // Store interval reference for cleanup
        this.keepAliveInterval = keepAliveInterval;
    }

    async loadSavedConfiguration() {
        console.log('[BACKGROUND] Loading saved configuration');
        try {
            const result = await chrome.storage.local.get(['cssPath', 'detectionMode', 'domainMappings']);
            if (result.cssPath) {
                this.currentConfiguration.projectPath = result.cssPath;
                this.currentConfiguration.domainMappings = result.domainMappings || {};
                console.log('[BACKGROUND] Configuration loaded:', this.currentConfiguration);
            }
        } catch (error) {
            console.error('[BACKGROUND] Failed to load configuration:', error);
        }
    }

    setupMessageListeners() {
        console.log('[BACKGROUND] Setting up message listeners');
        
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('[BACKGROUND] Message received:', {
                type: message.type,
                sender: sender?.tab?.id || 'unknown'
            });

            // Handle messages asynchronously
            this.handleMessage(message, sender, sendResponse);
            
            // Return true for async response
            return true;
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'CSS_CHANGE_DETECTED':
                    await this.processCSSChange(message.data, sender.tab);
                    sendResponse({ success: true });
                    break;

                case 'GET_SERVER_STATUS':
                    const status = await this.checkServerStatus(message.domain);
                    sendResponse(status);
                    break;

                case 'SET_PROJECT_CONFIGURATION':
                    const configResult = await this.setProjectConfiguration(message.data);
                    sendResponse(configResult);
                    break;

                case 'APPLY_CSS_CHANGE':
                    const applyResult = await this.applySingleChange(message.data);
                    sendResponse(applyResult);
                    break;

                case 'PING':
                    sendResponse({ alive: true, timestamp: Date.now() });
                    break;

                default:
                    console.log('[BACKGROUND] Unknown message type:', message.type);
                    sendResponse({ error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('[BACKGROUND] Error handling message:', error);
            sendResponse({ 
                success: false, 
                error: error.message,
                timestamp: Date.now()
            });
        }
    }

    async checkServerStatus(currentDomain = null) {
        console.log('[BACKGROUND] Checking server status for domain:', currentDomain);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        try {
            const response = await fetch(`${this.serverUrl}/status`, {
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Determine active path for current domain
            let activePath = this.currentConfiguration.projectPath;
            if (currentDomain && this.currentConfiguration.domainMappings[currentDomain]) {
                activePath = this.currentConfiguration.domainMappings[currentDomain];
            }
            
            return { 
                connected: true, 
                ...data,
                activePath,
                currentDomain
            };
            
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('[BACKGROUND] Server status error:', error);
            
            let errorMessage = 'Server connection failed';
            if (error.name === 'AbortError') {
                errorMessage = 'Server timeout - check if server is running';
            } else if (error.message.includes('fetch')) {
                errorMessage = 'Server not running on localhost:3001';
            }
            
            return { connected: false, error: errorMessage };
        }
    }

    async setProjectConfiguration(config) {
        console.log('[BACKGROUND] Setting project configuration:', config);
        
        try {
            // Update local configuration
            this.currentConfiguration = {
                projectPath: config.projectPath,
                domainMappings: config.domainMappings || {},
                activePath: config.activePath
            };
            
            // Save to storage
            await chrome.storage.local.set({
                cssPath: config.projectPath,
                detectionMode: config.detectionMode,
                domainMappings: config.domainMappings || {}
            });
            
            // Send to server with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${this.serverUrl}/set-project-configuration`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('[BACKGROUND] Configuration saved:', result);
            
            return result;
            
        } catch (error) {
            console.error('[BACKGROUND] Configuration error:', error);
            
            let errorMessage = error.message;
            if (error.name === 'AbortError') {
                errorMessage = 'Configuration timeout - server not responding';
            }
            
            return { success: false, error: errorMessage };
        }
    }

    async applySingleChange(changeData) {
        console.log('[BACKGROUND] Applying single change:', changeData);
        
        try {
            // Ensure domain information is available
            if (!changeData.domain) {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]) {
                    const url = new URL(tabs[0].url);
                    changeData.domain = url.hostname + (url.port ? ':' + url.port : '');
                }
            }

            // Enhanced change data with better selector matching
            const enhancedData = this.enhanceChangeData(changeData);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // Longer timeout for file operations
            
            const response = await fetch(`${this.serverUrl}/apply-css-change`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(enhancedData),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            console.log('[BACKGROUND] Apply change result:', result);
            
            return result;
            
        } catch (error) {
            console.error('[BACKGROUND] Apply change error:', error);
            
            let errorMessage = error.message;
            if (error.name === 'AbortError') {
                errorMessage = 'Apply timeout - server not responding';
            } else if (error.message.includes('fetch')) {
                errorMessage = 'Server connection failed - is server running?';
            }
            
            return { success: false, error: errorMessage };
        }
    }

    async processCSSChange(changeData, tab) {
        console.log('[BACKGROUND] Processing CSS change:', changeData);
        
        // Add domain information
        if (tab && tab.url) {
            try {
                const url = new URL(tab.url);
                changeData.domain = url.hostname + (url.port ? ':' + url.port : '');
                changeData.fullUrl = tab.url;
            } catch (urlError) {
                console.log('[BACKGROUND] Could not parse tab URL:', urlError.message);
            }
        }
        
        // Add to queue for processing
        this.changeQueue.push(changeData);
        
        // Process queue if not already processing
        if (!this.isProcessing) {
            await this.processQueue();
        }
    }

    async processQueue() {
        if (this.changeQueue.length === 0 || this.isProcessing) {
            return;
        }
        
        this.isProcessing = true;
        console.log('[BACKGROUND] Processing queue with', this.changeQueue.length, 'changes');
        
        while (this.changeQueue.length > 0) {
            const change = this.changeQueue.shift();
            await this.sendChangeToServer(change);
            
            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.isProcessing = false;
        console.log('[BACKGROUND] Queue processing completed');
    }

    async sendChangeToServer(changeData) {
        try {
            const enhancedData = this.enhanceChangeData(changeData);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${this.serverUrl}/apply-css-change`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(enhancedData),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            
            const result = await response.json();
            
            if (!result.success) {
                console.error('[BACKGROUND] Server failed to apply change:', result.error);
                this.notifyDevToolsPanel('CSS_SYNC_ERROR', {
                    error: result.error,
                    changeData: enhancedData
                });
            } else {
                console.log('[BACKGROUND] CSS change applied successfully');
                this.notifyDevToolsPanel('CSS_CHANGE_APPLIED', {
                    ...result,
                    changeData: enhancedData
                });
            }
            
            return result;
        } catch (error) {
            console.error('[BACKGROUND] Failed to send change to server:', error);
            this.notifyDevToolsPanel('CSS_SYNC_ERROR', {
                error: error.message,
                changeData
            });
            return { success: false, error: error.message };
        }
    }

    async notifyDevToolsPanel(type, data) {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                await chrome.tabs.sendMessage(tabs[0].id, { type, data });
            }
        } catch (error) {
            // DevTools panel might not be open, that's okay
            console.log('[BACKGROUND] Could not notify DevTools panel:', error.message);
        }
    }

    enhanceChangeData(changeData) {
        const selectorVariations = this.generateSelectorVariations(changeData);
        
        return {
            ...changeData,
            selectorVariations,
            matchingStrategy: 'intelligent',
            targetPath: this.getTargetPathForDomain(changeData.domain),
            timestamp: Date.now()
        };
    }

    getTargetPathForDomain(domain) {
        if (domain && this.currentConfiguration.domainMappings[domain]) {
            return this.currentConfiguration.domainMappings[domain];
        }
        return this.currentConfiguration.projectPath;
    }

    generateSelectorVariations(changeData) {
        const variations = [];
        const { selector, classList } = changeData;
        
        // Original selector
        variations.push({ selector, priority: 1, type: 'original' });
        
        // Individual class selectors
        if (classList && Array.isArray(classList)) {
            classList.forEach((className, index) => {
                variations.push({
                    selector: `.${className}`,
                    priority: 10 - index,
                    type: 'individual_class'
                });
            });
            
            // Combined class selector
            if (classList.length > 1) {
                variations.push({
                    selector: '.' + classList.join('.'),
                    priority: 5,
                    type: 'combined_classes'
                });
            }
        }
        
        // Element + class combinations
        const elementMatch = selector.match(/^(\w+)/);
        if (elementMatch && classList && classList.length > 0) {
            const element = elementMatch[1];
            classList.forEach((className, index) => {
                variations.push({
                    selector: `${element}.${className}`,
                    priority: 8 - index,
                    type: 'element_class'
                });
            });
        }
        
        // Sort by priority (higher first)
        return variations.sort((a, b) => b.priority - a.priority);
    }
}

// Initialize the background processor
console.log('[BACKGROUND] Initializing CSSChangeProcessor...');
const processor = new CSSChangeProcessor();

// Export for debugging
self.cssProcessor = processor;