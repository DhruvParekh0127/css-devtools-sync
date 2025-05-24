// Simplified Content Script - Focused on DevTools Protocol Support
class CSSContentBridge {
    constructor() {
        this.init();
    }

    init() {
        // Listen for messages from extension
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'GET_PAGE_INFO') {
                sendResponse({
                    url: window.location.href,
                    title: document.title,
                    domain: window.location.hostname,
                    stylesheetsCount: document.styleSheets.length,
                    timestamp: Date.now()
                });
            } else if (message.type === 'CSS_CHANGE_APPLIED') {
                this.handleChangeApplied(message.data);
            } else if (message.type === 'CSS_SYNC_ERROR') {
                this.handleSyncError(message.data);
            }
        });

        console.log('CSS DevTools Sync content script loaded');
        this.logPageInfo();
    }

    logPageInfo() {
        const info = {
            url: window.location.href,
            stylesheets: document.styleSheets.length,
            domain: window.location.hostname
        };
        
        console.log('CSS Sync - Page info:', info);
        
        // Log stylesheet details for debugging
        for (let i = 0; i < document.styleSheets.length; i++) {
            const sheet = document.styleSheets[i];
            console.log(`Stylesheet ${i}:`, {
                href: sheet.href,
                title: sheet.title,
                type: sheet.type,
                disabled: sheet.disabled,
                rules: sheet.cssRules ? sheet.cssRules.length : 'Cannot access'
            });
        }
    }

    handleChangeApplied(data) {
        console.log('CSS change was applied to file:', data);
        
        // Optional: Show a subtle notification
        this.showNotification(`Applied CSS change: ${data.selector}`, 'success');
    }

    handleSyncError(data) {
        console.error('CSS sync error:', data);
        
        // Optional: Show error notification
        this.showNotification(`CSS sync error: ${data.error}`, 'error');
    }

    showNotification(message, type = 'info') {
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
        
        // Fade in
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 10);
        
        // Fade out and remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize content bridge
new CSSContentBridge();