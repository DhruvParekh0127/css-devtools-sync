// FIXED DevTools Script - Improved CSS change detection
console.log('[DEVTOOLS] Starting DevTools script...');

class CSSChangeDetector {
    constructor() {
        this.panelWindow = null;
        this.isAttached = false;
        this.tabId = chrome.devtools.inspectedWindow.tabId;
        console.log('[DEVTOOLS] Initializing for tab:', this.tabId);
        this.init();
    }

    init() {
        console.log('[DEVTOOLS] Creating DevTools panel...');
        
        // Create the main CSS Sync panel
        chrome.devtools.panels.create(
            'CSS Sync',
            null, // No icon for now
            'panel.html',
            (panel) => {
                console.log('[DEVTOOLS] Panel created successfully');
                
                panel.onShown.addListener((panelWindow) => {
                    console.log('[DEVTOOLS] Panel shown');
                    this.panelWindow = panelWindow;
                    this.startCSSTracking();
                });
                
                panel.onHidden.addListener(() => {
                    console.log('[DEVTOOLS] Panel hidden');
                    this.stopCSSTracking();
                });
            }
        );

        // Enhanced CSS change detection using Elements panel integration
        this.setupElementsPanelIntegration();
    }

    setupElementsPanelIntegration() {
        console.log('[DEVTOOLS] Setting up Elements panel integration...');
        
        // Listen for sidebar pane creation to inject our tracking
        chrome.devtools.panels.elements.createSidebarPane(
            "CSS Sync Status",
            (sidebar) => {
                console.log('[DEVTOOLS] Sidebar pane created');
                
                // Update sidebar with current tracking status
                this.updateSidebar(sidebar);
                
                // Monitor element selection changes
                chrome.devtools.panels.elements.onSelectionChanged.addListener(() => {
                    console.log('[DEVTOOLS] Element selection changed');
                    this.handleElementSelectionChange();
                });
            }
        );
    }

    updateSidebar(sidebar) {
        const statusHtml = `
            <div style="padding: 10px; font-family: sans-serif;">
                <h3 style="margin: 0 0 10px 0; color: #333;">CSS Sync</h3>
                <div id="tracking-status" style="padding: 8px; border-radius: 4px; font-size: 12px;">
                    <span style="color: #666;">Tracking: </span>
                    <span id="status-text" style="font-weight: bold;">${this.isAttached ? 'Active' : 'Inactive'}</span>
                </div>
                <div style="margin-top: 10px; font-size: 11px; color: #666;">
                    Open the CSS Sync panel to start tracking changes.
                </div>
            </div>
        `;
        
        sidebar.setPage(statusHtml);
    }

    async startCSSTracking() {
        if (this.isAttached) {
            console.log('[DEVTOOLS] Already tracking CSS changes');
            return;
        }

        console.log('[DEVTOOLS] Starting CSS tracking...');
        
        try {
            // Attach debugger
            await chrome.debugger.attach({ tabId: this.tabId }, "1.3");
            console.log('[DEVTOOLS] Debugger attached');
            
            // Enable required domains
            await chrome.debugger.sendCommand({ tabId: this.tabId }, "Runtime.enable");
            await chrome.debugger.sendCommand({ tabId: this.tabId }, "DOM.enable");
            await chrome.debugger.sendCommand({ tabId: this.tabId }, "CSS.enable");
            console.log('[DEVTOOLS] All domains enabled');
            
            // Set up event listeners
            this.setupDebuggerListeners();
            
            // Inject tracking script into the page
            await this.injectTrackingScript();
            
            this.isAttached = true;
            console.log('[DEVTOOLS] CSS tracking started successfully');
            
        } catch (error) {
            console.error('[DEVTOOLS] Failed to start CSS tracking:', error);
            this.notifyPanel('TRACKING_ERROR', { error: error.message });
        }
    }

