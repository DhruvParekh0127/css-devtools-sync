// Background script for processing CSS changes and communicating with server
class CSSChangeProcessor {
    constructor() {
        this.serverUrl = 'http://localhost:3001';
        this.changeQueue = [];
        this.isProcessing = false;
        this.setupMessageListeners();
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'CSS_CHANGE_DETECTED') {
                this.processCSSChange(message.data);
                sendResponse({ success: true });
            } else if (message.type === 'GET_SERVER_STATUS') {
                this.checkServerStatus().then(sendResponse);
                return true; // Keep message channel open for async response
            } else if (message.type === 'SET_PROJECT_PATH') {
                this.setProjectPath(message.data.path).then(sendResponse);
                return true;
            }
        });
    }

    async checkServerStatus() {
        try {
            const response = await fetch(`${this.serverUrl}/status`);
            const data = await response.json();
            return { connected: true, ...data };
        } catch (error) {
            return { connected: false, error: error.message };
        }
    }

    async setProjectPath(path) {
        try {
            const response = await fetch(`${this.serverUrl}/set-project-path`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });
            return await response.json();
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processCSSChange(changeData) {
        console.log('Processing CSS change:', changeData);
        
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
            // Enhance change data with intelligent selector matching
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
                console.log('CSS change applied successfully:', result);
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
            matchingStrategy: 'intelligent'
        };
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