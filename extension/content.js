// IMPROVED Content Script - Better integration and error handling
console.log('[CONTENT] Starting content script...');

class CSSContentBridge {
    constructor() {
        this.isActive = false;
        this.observers = [];
        this.debounceTimeout = null;
        this.lastNotificationTime = 0;
        
        console.log('[CONTENT] Initializing content bridge...');
        this.init();
    }

    init() {
        console.log('[CONTENT] Setting up content bridge...');
        
        this.setupMessageListeners();
        this.logPageInfo();
        
        // Auto-start if DevTools is open
        this.checkDevToolsStatus();
        
        console.log('[CONTENT] Content bridge initialized');
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('[CONTENT] Message received:', message.type);

            switch (message.type) {
                case 'GET_PAGE_INFO':
                    sendResponse(this.getPageInfo());
                    break;
                    
                case 'START_CSS_TRACKING':
                    this.startTracking();
                    sendResponse({ success: true });
                    break;
                    
                case 'STOP_CSS_TRACKING':
                    this.stopTracking();
                    sendResponse({ success: true });
                    break;
                    
                case 'CSS_CHANGE_APPLIED':
                    this.handleChangeApplied(message.data);
                    break;
                    
                case 'CSS_SYNC_ERROR':
                    this.handleSyncError(message.data);
                    break;
                    
                default:
                    console.log('[CONTENT] Unknown message type:', message.type);
            }
        });
    }

    checkDevToolsStatus() {
        // Simple check to see if DevTools might be open
        // This is a heuristic and not 100% reliable
        const checkInterval = setInterval(() => {
            const widthThreshold = window.outerWidth - window.innerWidth > 200;
            const heightThreshold = window.outerHeight - window.innerHeight > 300;
            
            if (widthThreshold || heightThreshold) {
                console.log('[CONTENT] DevTools likely open, auto-starting tracking');
                this.startTracking();
                clearInterval(checkInterval);
            }
        }, 2000);
        
        // Stop checking after 30 seconds
        setTimeout(() => clearInterval(checkInterval), 30000);
    }

    getPageInfo() {
        return {
            url: window.location.href,
            title: document.title,
            domain: window.location.hostname,
            port: window.location.port,
            protocol: window.location.protocol,
            stylesheetsCount: document.styleSheets.length,
            elementsWithClasses: document.querySelectorAll('[class]').length,
            elementsWithIds: document.querySelectorAll('[id]').length,
            timestamp: Date.now()
        };
    }

    logPageInfo() {
        const info = this.getPageInfo();
        console.log('[CONTENT] Page info:', info);
        
        // Log stylesheet details
        for (let i = 0; i < document.styleSheets.length; i++) {
            const sheet = document.styleSheets[i];
            try {
                console.log(`[CONTENT] Stylesheet ${i}:`, {
                    href: sheet.href,
                    title: sheet.title,
                    disabled: sheet.disabled,
                    media: sheet.media ? Array.from(sheet.media) : null,
                    rules: sheet.cssRules ? sheet.cssRules.length : 'Cannot access'
                });
            } catch (e) {
                console.log(`[CONTENT] Stylesheet ${i}: Cross-origin blocked`);
            }
        }
    }

    startTracking() {
        if (this.isActive) {
            console.log('[CONTENT] Already tracking');
            return;
        }

        console.log('[CONTENT] Starting CSS change tracking...');
        
        try {
            this.setupMutationObserver();
            this.setupStylesheetObserver();
            this.setupDevToolsIntegration();
            
            this.isActive = true;
            this.showNotification('CSS tracking started', 'success');
            console.log('[CONTENT] CSS tracking started successfully');
            
        } catch (error) {
            console.error('[CONTENT] Failed to start tracking:', error);
            this.showNotification(`Failed to start tracking: ${error.message}`, 'error');
        }
    }

    stopTracking() {
        if (!this.isActive) {
            console.log('[CONTENT] Not currently tracking');
            return;
        }

        console.log('[CONTENT] Stopping CSS change tracking...');
        
        // Disconnect all observers
        this.observers.forEach(observer => {
            if (observer && observer.disconnect) {
                observer.disconnect();
            }
        });
        this.observers = [];
        
        this.isActive = false;
        this.showNotification('CSS tracking stopped', 'info');
        console.log('[CONTENT] CSS tracking stopped');
    }

    setupMutationObserver() {
        console.log('[CONTENT] Setting up mutation observer...');
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'attributes' && 
                    (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                    
                    this.handleElementStyleChange(mutation);
                }
            });
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            subtree: true,
            attributeOldValue: true
        });

        this.observers.push(observer);
        console.log('[CONTENT] Mutation observer set up');
    }

    setupStylesheetObserver() {
        console.log('[CONTENT] Setting up stylesheet observer...');
        
        // Watch for new stylesheets being added
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.tagName === 'STYLE' || 
                        (node.tagName === 'LINK' && node.rel === 'stylesheet')) {
                        console.log('[CONTENT] New stylesheet detected:', node);
                        this.handleNewStylesheet(node);
                    }
                });
            });
        });

        observer.observe(document.head, {
            childList: true,
            subtree: true
        });

        this.observers.push(observer);
        console.log('[CONTENT] Stylesheet observer set up');
    }

    setupDevToolsIntegration() {
        console.log('[CONTENT] Setting up DevTools integration...');
        
        // Expose helper functions to DevTools
        window.__cssSync = {
            getElementSelector: this.generateElementSelector.bind(this),
            getElementStyles: this.getElementStyles.bind(this),
            trackElement: this.trackSpecificElement.bind(this)
        };
        
        // Listen for style recalculation (experimental)
        if ('getComputedStyle' in window) {
            const originalGetComputedStyle = window.getComputedStyle;
            window.getComputedStyle = function(element, pseudoElement) {
                const styles = originalGetComputedStyle.call(this, element, pseudoElement);
                // Log when styles are computed (for debugging)
                return styles;
            };
        }
    }

    handleElementStyleChange(mutation) {
        const element = mutation.target;
        
        // Skip non-element nodes and certain elements
        if (!element.tagName || 
            element.tagName.startsWith('CHROME-') ||
            element.tagName === 'SCRIPT' ||
            element.tagName === 'META') {
            return;
        }

        console.log('[CONTENT] Style change detected on:', element.tagName, element.className);
        
        // Debounce rapid changes
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        
        this.debounceTimeout = setTimeout(() => {
            this.processElementChange(element, mutation);
        }, 300); // 300ms debounce
    }

    processElementChange(element, mutation) {
        console.log('[CONTENT] Processing element change...');
        
        try {
            const changeData = {
                type: 'style_change',
                selector: this.generateElementSelector(element),
                classList: Array.from(element.classList || []),
                inlineStyles: this.getInlineStyles(element),
                computedStyles: this.getRelevantComputedStyles(element),
                mutationType: mutation.attributeName,
                oldValue: mutation.oldValue,
                newValue: mutation.attributeName === 'style' ? 
                    element.getAttribute('style') : 
                    element.getAttribute('class'),
                timestamp: Date.now(),
                domain: window.location.hostname,
                url: window.location.href
            };

            console.log('[CONTENT] Change data prepared:', changeData);
            
            // Send to background script
            this.sendChangeToBackground(changeData);
            
        } catch (error) {
            console.error('[CONTENT] Error processing element change:', error);
        }
    }

    generateElementSelector(element) {
        // Generate a meaningful selector for the element
        if (element.id) {
            return '#' + CSS.escape(element.id);
        }
        
        let selector = element.tagName.toLowerCase();
        
        // Add primary class if available
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\s+/).filter(Boolean);
            if (classes.length > 0) {
                // Use first class that's not a utility class
                const primaryClass = classes.find(cls => 
                    !cls.startsWith('_') && 
                    !cls.match(/^[a-z]-/) && 
                    cls.length > 2
                ) || classes[0];
                
                selector += '.' + CSS.escape(primaryClass);
            }
        }
        
        // Add parent context for better specificity
        let parent = element.parentElement;
        let path = [selector];
        let depth = 0;
        
        while (parent && depth < 2) {
            let parentSelector = parent.tagName.toLowerCase();
            
            if (parent.id) {
                parentSelector = '#' + CSS.escape(parent.id);
                path.unshift(parentSelector);
                break;
            } else if (parent.className && typeof parent.className === 'string') {
                const classes = parent.className.trim().split(/\s+/).filter(Boolean);
                if (classes.length > 0) {
                    const primaryClass = classes.find(cls => 
                        !cls.startsWith('_') && 
                        !cls.match(/^[a-z]-/) && 
                        cls.length > 2
                    ) || classes[0];
                    
                    parentSelector += '.' + CSS.escape(primaryClass);
                }
            }
            
            path.unshift(parentSelector);
            parent = parent.parentElement;
            depth++;
        }
        
        return path.join(' > ');
    }

    getInlineStyles(element) {
        const styles = {};
        if (element.style && element.style.length > 0) {
            for (let i = 0; i < element.style.length; i++) {
                const property = element.style[i];
                const value = element.style.getPropertyValue(property);
                const priority = element.style.getPropertyPriority(property);
                
                styles[property] = {
                    value: value,
                    priority: priority || null
                };
            }
        }
        return styles;
    }

    getRelevantComputedStyles(element) {
        const computed = window.getComputedStyle(element);
        
        // Focus on commonly changed properties
        const relevantProps = [
            'color', 'background-color', 'background', 'background-image',
            'border', 'border-color', 'border-width', 'border-style',
            'font-size', 'font-weight', 'font-family', 'line-height',
            'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
            'display', 'position', 'top', 'left', 'right', 'bottom',
            'opacity', 'visibility', 'overflow', 'text-align', 'transform'
        ];
        
        const styles = {};
        relevantProps.forEach(prop => {
            try {
                const value = computed.getPropertyValue(prop);
                if (value && value !== 'initial' && value !== 'auto') {
                    styles[prop] = value;
                }
            } catch (e) {
                // Some properties might not be accessible
            }
        });
        
        return styles;
    }

    async sendChangeToBackground(changeData) {
        console.log('[CONTENT] Sending change to background script...');
        
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'CSS_CHANGE_DETECTED',
                data: changeData
            });
            
            console.log('[CONTENT] Change sent successfully:', response);
            
        } catch (error) {
            console.error('[CONTENT] Failed to send change to background:', error);
            
            // Show user-friendly error if extension context is invalidated
            if (error.message.includes('Extension context invalidated')) {
                this.showNotification('Extension reloaded - please refresh page', 'error');
            }
        }
    }

    handleNewStylesheet(stylesheetNode) {
        console.log('[CONTENT] New stylesheet added:', stylesheetNode);
        
        const stylesheetInfo = {
            type: 'stylesheet_added',
            tagName: stylesheetNode.tagName,
            href: stylesheetNode.href || null,
            title: stylesheetNode.title || null,
            media: stylesheetNode.media || null,
            timestamp: Date.now()
        };
        
        // Send notification about new stylesheet
        this.sendChangeToBackground(stylesheetInfo);
    }

    trackSpecificElement(element) {
        if (!element || !element.tagName) {
            console.error('[CONTENT] Invalid element provided for tracking');
            return;
        }
        
        console.log('[CONTENT] Tracking specific element:', element);
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.target === element) {
                    this.handleElementStyleChange(mutation);
                }
            });
        });
        
        observer.observe(element, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            attributeOldValue: true
        });
        
        this.observers.push(observer);
        return observer;
    }

    handleChangeApplied(data) {
        console.log('[CONTENT] CSS change applied:', data);
        this.showNotification(`Applied: ${data.selector}`, 'success');
    }

    handleSyncError(data) {
        console.error('[CONTENT] CSS sync error:', data);
        this.showNotification(`Sync error: ${data.error}`, 'error');
    }

    showNotification(message, type = 'info') {
        // Throttle notifications to avoid spam
        const now = Date.now();
        if (now - this.lastNotificationTime < 1000) {
            return;
        }
        this.lastNotificationTime = now;
        
        console.log('[CONTENT] Showing notification:', { message, type });
        
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            background: ${this.getNotificationColor(type)} !important;
            color: white !important;
            padding: 12px 16px !important;
            border-radius: 6px !important;
            font-size: 14px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
            z-index: 2147483647 !important;
            max-width: 300px !important;
            opacity: 0 !important;
            transition: opacity 0.3s ease !important;
            pointer-events: none !important;
            font-weight: 500 !important;
            line-height: 1.4 !important;
        `;
        
        notification.textContent = message;
        
        // Add to page
        document.documentElement.appendChild(notification);
        
        // Fade in
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
        });
        
        // Auto remove after delay
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, type === 'error' ? 5000 : 3000);
    }

    getNotificationColor(type) {
        switch (type) {
            case 'success': return '#10b981';
            case 'error': return '#ef4444';
            case 'warning': return '#f59e0b';
            default: return '#3b82f6';
        }
    }

    // Cleanup when page unloads
    cleanup() {
        console.log('[CONTENT] Cleaning up content script...');
        this.stopTracking();
        
        // Remove global objects
        if (window.__cssSync) {
            delete window.__cssSync;
        }
    }
}

// Initialize content bridge
console.log('[CONTENT] Initializing content bridge...');
const contentBridge = new CSSContentBridge();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    contentBridge.cleanup();
});

// Handle extension updates
chrome.runtime.onConnect.addListener((port) => {
    port.onDisconnect.addListener(() => {
        console.log('[CONTENT] Extension disconnected, cleaning up...');
        contentBridge.cleanup();
    });
});

console.log('[CONTENT] Content script initialization completed');