    async stopCSSTracking() {
        if (!this.isAttached) {
            console.log('[DEVTOOLS] Not currently tracking');
            return;
        }

        console.log('[DEVTOOLS] Stopping CSS tracking...');
        
        try {
            await chrome.debugger.detach({ tabId: this.tabId });
            this.isAttached = false;
            console.log('[DEVTOOLS] CSS tracking stopped');
        } catch (error) {
            console.error('[DEVTOOLS] Error stopping tracking:', error);
        }
    }

    setupDebuggerListeners() {
        console.log('[DEVTOOLS] Setting up debugger event listeners...');
        
        chrome.debugger.onEvent.addListener((source, method, params) => {
            // Only process events for our tab
            if (source.tabId !== this.tabId) {
                return;
            }
            
            console.log('[DEVTOOLS] Debugger event:', method, params);
            
            switch (method) {
                case 'CSS.styleSheetChanged':
                    this.handleStyleSheetChanged(params);
                    break;
                case 'CSS.styleSheetAdded':
                    this.handleStyleSheetAdded(params);
                    break;
                case 'Runtime.consoleAPICalled':
                    this.handleConsoleMessage(params);
                    break;
            }
        });
    }

    async injectTrackingScript() {
        console.log('[DEVTOOLS] Injecting tracking script...');
        
        const trackingScript = `
            (function() {
                console.log('[CSS_TRACKER] Injecting CSS change tracker...');
                
                // Track style attribute changes
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'attributes' && 
                            (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                            
                            const element = mutation.target;
                            
                            // Skip if not a regular element
                            if (!element.tagName || element.tagName.startsWith('CHROME-')) {
                                return;
                            }
                            
                            const changeData = {
                                type: 'style_change',
                                selector: generateSelector(element),
                                classList: Array.from(element.classList || []),
                                inlineStyles: getInlineStyles(element),
                                computedStyles: getRelevantComputedStyles(element),
                                timestamp: Date.now(),
                                mutationType: mutation.attributeName
                            };
                            
                            console.log('[CSS_TRACKER] Style change detected:', changeData);
                            
                            // Send to DevTools
                            console.log('CSS_TRACKER_CHANGE:' + JSON.stringify(changeData));
                        }
                    });
                });
                
                function generateSelector(element) {
                    // Generate a meaningful selector for the element
                    if (element.id) {
                        return '#' + element.id;
                    }
                    
                    let selector = element.tagName.toLowerCase();
                    
                    if (element.className && typeof element.className === 'string') {
                        const classes = element.className.trim().split(/\\s+/);
                        if (classes.length > 0 && classes[0]) {
                            selector += '.' + classes[0];
                        }
                    }
                    
                    // Add parent context if needed for uniqueness
                    let parent = element.parentElement;
                    let path = [selector];
                    
                    while (parent && path.length < 3) {
                        let parentSelector = parent.tagName.toLowerCase();
                        if (parent.id) {
                            parentSelector = '#' + parent.id;
                            path.unshift(parentSelector);
                            break;
                        } else if (parent.className && typeof parent.className === 'string') {
                            const classes = parent.className.trim().split(/\\s+/);
                            if (classes.length > 0 && classes[0]) {
                                parentSelector += '.' + classes[0];
                            }
                        }
                        
                        path.unshift(parentSelector);
                        parent = parent.parentElement;
                    }
                    
                    return path.join(' > ');
                }
                
                function getInlineStyles(element) {
                    const styles = {};
                    if (element.style && element.style.length > 0) {
                        for (let i = 0; i < element.style.length; i++) {
                            const property = element.style[i];
                            styles[property] = element.style.getPropertyValue(property);
                        }
                    }
                    return styles;
                }
                
                function getRelevantComputedStyles(element) {
                    const computed = window.getComputedStyle(element);
                    const relevantProps = [
                        'color', 'background-color', 'background', 'border', 'border-color',
                        'font-size', 'font-weight', 'margin', 'padding', 'width', 'height',
                        'display', 'position', 'top', 'left', 'right', 'bottom'
                    ];
                    
                    const styles = {};
                    relevantProps.forEach(prop => {
                        const value = computed.getPropertyValue(prop);
                        if (value) {
                            styles[prop] = value;
                        }
                    });
                    
                    return styles;
                }
                
                // Start observing
                observer.observe(document.body, {
                    attributes: true,
                    attributeFilter: ['style', 'class'],
                    subtree: true
                });
                
                console.log('[CSS_TRACKER] Mutation observer started');
                
                // Also track programmatic style changes by proxying style setter
                const originalStyleSetter = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'cssText').set;
                Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', {
                    set: function(value) {
                        console.log('[CSS_TRACKER] cssText changed:', value);
                        originalStyleSetter.call(this, value);
                    }
                });
                
                return 'CSS Tracker injected successfully';
            })();
        `;
        
        try {
            chrome.devtools.inspectedWindow.eval(trackingScript, (result, isException) => {
                if (isException) {
                    console.error('[DEVTOOLS] Failed to inject tracking script:', result);
                } else {
                    console.log('[DEVTOOLS] Tracking script injected:', result);
                }
            });
        } catch (error) {
            console.error('[DEVTOOLS] Error injecting tracking script:', error);
        }
    }

