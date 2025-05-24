// Popup script for extension configuration
class PopupController {
    constructor() {
        this.statusEl = document.getElementById('status');
        this.statusTextEl = document.getElementById('status-text');
        this.currentDomainEl = document.getElementById('current-domain');
        this.projectPathEl = document.getElementById('project-path');
        this.domainMappingEl = document.getElementById('domain-mapping');
        this.setPathBtnEl = document.getElementById('set-path-btn');
        this.browseBtnEl = document.getElementById('browse-btn');
        
        this.currentDomain = '';
        this.init();
    }

    async init() {
        // Get current domain
        await this.getCurrentDomain();
        
        // Load saved settings
        await this.loadSettings();
        
        // Check server status
        await this.updateServerStatus();
        
        // Setup event listeners
        this.setPathBtnEl.addEventListener('click', () => this.saveConfiguration());
        this.browseBtnEl.addEventListener('click', () => this.browsePath());
        this.projectPathEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveConfiguration();
        });
        
        // Update status periodically
        setInterval(() => this.updateServerStatus(), 5000);
    }

    async getCurrentDomain() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                const url = new URL(tabs[0].url);
                this.currentDomain = url.hostname + (url.port ? ':' + url.port : '');
                this.currentDomainEl.textContent = this.currentDomain;
            }
        } catch (error) {
            console.error('Failed to get current domain:', error);
            this.currentDomainEl.textContent = 'Unknown';
        }
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['projectPath', 'domainMappings']);
            if (result.projectPath) {
                this.projectPathEl.value = result.projectPath;
            }
            if (result.domainMappings) {
                // Convert object back to text format
                const mappingText = Object.entries(result.domainMappings)
                    .map(([domain, path]) => `${domain} -> ${path}`)
                    .join('\n');
                this.domainMappingEl.value = mappingText;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async updateServerStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ 
                type: 'GET_SERVER_STATUS',
                domain: this.currentDomain 
            });
            
            if (response.connected) {
                const activePath = response.activePath || response.projectPath || 'Not set';
                this.setStatus('connected', `Connected - Active Path: ${activePath}`);
                this.setPathBtnEl.disabled = false;
            } else {
                this.setStatus('disconnected', 'Server not running on localhost:3001');
                this.setPathBtnEl.disabled = true;
            }
        } catch (error) {
            this.setStatus('disconnected', 'Connection failed');
            this.setPathBtnEl.disabled = true;
        }
    }

    setStatus(type, text) {
        this.statusEl.className = `status ${type}`;
        this.statusTextEl.textContent = text;
    }

    async browsePath() {
        // For now, show instructions since we can't directly browse in extension
        const instructions = `To set your CSS path:

1. Navigate to your CSS project folder
2. Copy the full path (e.g., /Users/username/project/css)
3. Paste it in the input field above

Examples:
• macOS/Linux: /Users/username/project/src/styles
• Windows: C:\\Users\\username\\project\\src\\styles
• Relative: ./src/styles (from server directory)`;

        alert(instructions);
    }

    parseDomainMappings(text) {
        const mappings = {};
        const lines = text.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            const match = line.match(/^(.+?)\s*->\s*(.+)$/);
            if (match) {
                const domain = match[1].trim();
                const path = match[2].trim();
                mappings[domain] = path;
            }
        }
        
        return mappings;
    }

    async saveConfiguration() {
        const projectPath = this.projectPathEl.value.trim();
        const domainMappingText = this.domainMappingEl.value.trim();
        
        if (!projectPath && !domainMappingText) {
            alert('Please enter either a default project path or domain-specific mappings');
            return;
        }

        this.setPathBtnEl.disabled = true;
        this.setPathBtnEl.textContent = 'Saving...';

        try {
            // Parse domain mappings
            const domainMappings = this.parseDomainMappings(domainMappingText);
            
            // Determine the active path for current domain
            let activePath = projectPath;
            if (this.currentDomain && domainMappings[this.currentDomain]) {
                activePath = domainMappings[this.currentDomain];
            }

            // Send to server
            const response = await chrome.runtime.sendMessage({
                type: 'SET_PROJECT_CONFIGURATION',
                data: { 
                    projectPath,
                    domainMappings,
                    currentDomain: this.currentDomain,
                    activePath
                }
            });

            if (response.success) {
                // Save to storage
                await chrome.storage.local.set({ 
                    projectPath,
                    domainMappings,
                    lastDomain: this.currentDomain
                });
                
                // Update status
                await this.updateServerStatus();
                
                // Show success
                this.setPathBtnEl.textContent = 'Saved!';
                setTimeout(() => {
                    this.setPathBtnEl.textContent = 'Save Configuration';
                    this.setPathBtnEl.disabled = false;
                }, 2000);
            } else {
                throw new Error(response.error || 'Failed to save configuration');
            }
        } catch (error) {
            alert(`Failed to save configuration: ${error.message}`);
            this.setPathBtnEl.textContent = 'Save Configuration';
            this.setPathBtnEl.disabled = false;
        }
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});