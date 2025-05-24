// Background script for processing CSS changes and communicating with server
class CSSChangeProcessor {
    constructor() {
        this.serverUrl = 'http://localhost:3001';
        this.changeQueue = [];
        this.isProcessing = false;
        this.currentConfiguration = {
            projectPath: null,
            domainMappings: {},
            activePath: null
        };
        this.setupMessageListeners();
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'CSS_CHANGE_DETECTED') {
                this.processCSSChange(message.data, sender.tab);
                sendResponse({ success: true });
            } else if (message.type === 'GET_SERVER_STATUS') {
                this.checkServerStatus(message.domain).then(sendResponse);
                return true; // Keep message channel open for async response
            } else if (message.type === 'SET_PROJECT_CONFIGURATION') {
                this.setProjectConfiguration(message.data).then(sendResponse);
                return true;
            } else if (message.type === 'APPLY_CSS_CHANGE') {
                this.applySingleChange(message.data).then(sendResponse);
                return true;
            }
        });
    }

    async applySingleChange(changeData) {
        try {
            // Add domain information if available
            if (!changeData.domain) {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]) {
                    const url = new URL(tabs[0].url);
                    changeData.domain = url.hostname + (url.port ? ':' + url.port : '');
                }
            }

            // Enhance change data with intelligent selector matching and domain info
            const enhancedData = this.enhanceChangeData(changeData);
            
            const response = await fetch(`${this.serverUrl}/apply-css-change`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(enhancedData)
            });

            const result = await response.json();
            
            if (!result.success) {
                console.error('Server failed to apply change:', result.error);
            } else {
                console.log('CSS change applied successfully to:', result.file);
            }
            
            return result;
        } catch (error) {
            console.error('Failed to send change to server:', error);
            return { success: false, error: error.message };
        }
    }

    async checkServerStatus(currentDomain = null) {
        try {
            const response = await fetch(`${this.serverUrl}/status`);
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
            return { connected: false, error: error.message };
        }
    }

    async setProjectConfiguration(config) {
        try {
            // Update local configuration
            this.currentConfiguration = {
                projectPath: config.projectPath,
                domainMappings: config.domainMappings || {},
                activePath: config.activePath
            };

            // Send configuration to server
            const response = await fetch(`${this.serverUrl}/set-project-configuration`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('Configuration updated:', config);
            }
            
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processCSSChange(changeData, tab) {
        // Add domain information to change data
        if (tab && tab.url) {
            const url = new URL(tab.url);
            changeData.domain = url.hostname + (url.port ? ':' + url.port : '');
            changeData.fullUrl = tab.url;
        }
        
        console.log('Processing CSS change for domain:', changeData.domain);
        
        // Add to queue
        this.changeQueue.push(changeData);
        
        // Process queue if not already processing
        if (!this.isProcessing) {
            await this.processQueue();
        }
    }

    async processQueue() {
        if (this.changeQueue.length === 0) return;
        
        this.isProcessing = true;
        
        while (this.changeQueue.length > 0) {
            const change = this.changeQueue.shift();
            await this.sendChangeToServer(change);
            
            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.isProcessing = false;
    }

    async sendChangeToServer(changeData) {
        try {
            // Enhance change data with intelligent selector matching and domain info
            const enhancedData = this.enhanceChangeData(changeData);
            
            const response = await fetch(`${this.serverUrl}/apply-css-change`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(enhancedData)
            });

            const result = await response.json();
            
            if (!result.success) {
                console.error('Server failed to apply change:', result.error);
                // Notify DevTools panel of error
                this.notifyDevToolsPanel('CSS_SYNC_ERROR', {
                    error: result.error,
                    changeData: enhancedData
                });
            } else {
                console.log('CSS change applied successfully to:', result.file);
                // Notify DevTools panel of success
                this.notifyDevToolsPanel('CSS_CHANGE_APPLIED', {
                    ...result,
                    changeData: enhancedData
                });
            }
            
            return result;
        } catch (error) {
            console.error('Failed to send change to server:', error);
            this.notifyDevToolsPanel('CSS_SYNC_ERROR', {
                error: error.message,
                changeData
            });
            return { success: false, error: error.message };
        }
    }

    async notifyDevToolsPanel(type, data) {
        // Try to send message to DevTools panel
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type, data });
            }
        } catch (error) {
            // DevTools panel might not be open, that's okay
            console.log('Could not notify DevTools panel:', error.message);
        }
    }

    enhanceChangeData(changeData) {
        // Create multiple selector variations for smart matching
        const selectorVariations = this.generateSelectorVariations(changeData);
        
        return {
            ...changeData,
            selectorVariations,
            matchingStrategy: 'intelligent',
            // Include domain-specific information
            targetPath: this.getTargetPathForDomain(changeData.domain)
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
        
        // Individual class selectors from classList
        if (classList && classList.length > 0) {
            classList.forEach((className, index) => {
                variations.push({
                    selector: `.${className}`,
                    priority: 10 - index, // First class gets higher priority
                    type: 'individual_class'
                });
            });
            
            // Combined class selector
            const combinedSelector = '.' + classList.join('.');
            variations.push({
                selector: combinedSelector,
                priority: 5,
                type: 'combined_classes'
            });
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
new CSSChangeProcessor();