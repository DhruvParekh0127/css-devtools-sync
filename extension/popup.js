// Popup script for extension configuration
class PopupController {
    constructor() {
        this.statusEl = document.getElementById('status');
        this.statusTextEl = document.getElementById('status-text');
        this.projectPathEl = document.getElementById('project-path');
        this.setPathBtnEl = document.getElementById('set-path-btn');
        
        this.init();
    }

    async init() {
        // Load saved settings
        await this.loadSettings();
        
        // Check server status
        await this.updateServerStatus();
        
        // Setup event listeners
        this.setPathBtnEl.addEventListener('click', () => this.setProjectPath());
        this.projectPathEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.setProjectPath();
        });
        
        // Update status periodically
        setInterval(() => this.updateServerStatus(), 5000);
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['projectPath']);
            if (result.projectPath) {
                this.projectPathEl.value = result.projectPath;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async updateServerStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_SERVER_STATUS' });
            
            if (response.connected) {
                this.setStatus('connected', `Connected - Project: ${response.projectPath || 'Not set'}`);
                this.setPathBtnEl.disabled = false;
            } else {
                this.setStatus('disconnected', 'Server not running');
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

    async setProjectPath() {
        const path = this.projectPathEl.value.trim();
        if (!path) {
            alert('Please enter a valid project path');
            return;
        }

        this.setPathBtnEl.disabled = true;
        this.setPathBtnEl.textContent = 'Setting...';

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'SET_PROJECT_PATH',
                data: { path }
            });

            if (response.success) {
                // Save to storage
                await chrome.storage.local.set({ projectPath: path });
                
                // Update status
                await this.updateServerStatus();
                
                // Show success
                this.setPathBtnEl.textContent = 'Success!';
                setTimeout(() => {
                    this.setPathBtnEl.textContent = 'Set Project Path';
                    this.setPathBtnEl.disabled = false;
                }, 2000);
            } else {
                throw new Error(response.error || 'Failed to set project path');
            }
        } catch (error) {
            alert(`Failed to set project path: ${error.message}`);
            this.setPathBtnEl.textContent = 'Set Project Path';
            this.setPathBtnEl.disabled = false;
        }
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});