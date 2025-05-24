// FIXED VERSION - Background script with context invalidation handling
console.log('[BACKGROUND DEBUG] Background script starting...');

class CSSChangeProcessor {
    constructor() {
        console.log('[BACKGROUND DEBUG] Constructor started');
        this.serverUrl = 'http://localhost:3001';
        this.changeQueue = [];
        this.isProcessing = false;
        this.currentConfiguration = {
            projectPath: null,
            domainMappings: {},
            activePath: null
        };
        
        // Keep the service worker alive
        this.keepAlive();
        this.setupMessageListeners();
        console.log('[BACKGROUND DEBUG] Constructor completed');
    }

    // Keep service worker alive to prevent context invalidation
    keepAlive() {
        console.log('[BACKGROUND DEBUG] Setting up keep-alive mechanism');
        
        // Ping every 20 seconds to keep service worker active
        setInterval(() => {
            console.log('[BACKGROUND DEBUG] Keep-alive ping');
        }, 20000);
        
        // Also respond to chrome.runtime.onStartup
        chrome.runtime.onStartup.addListener(() => {
            console.log('[BACKGROUND DEBUG] Runtime startup event');
        });
        
        chrome.runtime.onInstalled.addListener(() => {
            console.log('[BACKGROUND DEBUG] Extension installed/updated');
        });
    }

