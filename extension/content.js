// Content script to bridge DevTools and extension
class CSSContentBridge {
    constructor() {
        this.isInjected = false;
        this.isDevToolsOpen = false;
        this.developerChangeMode = false;
        this.init();
    }

    init() {
        // Detect if DevTools is open
        this.detectDevToolsState();
        
        // Listen for messages from the page (DevTools detector)
        window.addEventListener('message', (event) => {
            // Only accept messages from same origin
            if (event.source !== window) return;
            
            if (event.data.type === 'CSS_CHANGE_DETECTED' && event.data.source === 'css-devtools-sync') {
                // Only forward if it's a developer change
                if (this.isDeveloperChange(event.data.data)) {
                    chrome.runtime.sendMessage({
                        type: 'CSS_CHANGE_DETECTED',
                        data: event.data.data
                    });
                }
            } else if (event.data.type === 'DEVTOOLS_INTERACTION_START') {
                this.developerChangeMode = true;
                setTimeout(() => { this.developerChangeMode = false; }, 5000); // 5 second window
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
                    elementsWithClasses: document.querySelectorAll('[class]').length,
                    devToolsOpen: this.isDevToolsOpen
                });
            }
        });

        console.log('CSS DevTools Sync content script loaded');
    }

    detectDevToolsState() {
        // Method to detect if DevTools is open
        let devtools = {
            open: false,
            orientation: null
        };
        
        setInterval(() => {
            if (window.outerHeight - window.innerHeight > 200 || window.outerWidth - window.innerWidth > 200) {
                if (!devtools.open) {
                    devtools.open = true;
                    this.isDevToolsOpen = true;
                    console.log('DevTools opened');
                }
            } else {
                if (devtools.open) {
                    devtools.open = false;
                    this.isDevToolsOpen = false;
                    this.developerChangeMode = false;
                    console.log('DevTools closed');
                }
            }
        }, 1000);
    }

    isDeveloperChange(changeData) {
        // Multiple criteria to determine if this is a developer-initiated change
        const criteria = {
            devToolsOpen: this.isDevToolsOpen,
            recentInteraction: this.developerChangeMode,
            changeSource: changeData.source === 'direct', // Direct style attribute changes
            changeType: this.isManualChangePattern(changeData),
            elementContext: this.isElementInEditableContext(changeData)
        };

        console.log('Change criteria:', criteria);

        // Must meet multiple criteria to be considered a developer change
        return criteria.devToolsOpen && 
               (criteria.recentInteraction || criteria.changeSource) &&
               criteria.changeType;
    }

    isManualChangePattern(changeData) {
        // Check if the change pattern suggests manual editing
        const changes = changeData.changes || {};
        
        // Common patterns of automated changes to ignore
        const automatedPatterns = [
            // Animation-related changes
            /transform|translate|rotate|scale/i,
            /opacity.*0\.|opacity.*1\.0*$/,
            // Slider/carousel changes
            /left.*px|right.*px|top.*px/,
            // Third-party library changes
            /transition|animation/i,
            // Rapid sequential changes (likely programmatic)
        ];

        // Check if any change matches automated patterns
        for (const [property, value] of Object.entries(changes)) {
            const changeValue = typeof value === 'object' ? value.to : value;
            
            for (const pattern of automatedPatterns) {
                if (pattern.test(property) || pattern.test(changeValue)) {
                    console.log('Filtered out automated change:', property, changeValue);
                    return false;
                }
            }
        }

        // Check for common developer change patterns
        const developerPatterns = [
            // Color changes
            /color|background/i,
            // Typography changes
            /font-size|font-weight|font-family/i,
            // Layout changes
            /margin|padding|width|height|display/i,
            // Border changes
            /border/i
        ];

        for (const [property] of Object.entries(changes)) {
            for (const pattern of developerPatterns) {
                if (pattern.test(property)) {
                    return true;
                }
            }
        }

        return true; // Default to allowing if uncertain
    }

    isElementInEditableContext(changeData) {
        // Check if the element is in a context where manual editing makes sense
        const selector = changeData.selector;
        const classList = changeData.classList || [];

        // Skip elements that are commonly animated or dynamic
        const skipPatterns = [
            /slider|carousel|banner|marquee/i,
            /animate|transition|loading|spinner/i,
            /progress|tooltip|modal|popup/i
        ];

        for (const className of classList) {
            for (const pattern of skipPatterns) {
                if (pattern.test(className)) {
                    console.log('Skipped element with dynamic class:', className);
                    return false;
                }
            }
        }

        return true;
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
                        this.recentInteractions = new Set();
                        this.changeDebouncer = new Map();
                        this.setupDetection();
                        window.cssDevToolsSync = this;
                    }

                    setupDetection() {
                        // Method 1: Direct style attribute observation (most reliable for manual changes)
                        this.setupStyleObserver();
                        
                        // Method 2: DevTools interaction detection
                        this.setupDevToolsInteractionDetection();
                        
                        // Method 3: Computed style monitoring (with heavy filtering)
                        this.setupSelectiveComputedStyleMonitor();
                    }

                    setupDevToolsInteractionDetection() {
                        // Detect when developer is actively using DevTools
                        document.addEventListener('keydown', (e) => {
                            // F12 or Ctrl/Cmd+Shift+I (DevTools shortcuts)
                            if (e.key === 'F12' || 
                                ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I')) {
                                this.signalDevToolsInteraction();
                            }
                        });

                        // Detect right-click -> Inspect Element
                        document.addEventListener('contextmenu', (e) => {
                            setTimeout(() => this.signalDevToolsInteraction(), 100);
                        });
                    }

                    signalDevToolsInteraction() {
                        window.postMessage({
                            type: 'DEVTOOLS_INTERACTION_START',
                            source: 'css-devtools-sync'
                        }, '*');
                    }

                    setupStyleObserver() {
                        const observer = new MutationObserver((mutations) => {
                            mutations.forEach((mutation) => {
                                if (mutation.type === 'attributes' && 
                                    mutation.attributeName === 'style') {
                                    
                                    // Debounce rapid changes (likely programmatic)
                                    this.debouncedHandleStyleChange(mutation.target);
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

                    debouncedHandleStyleChange(element) {
                        const elementKey = this.getElementKey(element);
                        
                        // Clear existing timeout
                        if (this.changeDebouncer.has(elementKey)) {
                            clearTimeout(this.changeDebouncer.get(elementKey));
                        }

                        // Set new timeout - only process if change is stable for 500ms
                        const timeout = setTimeout(() => {
                            this.handleDirectStyleChange(element);
                            this.changeDebouncer.delete(elementKey);
                        }, 500);

                        this.changeDebouncer.set(elementKey, timeout);
                    }

                    getElementKey(element) {
                        return element.tagName + '_' + Array.from(element.classList).join('_') + '_' + (element.id || '');
                    }

                    setupSelectiveComputedStyleMonitor() {
                        // Much more conservative computed style monitoring
                        const checkInterval = setInterval(() => {
                            // Only check when likely in development mode
                            if (this.isLikelyDevelopmentContext()) {
                                this.selectiveStyleCheck();
                            }
                        }, 3000); // Less frequent checking

                        window.addEventListener('beforeunload', () => {
                            clearInterval(checkInterval);
                        });
                    }

                    isLikelyDevelopmentContext() {
                        // Heuristics to determine if developer is actively working
                        return window.location.hostname === 'localhost' ||
                               window.location.hostname === '127.0.0.1' ||
                               window.location.protocol === 'file:' ||
                               (window.outerHeight - window.innerHeight > 200); // DevTools likely open
                    }

                    selectiveStyleCheck() {
                        // Only check specific elements that are commonly edited
                        const editableSelectors = [
                            '[contenteditable]',
                            '.editable',
                            '[data-editable]',
                            // Add more specific selectors for elements you typically edit
                        ];

                        editableSelectors.forEach(selector => {
                            const elements = document.querySelectorAll(selector);
                            elements.forEach(element => this.checkElementForChanges(element));
                        });
                    }

                    checkElementForChanges(element) {
                        const elementId = this.getElementKey(element);
                        const currentStyles = this.captureRelevantStyles(element);
                        const previousStyles = this.styleMap.get(element);

                        if (previousStyles) {
                            const changes = this.compareStyles(previousStyles, currentStyles);
                            if (Object.keys(changes).length > 0 && this.isSignificantChange(changes)) {
                                this.reportChange(element, changes, 'computed');
                                this.styleMap.set(element, currentStyles);
                            }
                        } else {
                            this.styleMap.set(element, currentStyles);
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

                        // Only report if changes seem manual
                        if (this.looksLikeManualChange(changes)) {
                            this.reportChange(element, changes, 'direct');
                        }
                    }

                    looksLikeManualChange(changes) {
                        // Filter out common automated changes
                        const automatedProperties = [
                            'transform', 'translateX', 'translateY', 'translateZ',
                            'opacity', 'animation-duration', 'transition-duration',
                            'left', 'top', 'right', 'bottom' // Common for sliders
                        ];

                        for (const prop in changes) {
                            if (automatedProperties.includes(prop)) {
                                console.log('Filtered automated property:', prop);
                                return false;
                            }
                        }

                        return true;
                    }

                    captureRelevantStyles(element) {
                        const computed = window.getComputedStyle(element);
                        // Focus on properties developers typically change
                        const developerProps = [
                            'color', 'background-color', 'font-size', 'font-weight', 
                            'font-family', 'margin', 'padding', 'border', 'width', 'height',
                            'display', 'text-align', 'line-height'
                        ];

                        const styles = {};
                        developerProps.forEach(prop => {
                            styles[prop] = computed.getPropertyValue(prop);
                        });

                        return styles;
                    }

                    compareStyles(oldStyles, newStyles) {
                        const changes = {};
                        
                        for (const [prop, newValue] of Object.entries(newStyles)) {
                            const oldValue = oldStyles[prop];
                            if (oldValue !== newValue && newValue !== '' && oldValue !== '') {
                                if (this.isSignificantStyleChange(prop, oldValue, newValue)) {
                                    changes[prop] = {
                                        from: oldValue,
                                        to: newValue
                                    };
                                }
                            }
                        }
                        
                        return changes;
                    }

                    isSignificantStyleChange(property, oldValue, newValue) {
                        // Skip insignificant changes
                        if (typeof oldValue === 'string' && typeof newValue === 'string') {
                            // For pixel values, ignore differences less than 1px
                            const oldPx = parseFloat(oldValue);
                            const newPx = parseFloat(newValue);
                            
                            if (!isNaN(oldPx) && !isNaN(newPx) && 
                                oldValue.includes('px') && newValue.includes('px')) {
                                return Math.abs(oldPx - newPx) >= 1; // At least 1px difference
                            }

                            // For colors, ignore very similar colors
                            if (property.includes('color')) {
                                return this.isSignificantColorChange(oldValue, newValue);
                            }
                        }
                        
                        return true;
                    }

                    isSignificantColorChange(oldColor, newColor) {
                        // Simple color change detection - can be enhanced
                        return oldColor !== newColor;
                    }

                    isSignificantChange(changes) {
                        // Must have at least one meaningful property change
                        const meaningfulProps = ['color', 'background-color', 'font-size', 'margin', 'padding'];
                        return Object.keys(changes).some(prop => meaningfulProps.includes(prop));
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

                        console.log('Reporting CSS change:', changeData);

                        // Send to content script
                        window.postMessage({
                            type: 'CSS_CHANGE_DETECTED',
                            data: changeData,
                            source: 'css-devtools-sync'
                        }, '*');
                    }

                    generateSelector(element) {
                        if (element.id) {
                            return '#' + element.id;
                        }

                        const classes = Array.from(element.classList || []);
                        
                        if (classes.length > 0) {
                            const specificClass = this.findMostSpecificClass(classes);
                            return '.' + specificClass;
                        }

                        return this.generateElementPath(element);
                    }

                    findMostSpecificClass(classes) {
                        const specificityOrder = classes.sort((a, b) => {
                            if (a.length !== b.length) {
                                return b.length - a.length;
                            }
                            
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
                console.log('Enhanced CSS DevTools detector initialized - Manual changes only');
            })();
        `;

        document.documentElement.appendChild(script);
        document.documentElement.removeChild(script);
        
        this.isInjected = true;
        console.log('Enhanced CSS detector injected - filtering automated changes');
    }
}

// Initialize content bridge
new CSSContentBridge();