// DevTools panel script
class DevToolsPanel {
    constructor() {
        this.isActive = false;
        this.statusEl = document.getElementById('sync-status');
        this.startBtnEl = document.getElementById('start-btn');
        this.stopBtnEl = document.getElementById('stop-btn');
        this.clearLogBtnEl = document.getElementById('clear-log-btn');
        this.logEl = document.getElementById('log');
        
        this.init();
    }

    init() {
        // Setup event listeners
        this.startBtnEl.addEventListener('click', () => this.startSync());
        this.stopBtnEl.addEventListener('click', () => this.stopSync());
        this.clearLogBtnEl.addEventListener('click', () => this.clearLog());
        
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'CSS_CHANGE_APPLIED') {
                this.logChange(message.data);
            } else if (message.type === 'CSS_SYNC_ERROR') {
                this.logError(message.data);
            }
        });
        
        this.logInfo('DevTools panel initialized');
    }

    async startSync() {
        if (this.isActive) return;
        
        try {
            // Start CSS change detection
            await this.injectChangeDetector();
            
            this.isActive = true;
            this.updateUI();
            this.logInfo('CSS sync started - DevTools changes will now be tracked');
        } catch (error) {
            this.logError(`Failed to start sync: ${error.message}`);
        }
    }

    async stopSync() {
        if (!this.isActive) return;
        
        this.isActive = false;
        this.updateUI();
        this.logInfo('CSS sync stopped');
    }

    updateUI() {
        if (this.isActive) {
            this.statusEl.className = 'status active';
            this.statusEl.textContent = 'CSS Sync is active - Tracking DevTools changes';
            this.startBtnEl.style.display = 'none';
            this.stopBtnEl.style.display = 'inline-block';
        } else {
            this.statusEl.className = 'status inactive';
            this.statusEl.textContent = 'CSS Sync is inactive. Click "Start Sync" to begin tracking changes.';
            this.startBtnEl.style.display = 'inline-block';
            this.stopBtnEl.style.display = 'none';
        }
    }

    async injectChangeDetector() {
        return new Promise((resolve, reject) => {
            chrome.devtools.inspectedWindow.eval(`
                (() => {
                    // Enhanced CSS change detection
                    class CSSChangeDetector {
                        constructor() {
                            this.originalStyles = new Map();
                            this.setupObservers();
                        }

                        setupObservers() {
                            // Method 1: Observe style attribute changes
                            this.setupStyleAttributeObserver();
                            
                            // Method 2: Monitor DevTools style changes via computed styles
                            this.setupPeriodicStyleCheck();
                        }

                        setupStyleAttributeObserver() {
                            const observer = new MutationObserver((mutations) => {
                                mutations.forEach((mutation) => {
                                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                                        this.handleStyleChange(mutation.target);
                                    }
                                });
                            });

                            observer.observe(document.body, {
                                attributes: true,
                                attributeFilter: ['style'],
                                subtree: true
                            });
                        }

                        setupPeriodicStyleCheck() {
                            // Check for computed style changes periodically
                            // This catches changes made directly in DevTools
                            setInterval(() => {
                                this.checkForStyleChanges();
                            }, 1000);
                        }

                        checkForStyleChanges() {
                            const elementsWithClasses = document.querySelectorAll('[class]');
                            elementsWithClasses.forEach(element => {
                                const elementId = this.getElementId(element);
                                const currentStyles = this.getRelevantStyles(element);
                                const previousStyles = this.originalStyles.get(elementId);

                                if (previousStyles) {
                                    const changes = this.compareStyles(previousStyles, currentStyles);
                                    if (Object.keys(changes).length > 0) {
                                        this.reportStyleChange(element, changes);
                                        this.originalStyles.set(elementId, currentStyles);
                                    }
                                } else {
                                    this.originalStyles.set(elementId, currentStyles);
                                }
                            });
                        }

                        getElementId(element) {
                            if (element.id) return '#' + element.id;
                            
                            // Create a unique identifier based on position and classes
                            const classes = Array.from(element.classList).sort().join('.');
                            const tagName = element.tagName.toLowerCase();
                            const xpath = this.getXPath(element);
                            
                            return tagName + '.' + classes + '[' + xpath + ']';
                        }

                        getXPath(element) {
                            if (element.id) return 'id("' + element.id + '")';
                            
                            const parts = [];
                            while (element && element.nodeType === Node.ELEMENT_NODE) {
                                let index = 0;
                                let hasFollowingSiblings = false;
                                
                                for (let sibling = element.previousSibling; sibling; sibling = sibling.previousSibling) {
                                    if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === element.tagName) {
                                        index++;
                                    }
                                }
                                
                                for (let sibling = element.nextSibling; sibling; sibling = sibling.nextSibling) {
                                    if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === element.tagName) {
                                        hasFollowingSiblings = true;
                                        break;
                                    }
                                }
                                
                                const tagName = element.tagName.toLowerCase();
                                const pathIndex = (index > 0 || hasFollowingSiblings) ? '[' + (index + 1) + ']' : '';
                                parts.unshift(tagName + pathIndex);
                                
                                element = element.parentNode;
                            }
                            
                            return parts.length ? '/' + parts.join('/') : '';
                        }

                        getRelevantStyles(element) {
                            const computedStyle = window.getComputedStyle(element);
                            const relevantProperties = [
                                'color', 'background-color', 'font-size', 'font-weight', 'font-family',
                                'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
                                'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
                                'border', 'border-color', 'border-width', 'border-style',
                                'width', 'height', 'display', 'position', 'top', 'right', 'bottom', 'left',
                                'opacity', 'z-index', 'text-align', 'line-height'
                            ];
                            
                            const styles = {};
                            relevantProperties.forEach(prop => {
                                styles[prop] = computedStyle.getPropertyValue(prop);
                            });
                            
                            return styles;
                        }

                        compareStyles(oldStyles, newStyles) {
                            const changes = {};
                            
                            for (const [property, newValue] of Object.entries(newStyles)) {
                                const oldValue = oldStyles[property];
                                if (oldValue !== newValue) {
                                    changes[property] = {
                                        from: oldValue,
                                        to: newValue
                                    };
                                }
                            }
                            
                            return changes;
                        }

                        handleStyleChange(element) {
                            const inlineStyles = {};
                            if (element.style && element.style.length > 0) {
                                for (let i = 0; i < element.style.length; i++) {
                                    const property = element.style[i];
                                    inlineStyles[property] = element.style.getPropertyValue(property);
                                }
                                
                                this.reportStyleChange(element, inlineStyles);
                            }
                        }

                        reportStyleChange(element, changes) {
                            const changeData = {
                                selector: this.generateSelector(element),
                                classList: Array.from(element.classList),
                                changes: changes,
                                timestamp: Date.now(),
                                elementInfo: {
                                    tagName: element.tagName.toLowerCase(),
                                    id: element.id || null,
                                    xpath: this.getXPath(element)
                                }
                            };

                            // Send to extension
                            window.postMessage({
                                type: 'CSS_CHANGE_DETECTED',
                                data: changeData,
                                source: 'css-devtools-sync'
                            }, '*');
                        }

                        generateSelector(element) {
                            // Generate the most specific reasonable selector
                            if (element.id) {
                                return '#' + element.id;
                            }
                            
                            const classes = Array.from(element.classList);
                            if (classes.length > 0) {
                                // Use the first class as primary selector
                                return '.' + classes[0];
                            }
                            
                            // Fallback to tag name
                            return element.tagName.toLowerCase();
                        }
                    }

                    // Initialize detector
                    window.cssChangeDetector = new CSSChangeDetector();
                    
                    // Listen for messages from extension
                    window.addEventListener('message', (event) => {
                        if (event.data.type === 'CSS_CHANGE_DETECTED' && event.data.source === 'css-devtools-sync') {
                            // Forward to extension background script
                            chrome.runtime.sendMessage({
                                type: 'CSS_CHANGE_DETECTED',
                                data: event.data.data
                            });
                        }
                    });
                    
                    return 'CSS change detector initialized successfully';
                })()
            `, (result, isException) => {
                if (isException) {
                    reject(new Error(result.value || 'Failed to inject change detector'));
                } else {
                    resolve(result);
                }
            });
        });
    }

    logChange(data) {
        this.addLogEntry('change', `Style changed: ${data.selector} - ${JSON.stringify(data.changes)}`);
    }

    logError(message) {
        this.addLogEntry('error', message);
    }

    logInfo(message) {
        this.addLogEntry('info', message);
    }

    addLogEntry(type, message) {
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
    }

    clearLog() {
        this.logEl.innerHTML = '<div class="log-entry info"><span class="timestamp">[Ready]</span> Log cleared.</div>';
    }
}

// Initialize panel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DevToolsPanel();
});