    handleConsoleMessage(params) {
        // Look for our CSS tracker messages
        if (params.type === 'log' && params.args && params.args[0] && 
            typeof params.args[0].value === 'string' && 
            params.args[0].value.startsWith('CSS_TRACKER_CHANGE:')) {
            
            try {
                const changeDataStr = params.args[0].value.substring('CSS_TRACKER_CHANGE:'.length);
                const changeData = JSON.parse(changeDataStr);
                
                console.log('[DEVTOOLS] CSS change detected from page:', changeData);
                
                // Send to background script
                chrome.runtime.sendMessage({
                    type: 'CSS_CHANGE_DETECTED',
                    data: changeData
                }, (response) => {
                    console.log('[DEVTOOLS] Change sent to background:', response);
                });
                
                // Notify panel
                this.notifyPanel('CSS_CHANGE_DETECTED', changeData);
                
            } catch (error) {
                console.error('[DEVTOOLS] Error parsing CSS change data:', error);
            }
        }
    }

    async handleStyleSheetChanged(params) {
        console.log('[DEVTOOLS] StyleSheet changed:', params);
        
        try {
            // Get the changed stylesheet content
            const result = await chrome.debugger.sendCommand(
                { tabId: this.tabId }, 
                "CSS.getStyleSheetText", 
                { styleSheetId: params.styleSheetId }
            );
            
            console.log('[DEVTOOLS] StyleSheet content retrieved, length:', result.text.length);
            
            // Notify panel about stylesheet change
            this.notifyPanel('STYLESHEET_CHANGED', {
                styleSheetId: params.styleSheetId,
                content: result.text,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('[DEVTOOLS] Error handling stylesheet change:', error);
        }
    }

    handleStyleSheetAdded(params) {
        console.log('[DEVTOOLS] StyleSheet added:', params);
        this.notifyPanel('STYLESHEET_ADDED', params);
    }

    handleElementSelectionChange() {
        // Get currently selected element info
        chrome.devtools.inspectedWindow.eval(
            `
            (() => {
                const element = $0; // Chrome DevTools selected element
                if (!element) return null;
                
                return {
                    tagName: element.tagName,
                    id: element.id,
                    className: element.className,
                    selector: generateSelectorForElement(element)
                };
                
                function generateSelectorForElement(el) {
                    if (el.id) return '#' + el.id;
                    
                    let selector = el.tagName.toLowerCase();
                    if (el.className && typeof el.className === 'string') {
                        const classes = el.className.trim().split(/\\s+/);
                        if (classes[0]) selector += '.' + classes[0];
                    }
                    return selector;
                }
            })()
            `,
            (result, isException) => {
                if (!isException && result) {
                    console.log('[DEVTOOLS] Selected element:', result);
                    this.notifyPanel('ELEMENT_SELECTED', result);
                }
            }
        );
    }

    notifyPanel(type, data) {
        if (this.panelWindow && this.panelWindow.postMessage) {
            this.panelWindow.postMessage({ type, data }, '*');
        }
    }
}

// Initialize the CSS change detector
console.log('[DEVTOOLS] Initializing CSS change detector...');
new CSSChangeDetector();