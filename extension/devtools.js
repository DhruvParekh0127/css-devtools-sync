// DevTools script for detecting CSS changes
class CSSChangeDetector {
    constructor() {
        this.originalStyles = new Map();
        this.isTracking = false;
        this.serverUrl = 'http://localhost:3001';
        this.init();
    }

    init() {
        // Create a panel in DevTools
        chrome.devtools.panels.create(
            'CSS Sync',
            null,
            'panel.html',
            (panel) => {
                panel.onShown.addListener(this.startTracking.bind(this));
                panel.onHidden.addListener(this.stopTracking.bind(this));
            }
        );

        this.setupDebuggerListener();
    }

    setupDebuggerListener() {
        // Listen for CSS property changes
        chrome.debugger.onEvent.addListener((source, method, params) => {
            if (method === 'CSS.styleSheetChanged') {
                this.handleStyleSheetChange(params);
            }
        });
    }

    async startTracking() {
        if (this.isTracking) return;

        try {
            // Attach debugger to current tab
            await chrome.debugger.attach({ tabId: chrome.devtools.inspectedWindow.tabId }, "1.3");
            await chrome.debugger.sendCommand({ tabId: chrome.devtools.inspectedWindow.tabId }, "CSS.enable");
            
            this.isTracking = true;
            console.log('CSS tracking started');
            
            // Capture initial styles
            await this.captureInitialStyles();
        } catch (error) {
            console.error('Failed to start tracking:', error);
        }
    }

    async stopTracking() {
        if (!this.isTracking) return;

        try {
            await chrome.debugger.detach({ tabId: chrome.devtools.inspectedWindow.tabId });
            this.isTracking = false;
            console.log('CSS tracking stopped');
        } catch (error) {
            console.error('Failed to stop tracking:', error);
        }
    }

    async captureInitialStyles() {
        try {
            const result = await chrome.debugger.sendCommand(
                { tabId: chrome.devtools.inspectedWindow.tabId },
                "CSS.getMatchedStylesForNode",
                { nodeId: 1 }
            );

            // Store initial computed styles for comparison
            this.originalStyles.clear();
            // We'll populate this as we detect changes
        } catch (error) {
            console.error('Failed to capture initial styles:', error);
        }
    }

    async handleStyleSheetChange(params) {
        if (!this.isTracking) return;

        try {
            // Get the modified stylesheet
            const styleSheet = await chrome.debugger.sendCommand(
                { tabId: chrome.devtools.inspectedWindow.tabId },
                "CSS.getStyleSheetText",
                { styleSheetId: params.styleSheetId }
            );

            // Parse and detect specific changes
            await this.detectSpecificChanges(params.styleSheetId, styleSheet.text);
        } catch (error) {
            console.error('Failed to handle stylesheet change:', error);
        }
    }

    async detectSpecificChanges(styleSheetId, newStyleText) {
        // This is where we'll implement intelligent change detection
        // For now, let's use a simpler approach by monitoring element style changes
        
        chrome.devtools.inspectedWindow.eval(`
            (() => {
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                            const element = mutation.target;
                            const computedStyle = window.getComputedStyle(element);
                            const classList = Array.from(element.classList);
                            
                            // Get the selector path
                            const selectorPath = getSelectorPath(element);
                            
                            // Send change data
                            const changeData = {
                                selector: selectorPath,
                                classList: classList,
                                changedStyles: getChangedStyles(element),
                                timestamp: Date.now()
                            };
                            
                            // Send to background script
                            chrome.runtime.sendMessage({
                                type: 'CSS_CHANGE_DETECTED',
                                data: changeData
                            });
                        }
                    });
                });

                function getSelectorPath(element) {
                    if (element.id) {
                        return '#' + element.id;
                    }
                    
                    let path = [];
                    while (element && element.nodeType === Node.ELEMENT_NODE) {
                        let selector = element.nodeName.toLowerCase();
                        
                        if (element.classList.length > 0) {
                            // Use the first class as primary selector
                            selector += '.' + element.classList[0];
                        }
                        
                        path.unshift(selector);
                        element = element.parentNode;
                        
                        // Don't go beyond body
                        if (selector === 'body') break;
                    }
                    
                    return path.join(' > ');
                }

                function getChangedStyles(element) {
                    const inlineStyles = {};
                    if (element.style) {
                        for (let i = 0; i < element.style.length; i++) {
                            const property = element.style[i];
                            inlineStyles[property] = element.style.getPropertyValue(property);
                        }
                    }
                    return inlineStyles;
                }

                // Start observing
                observer.observe(document.body, {
                    attributes: true,
                    attributeFilter: ['style'],
                    subtree: true
                });

                return 'CSS change observer started';
            })()
        `, (result, isException) => {
            if (isException) {
                console.error('Failed to inject CSS observer:', result);
            } else {
                console.log('CSS observer injected:', result);
            }
        });
    }
}

// Initialize the CSS change detector
new CSSChangeDetector();