    setupMessageListeners() {
        console.log('[BACKGROUND DEBUG] Setting up message listeners');
        
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('[BACKGROUND DEBUG] Message received:', {
                type: message.type,
                sender: sender?.tab?.id || 'unknown',
                data: message.data ? 'present' : 'missing'
            });

            try {
                if (message.type === 'CSS_CHANGE_DETECTED') {
                    console.log('[BACKGROUND DEBUG] Processing CSS_CHANGE_DETECTED');
                    this.processCSSChange(message.data, sender.tab);
                    sendResponse({ success: true });
                    
                } else if (message.type === 'GET_SERVER_STATUS') {
                    console.log('[BACKGROUND DEBUG] Processing GET_SERVER_STATUS');
                    this.checkServerStatus(message.domain)
                        .then(result => {
                            console.log('[BACKGROUND DEBUG] Server status result:', result);
                            sendResponse(result);
                        })
                        .catch(error => {
                            console.error('[BACKGROUND DEBUG] Server status error:', error);
                            sendResponse({ connected: false, error: error.message });
                        });
                    return true; // Keep message channel open for async response
                    
                } else if (message.type === 'SET_PROJECT_CONFIGURATION') {
                    console.log('[BACKGROUND DEBUG] Processing SET_PROJECT_CONFIGURATION');
                    this.setProjectConfiguration(message.data)
                        .then(result => {
                            console.log('[BACKGROUND DEBUG] Configuration result:', result);
                            sendResponse(result);
                        })
                        .catch(error => {
                            console.error('[BACKGROUND DEBUG] Configuration error:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                    return true;
                    
                } else if (message.type === 'APPLY_CSS_CHANGE') {
                    console.log('[BACKGROUND DEBUG] Processing APPLY_CSS_CHANGE');
                    this.applySingleChange(message.data)
                        .then(result => {
                            console.log('[BACKGROUND DEBUG] Apply change result:', result);
                            sendResponse(result);
                        })
                        .catch(error => {
                            console.error('[BACKGROUND DEBUG] Apply change error:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                    return true;
                    
                } else if (message.type === 'PING') {
                    // Simple ping to check if background script is alive
                    console.log('[BACKGROUND DEBUG] Ping received');
                    sendResponse({ alive: true, timestamp: Date.now() });
                    
                } else {
                    console.log('[BACKGROUND DEBUG] Unknown message type:', message.type);
                    sendResponse({ error: 'Unknown message type' });
                }
            } catch (error) {
                console.error('[BACKGROUND DEBUG] Error handling message:', error);
                sendResponse({ success: false, error: error.message });
            }
        });
        
        console.log('[BACKGROUND DEBUG] Message listeners setup completed');
    }

    async applySingleChange(changeData) {
        console.log('[BACKGROUND DEBUG] *** APPLYING SINGLE CHANGE ***');
        console.log('[BACKGROUND DEBUG] Change data received:', changeData);
        
        try {
            // Add domain information if available
            if (!changeData.domain) {
                console.log('[BACKGROUND DEBUG] No domain in change data, trying to get from active tab');
                try {
                    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tabs[0]) {
                        const url = new URL(tabs[0].url);
                        changeData.domain = url.hostname + (url.port ? ':' + url.port : '');
                        console.log('[BACKGROUND DEBUG] Got domain from active tab:', changeData.domain);
                    }
                } catch (tabError) {
                    console.log('[BACKGROUND DEBUG] Could not get active tab:', tabError.message);
                }
            }

            // Enhance change data with intelligent selector matching and domain info
            const enhancedData = this.enhanceChangeData(changeData);
            console.log('[BACKGROUND DEBUG] Enhanced change data:', enhancedData);
            
            console.log('[BACKGROUND DEBUG] Sending to server:', this.serverUrl + '/apply-css-change');
            
            // Add timeout to fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(`${this.serverUrl}/apply-css-change`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(enhancedData),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            console.log('[BACKGROUND DEBUG] Server response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('[BACKGROUND DEBUG] Server response data:', result);
            
            if (!result.success) {
                console.error('[BACKGROUND DEBUG] Server failed to apply change:', result.error);
            } else {
                console.log('[BACKGROUND DEBUG] CSS change applied successfully to:', result.file);
            }
            
            return result;
        } catch (error) {
            console.error('[BACKGROUND DEBUG] Failed to send change to server:', error);
            
            if (error.name === 'AbortError') {
                return { success: false, error: 'Request timeout - server not responding' };
            } else if (error.message.includes('fetch')) {
                return { success: false, error: 'Server connection failed - is server running?' };
            }
            
            return { success: false, error: error.message };
        }
    }

    async checkServerStatus(currentDomain = null) {
        console.log('[BACKGROUND DEBUG] *** CHECKING SERVER STATUS ***');
        console.log('[BACKGROUND DEBUG] Current domain:', currentDomain);
        console.log('[BACKGROUND DEBUG] Server URL:', this.serverUrl);
        
        try {
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            
            const response = await fetch(`${this.serverUrl}/status`, {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log('[BACKGROUND DEBUG] Server status response:', response.status);
            
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('[BACKGROUND DEBUG] Server status data:', data);
            
            // Determine active path for current domain
            let activePath = this.currentConfiguration.projectPath;
            if (currentDomain && this.currentConfiguration.domainMappings[currentDomain]) {
                activePath = this.currentConfiguration.domainMappings[currentDomain];
                console.log('[BACKGROUND DEBUG] Using domain-specific path:', activePath);
            }
            
            const result = { 
                connected: true, 
                ...data,
                activePath,
                currentDomain
            };
            
            console.log('[BACKGROUND DEBUG] Final server status result:', result);
            return result;
            
        } catch (error) {
            console.error('[BACKGROUND DEBUG] Server status error:', error);
            
            if (error.name === 'AbortError') {
                return { connected: false, error: 'Server timeout - check if server is running' };
            } else if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
                return { connected: false, error: 'Server not running on localhost:3001' };
            }
            
            return { connected: false, error: error.message };
        }
    }

    async setProjectConfiguration(config) {
        console.log('[BACKGROUND DEBUG] *** SETTING PROJECT CONFIGURATION ***');
        console.log('[BACKGROUND DEBUG] Configuration:', config);
        
        try {
            // Update local configuration
            this.currentConfiguration = {
                projectPath: config.projectPath,
                domainMappings: config.domainMappings || {},
                activePath: config.activePath
            };
            
            console.log('[BACKGROUND DEBUG] Updated local configuration:', this.currentConfiguration);

            // Send configuration to server
            console.log('[BACKGROUND DEBUG] Sending config to server...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${this.serverUrl}/set-project-configuration`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log('[BACKGROUND DEBUG] Server config response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('[BACKGROUND DEBUG] Server config response data:', result);
            
            if (result.success) {
                console.log('[BACKGROUND DEBUG] Configuration updated successfully:', config);
            }
            
            return result;
        } catch (error) {
            console.error('[BACKGROUND DEBUG] Configuration error:', error);
            
            if (error.name === 'AbortError') {
                return { success: false, error: 'Configuration timeout - server not responding' };
            }
            
            return { success: false, error: error.message };
        }
    }

    async processCSSChange(changeData, tab) {
        console.log('[BACKGROUND DEBUG] *** PROCESSING CSS CHANGE ***');
        console.log('[BACKGROUND DEBUG] Change data:', changeData);
        console.log('[BACKGROUND DEBUG] Tab info:', tab);
        
        // Add domain information to change data
        if (tab && tab.url) {
            try {
                const url = new URL(tab.url);
                changeData.domain = url.hostname + (url.port ? ':' + url.port : '');
                changeData.fullUrl = tab.url;
                console.log('[BACKGROUND DEBUG] Added domain info:', changeData.domain);
            } catch (urlError) {
                console.log('[BACKGROUND DEBUG] Could not parse tab URL:', urlError.message);
            }
        }
        
        console.log('[BACKGROUND DEBUG] Processing CSS change for domain:', changeData.domain);
        
        // Add to queue
        this.changeQueue.push(changeData);
        console.log('[BACKGROUND DEBUG] Added to queue, queue length:', this.changeQueue.length);
        
        // Process queue if not already processing
        if (!this.isProcessing) {
            console.log('[BACKGROUND DEBUG] Starting queue processing...');
            await this.processQueue();
        } else {
            console.log('[BACKGROUND DEBUG] Queue already processing, change will be handled next');
        }
    }

    async processQueue() {
        console.log('[BACKGROUND DEBUG] *** PROCESSING QUEUE ***');
        console.log('[BACKGROUND DEBUG] Queue length:', this.changeQueue.length);
        
        if (this.changeQueue.length === 0) {
            console.log('[BACKGROUND DEBUG] Queue is empty, nothing to process');
            return;
        }
        
        this.isProcessing = true;
        console.log('[BACKGROUND DEBUG] Set processing flag to true');
        
        while (this.changeQueue.length > 0) {
            const change = this.changeQueue.shift();
            console.log('[BACKGROUND DEBUG] Processing change from queue:', change);
            await this.sendChangeToServer(change);
            
            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.isProcessing = false;
        console.log('[BACKGROUND DEBUG] Queue processing completed, set processing flag to false');
    }

    async sendChangeToServer(changeData) {
        console.log('[BACKGROUND DEBUG] *** SENDING CHANGE TO SERVER ***');
        console.log('[BACKGROUND DEBUG] Original change data:', changeData);
        
        try {
            // Enhance change data with intelligent selector matching and domain info
            const enhancedData = this.enhanceChangeData(changeData);
            console.log('[BACKGROUND DEBUG] Enhanced change data:', enhancedData);
            
            console.log('[BACKGROUND DEBUG] Making fetch request to:', `${this.serverUrl}/apply-css-change`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${this.serverUrl}/apply-css-change`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(enhancedData),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            console.log('[BACKGROUND DEBUG] Response status:', response.status);

            const result = await response.json();
            console.log('[BACKGROUND DEBUG] Response data:', result);
            
            if (!result.success) {
                console.error('[BACKGROUND DEBUG] Server failed to apply change:', result.error);
                // Notify DevTools panel of error
                this.notifyDevToolsPanel('CSS_SYNC_ERROR', {
                    error: result.error,
                    changeData: enhancedData
                });
            } else {
                console.log('[BACKGROUND DEBUG] CSS change applied successfully to:', result.file);
                // Notify DevTools panel of success
                this.notifyDevToolsPanel('CSS_CHANGE_APPLIED', {
                    ...result,
                    changeData: enhancedData
                });
            }
            
            return result;
        } catch (error) {
            console.error('[BACKGROUND DEBUG] Failed to send change to server:', error);
            this.notifyDevToolsPanel('CSS_SYNC_ERROR', {
                error: error.message,
                changeData
            });
            return { success: false, error: error.message };
        }
    }

    async notifyDevToolsPanel(type, data) {
        console.log('[BACKGROUND DEBUG] *** NOTIFYING DEVTOOLS PANEL ***');
        console.log('[BACKGROUND DEBUG] Notification type:', type);
        console.log('[BACKGROUND DEBUG] Notification data:', data);
        
        // Try to send message to DevTools panel
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log('[BACKGROUND DEBUG] Active tabs found:', tabs.length);
            
            if (tabs[0]) {
                console.log('[BACKGROUND DEBUG] Sending message to tab:', tabs[0].id);
                await chrome.tabs.sendMessage(tabs[0].id, { type, data });
                console.log('[BACKGROUND DEBUG] Message sent to tab successfully');
            } else {
                console.log('[BACKGROUND DEBUG] No active tab found');
            }
        } catch (error) {
            // DevTools panel might not be open, that's okay
            console.log('[BACKGROUND DEBUG] Could not notify DevTools panel (this is normal):', error.message);
        }
    }

    enhanceChangeData(changeData) {
        console.log('[BACKGROUND DEBUG] *** ENHANCING CHANGE DATA ***');
        console.log('[BACKGROUND DEBUG] Original change data:', changeData);
        
        // Create multiple selector variations for smart matching
        const selectorVariations = this.generateSelectorVariations(changeData);
        console.log('[BACKGROUND DEBUG] Generated selector variations:', selectorVariations);
        
        const enhanced = {
            ...changeData,
            selectorVariations,
            matchingStrategy: 'intelligent',
            // Include domain-specific information
            targetPath: this.getTargetPathForDomain(changeData.domain)
        };
        
        console.log('[BACKGROUND DEBUG] Enhanced change data:', enhanced);
        return enhanced;
    }

    getTargetPathForDomain(domain) {
        console.log('[BACKGROUND DEBUG] Getting target path for domain:', domain);
        console.log('[BACKGROUND DEBUG] Current configuration:', this.currentConfiguration);
        
        if (domain && this.currentConfiguration.domainMappings[domain]) {
            const path = this.currentConfiguration.domainMappings[domain];
            console.log('[BACKGROUND DEBUG] Found domain-specific path:', path);
            return path;
        }
        
        const defaultPath = this.currentConfiguration.projectPath;
        console.log('[BACKGROUND DEBUG] Using default project path:', defaultPath);
        return defaultPath;
    }

    generateSelectorVariations(changeData) {
        console.log('[BACKGROUND DEBUG] *** GENERATING SELECTOR VARIATIONS ***');
        console.log('[BACKGROUND DEBUG] Change data for variations:', changeData);
        
        const variations = [];
        const { selector, classList } = changeData;
        
        console.log('[BACKGROUND DEBUG] Base selector:', selector);
        console.log('[BACKGROUND DEBUG] Class list:', classList);
        
        // Original selector
        variations.push({ selector, priority: 1, type: 'original' });
        console.log('[BACKGROUND DEBUG] Added original selector variation');
        
        // Individual class selectors from classList
        if (classList && classList.length > 0) {
            console.log('[BACKGROUND DEBUG] Processing individual classes...');
            classList.forEach((className, index) => {
                const variation = {
                    selector: `.${className}`,
                    priority: 10 - index, // First class gets higher priority
                    type: 'individual_class'
                };
                variations.push(variation);
                console.log(`[BACKGROUND DEBUG] Added individual class variation ${index}:`, variation);
            });
            
            // Combined class selector
            const combinedSelector = '.' + classList.join('.');
            const combinedVariation = {
                selector: combinedSelector,
                priority: 5,
                type: 'combined_classes'
            };
            variations.push(combinedVariation);
            console.log('[BACKGROUND DEBUG] Added combined classes variation:', combinedVariation);
        }
        
        // Element + class combinations
        const elementMatch = selector.match(/^(\w+)/);
        if (elementMatch && classList && classList.length > 0) {
            const element = elementMatch[1];
            console.log('[BACKGROUND DEBUG] Found element:', element);
            
            classList.forEach((className, index) => {
                const variation = {
                    selector: `${element}.${className}`,
                    priority: 8 - index,
                    type: 'element_class'
                };
                variations.push(variation);
                console.log(`[BACKGROUND DEBUG] Added element+class variation ${index}:`, variation);
            });
        }
        
        // Sort by priority (higher first)
        variations.sort((a, b) => b.priority - a.priority);
        console.log('[BACKGROUND DEBUG] Final sorted variations:', variations);
        
        return variations;
    }
}

// Initialize the background processor
console.log('[BACKGROUND DEBUG] Initializing CSSChangeProcessor...');
const processor = new CSSChangeProcessor();
console.log('[BACKGROUND DEBUG] Background script initialization completed');

// Export for debugging
self.cssProcessor = processor;