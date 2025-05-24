// DEBUG VERSION - Content script with extensive logging
console.log('[CONTENT DEBUG] Content script starting...');

class CSSContentBridge {
    constructor() {
        console.log('[CONTENT DEBUG] Constructor started');
        this.init();
    }

    init() {
        console.log('[CONTENT DEBUG] Initializing content bridge');
        
        // Listen for messages from extension
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('[CONTENT DEBUG] Message received:', {
                type: message.type,
                sender: sender,
                data: message.data
            });

            if (message.type === 'GET_PAGE_INFO') {
                console.log('[CONTENT DEBUG] Processing GET_PAGE_INFO request');
                const pageInfo = {
                    url: window.location.href,
                    title: document.title,
                    domain: window.location.hostname,
                    stylesheetsCount: document.styleSheets.length,
                    timestamp: Date.now()
                };
                console.log('[CONTENT DEBUG] Page info:', pageInfo);
                sendResponse(pageInfo);
            } else if (message.type === 'CSS_CHANGE_APPLIED') {
                console.log('[CONTENT DEBUG] Processing CSS_CHANGE_APPLIED notification');
                this.handleChangeApplied(message.data);
            } else if (message.type === 'CSS_SYNC_ERROR') {
                console.log('[CONTENT DEBUG] Processing CSS_SYNC_ERROR notification');
                this.handleSyncError(message.data);
            } else {
                console.log('[CONTENT DEBUG] Unknown message type:', message.type);
            }
        });

        console.log('[CONTENT DEBUG] Content script loaded successfully');
        this.logPageInfo();
    }

    logPageInfo() {
        console.log('[CONTENT DEBUG] *** PAGE INFORMATION ***');
        
        const info = {
            url: window.location.href,
            stylesheets: document.styleSheets.length,
            domain: window.location.hostname,
            title: document.title
        };
        
        console.log('[CONTENT DEBUG] Basic page info:', info);
        
        // Log stylesheet details for debugging
        console.log('[CONTENT DEBUG] Stylesheet details:');
        for (let i = 0; i < document.styleSheets.length; i++) {
            const sheet = document.styleSheets[i];
            const sheetInfo = {
                index: i,
                href: sheet.href,
                title: sheet.title,
                type: sheet.type,
                disabled: sheet.disabled,
                media: sheet.media ? Array.from(sheet.media) : null
            };
            
            // Try to get rules count
            try {
                sheetInfo.rules = sheet.cssRules ? sheet.cssRules.length : 'Cannot access';
            } catch (e) {
                sheetInfo.rules = 'Cross-origin blocked';
            }
            
            console.log(`[CONTENT DEBUG] Stylesheet ${i}:`, sheetInfo);
        }
        
        // Log some DOM info
        console.log('[CONTENT DEBUG] DOM info:', {
            elementsWithClasses: document.querySelectorAll('[class]').length,
            elementsWithIds: document.querySelectorAll('[id]').length,
            totalElements: document.querySelectorAll('*').length
        });
    }

    handleChangeApplied(data) {
        console.log('[CONTENT DEBUG] *** CHANGE APPLIED ***', data);
        
        // Optional: Show a subtle notification
        this.showNotification(`Applied CSS change: ${data.selector}`, 'success');
    }

    handleSyncError(data) {
        console.error('[CONTENT DEBUG] *** SYNC ERROR ***', data);
        
        // Optional: Show error notification
        this.showNotification(`CSS sync error: ${data.error}`, 'error');
    }

    showNotification(message, type = 'info') {
        console.log('[CONTENT DEBUG] Showing notification:', { message, type });
        
        // Create a simple notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            padding: 12px 16px;
            border-radius: 4px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            max-width: 300px;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        console.log('[CONTENT DEBUG] Notification element created and added to DOM');
        
        // Fade in
        setTimeout(() => {
            notification.style.opacity = '1';
            console.log('[CONTENT DEBUG] Notification faded in');
        }, 10);
        
        // Fade out and remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            console.log('[CONTENT DEBUG] Starting notification fade out');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                    console.log('[CONTENT DEBUG] Notification removed from DOM');
                }
            }, 300);
        }, 3000);
    }
}

// Initialize content bridge
console.log('[CONTENT DEBUG] Initializing CSSContentBridge...');
new CSSContentBridge();
console.log('[CONTENT DEBUG] Content script initialization completed');