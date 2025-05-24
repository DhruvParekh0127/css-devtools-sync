// Content script to bridge DevTools and extension
class CSSContentBridge {
    constructor() {
        this.isInjected = false;
        this.init();
    }

    init() {
        // Listen for messages from the page (DevTools detector)
        window.addEventListener('message', (event) => {
            // Only accept messages from same origin
            if (event.source !== window) return;
            
            if (event.data.type === 'CSS_CHANGE_DETECTED' && event.data.source === 'css-devtools-sync') {
                // Forward to background script
                chrome.runtime.sendMessage({
                    type: 'CSS_CHANGE_DETECTED',
                    data: event.data.data
                });
            }
        });

        // Listen for messages from extension
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'INJECT_CSS_DETECTOR') {
                this.injectCSSDetector();
                sendResponse({ success: true });
            } else if (message.type === 'GET_PAGE_INFO') {
                sendResponse({
                    url: window.location.href,
                    title: document.title,
                    elementsWithClasses: document.querySelectorAll('[class]').length
                });
            }
        });

        console.log('CSS DevTools Sync content script loaded');
    }

    injectCSSDetector() {
        if (this.isInjected) return;

        const script = document.createElement('script');
        script.textContent = `
            (() => {
                if (window.cssDevToolsSync) return;
                
                class CSSDevToolsDetector {
                    constructor() {
                        this.observers = [];
                        this.styleMap = new WeakMap();
                        this.setupDetection();
                        window.cssDevToolsSync = this;
                    }

                    setupDetection() {
                        // Method 1: Direct style attribute observation
                        this.setupStyleObserver();
                        
                        // Method 2: Computed style monitoring
                        this.setupComputedStyleMonitor();
                        
                        // Method 3: CSS rule change detection
                        this.setupCSSRuleMonitor();
                    }

                    setupStyleObserver() {
                        const observer = new MutationObserver((mutations) => {
                            mutations.forEach((mutation) => {
                                if (mutation.type === 'attributes' && 
                                    mutation.attributeName === 'style') {
                                    this.handleDirectStyleChange(mutation.target);
                                }
                            });
                        });

                        observer.observe(document.documentElement, {
                            attributes: true,
                            attributeFilter: ['style'],
                            subtree: true
                        });

                        this.observers.push(observer);
                    }

                    setupComputedStyleMonitor() {
                        // Monitor elements that might be changed in DevTools
                        const checkInterval = setInterval(() => {
                            this.checkForComputedStyleChanges();
                        }, 1000);

                        // Clean up on page unload
                        window.addEventListener('beforeunload', () => {
                            clearInterval(checkInterval);
                        });
                    }

                    setupCSSRuleMonitor() {
                        // Override CSSStyleSheet methods to catch rule modifications
                        if (window.CSSStyleSheet && CSSStyleSheet.prototype) {
                            const originalInsertRule = CSSStyleSheet.prototype.insertRule;
                            const originalDeleteRule = CSSStyleSheet.prototype.deleteRule;

                            CSSStyleSheet.prototype.insertRule = function(rule, index) {
                                console.log('CSS rule inserted:', rule);
                                return originalInsertRule.call(this, rule, index);
                            };

                            CSSStyleSheet.prototype.deleteRule = function(index) {
                                console.log('CSS rule deleted at index:', index);
                                return originalDeleteRule.call(this, index);
                            };
                        }
                    }

                    handleDirectStyleChange(element) {
                        if (!element.style || element.style.length === 0) return;

                        const changes = {};
                        for (let i = 0; i < element.style.length; i++) {
                            const property = element.style[i];
                            const value = element.style.getPropertyValue(property);
                            changes[property] = value;
                        }

                        this.reportChange(element, changes, 'direct');
                    }

                    checkForComputedStyleChanges() {
                        const elementsToCheck = document.querySelectorAll('[class]');
                        
                        elementsToCheck.forEach(element => {
                            // Skip if element is not visible
                            if (!element.offsetParent && element !== document.body) return;
                            
                            const currentStyles = this.captureRelevantStyles(element);
                            const previousStyles = this.styleMap.get(element);

                            if (previousStyles) {
                                const changes = this.compareStyles(previousStyles, currentStyles);
                                if (Object.keys(changes).length > 0) {
                                    this.reportChange(element, changes, 'computed');
                                }
                            }
                            
                            this.styleMap.set(element, currentStyles);
                        });
                    }

                    captureRelevantStyles(element) {
                        const computed = window.getComputedStyle(element);
                        const relevantProps = [
                            'color', 'background-color', 'background', 'font-size', 'font-weight', 
                            'font-family', 'margin', 'padding', 'border', 'width', 'height',
                            'display', 'position', 'top', 'right', 'bottom', 'left',
                            'opacity', 'z-index', 'text-align', 'line-height', 'transform'
                        ];

                        const styles = {};
                        relevantProps.forEach(prop => {
                            styles[prop] = computed.getPropertyValue(prop);
                        });

                        return styles;
                    }

                    compareStyles(oldStyles, newStyles) {
                        const changes = {};
                        
                        for (const [prop, newValue] of Object.entries(newStyles)) {
                            const oldValue = oldStyles[prop];
                            if (oldValue !== newValue && newValue !== '' && oldValue !== '') {
                                // Filter out minor pixel differences (browser rounding)
                                if (this.isSignificantChange(oldValue, newValue)) {
                                    changes[prop] = {
                                        from: oldValue,
                                        to: newValue
                                    };
                                }
                            }
                        }
                        
                        return changes;
                    }

                    isSignificantChange(oldValue, newValue) {
                        // Skip insignificant changes like sub-pixel differences
                        if (typeof oldValue === 'string' && typeof newValue === 'string') {
                            // For pixel values, ignore differences less than 1px
                            const oldPx = parseFloat(oldValue);
                            const newPx = parseFloat(newValue);
                            
                            if (!isNaN(oldPx) && !isNaN(newPx) && 
                                oldValue.includes('px') && newValue.includes('px')) {
                                return Math.abs(oldPx - newPx) >= 0.5;
                            }
                        }
                        
                        return true;
                    }

                    reportChange(element, changes, source) {
                        const changeData = {
                            selector: this.generateSelector(element),
                            classList: Array.from(element.classList || []),
                            changes: changes,
                            source: source,
                            timestamp: Date.now(),
                            elementInfo: {
                                tagName: element.tagName.toLowerCase(),
                                id: element.id || null,
                                classes: Array.from(element.classList || [])
                            }
                        };

                        // Send to content script
                        window.postMessage({
                            type: 'CSS_CHANGE_DETECTED',
                            data: changeData,
                            source: 'css-devtools-sync'
                        }, '*');

                        console.log('CSS change detected:', changeData);
                    }

                    generateSelector(element) {
                        // Generate intelligent selector
                        if (element.id) {
                            return '#' + element.id;
                        }

                        const classes = Array.from(element.classList || []);
                        
                        if (classes.length > 0) {
                            // Use the most specific class
                            const specificClass = this.findMostSpecificClass(classes);
                            return '.' + specificClass;
                        }

                        // Fallback to element path
                        return this.generateElementPath(element);
                    }

                    findMostSpecificClass(classes) {
                        // Prioritize classes that seem more specific
                        const specificityOrder = classes.sort((a, b) => {
                            // Longer class names often more specific
                            if (a.length !== b.length) {
                                return b.length - a.length;
                            }
                            
                            // Classes with hyphens often component-specific
                            const aHyphens = (a.match(/-/g) || []).length;
                            const bHyphens = (b.match(/-/g) || []).length;
                            
                            return bHyphens - aHyphens;
                        });
                        
                        return specificityOrder[0];
                    }

                    generateElementPath(element) {
                        const path = [];
                        let current = element;
                        
                        while (current && current !== document.body && path.length < 5) {
                            let selector = current.tagName.toLowerCase();
                            
                            // Add nth-child if needed for uniqueness
                            if (current.parentNode) {
                                const siblings = Array.from(current.parentNode.children)
                                    .filter(el => el.tagName === current.tagName);
                                
                                if (siblings.length > 1) {
                                    const index = siblings.indexOf(current) + 1;
                                    selector += ':nth-child(' + index + ')';
                                }
                            }
                            
                            path.unshift(selector);
                            current = current.parentNode;
                        }
                        
                        return path.join(' > ');
                    }
                }

                // Initialize the detector
                new CSSDevToolsDetector();
                console.log('CSS DevTools detector initialized');
            })();
        `;

        document.documentElement.appendChild(script);
        document.documentElement.removeChild(script);
        
        this.isInjected = true;
        console.log('CSS detector injected into page');
    }
}

// Initialize content bridge
new CSSContentBridge();