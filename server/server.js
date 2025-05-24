const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');

class CSSSync {
    constructor() {
        this.app = express();
        this.port = 3001;
        this.projectPath = null;
        this.cssFiles = new Map(); // Cache of CSS file contents
        this.setupMiddleware();
        this.setupRoutes();
        this.setupFileWatcher();
    }

    setupMiddleware() {
        this.app.use(cors({
            origin: ['chrome-extension://*', 'http://localhost:*'],
            credentials: true
        }));
        this.app.use(express.json());
        
        // Log all requests
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/status', (req, res) => {
            res.json({
                status: 'running',
                projectPath: this.projectPath,
                cssFilesLoaded: this.cssFiles.size
            });
        });

        // Set project path
        this.app.post('/set-project-path', async (req, res) => {
            try {
                const { path: projectPath } = req.body;
                
                if (!projectPath) {
                    return res.status(400).json({ success: false, error: 'Path is required' });
                }

                // Validate path exists
                const stats = await fs.stat(projectPath);
                if (!stats.isDirectory()) {
                    return res.status(400).json({ success: false, error: 'Path must be a directory' });
                }

                this.projectPath = path.resolve(projectPath);
                await this.loadCSSFiles();
                
                console.log(`Project path set to: ${this.projectPath}`);
                console.log(`Loaded ${this.cssFiles.size} CSS files`);
                
                res.json({ 
                    success: true, 
                    path: this.projectPath,
                    filesLoaded: this.cssFiles.size
                });
            } catch (error) {
                console.error('Error setting project path:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Apply CSS change
        this.app.post('/apply-css-change', async (req, res) => {
            try {
                if (!this.projectPath) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Project path not set' 
                    });
                }

                const result = await this.applyCSSChange(req.body);
                res.json(result);
            } catch (error) {
                console.error('Error applying CSS change:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    setupFileWatcher() {
        // We'll set this up when project path is configured
    }

    async loadCSSFiles() {
        if (!this.projectPath) return;

        this.cssFiles.clear();
        
        try {
            await this.scanDirectory(this.projectPath);
        } catch (error) {
            console.error('Error loading CSS files:', error);
        }
    }

    async scanDirectory(dirPath) {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                // Skip node_modules and other common directories
                if (!['node_modules', '.git', '.vscode', 'dist', 'build'].includes(entry.name)) {
                    await this.scanDirectory(fullPath);
                }
            } else if (entry.isFile() && entry.name.endsWith('.css')) {
                await this.loadCSSFile(fullPath);
            }
        }
    }

    async loadCSSFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const parsedCSS = this.parseCSS(content);
            
            this.cssFiles.set(filePath, {
                content,
                parsed: parsedCSS,
                lastModified: new Date()
            });
            
            console.log(`Loaded CSS file: ${path.relative(this.projectPath, filePath)}`);
        } catch (error) {
            console.error(`Error loading CSS file ${filePath}:`, error);
        }
    }

    parseCSS(content) {
        const rules = [];
        const ruleRegex = /([^{]+)\{([^}]+)\}/g;
        let match;

        while ((match = ruleRegex.exec(content)) !== null) {
            const selector = match[1].trim();
            const declarations = match[2].trim();
            
            const properties = {};
            const propRegex = /([^:;]+):([^;]+)/g;
            let propMatch;
            
            while ((propMatch = propRegex.exec(declarations)) !== null) {
                const property = propMatch[1].trim();
                const value = propMatch[2].trim();
                properties[property] = value;
            }
            
            rules.push({
                selector,
                properties,
                startIndex: match.index,
                endIndex: match.index + match[0].length
            });
        }
        
        return rules;
    }

    async applyCSSChange(changeData) {
        const { selectorVariations, changes, classList } = changeData;
        
        if (!selectorVariations || !changes) {
            return { success: false, error: 'Invalid change data' };
        }

        console.log('Applying CSS change:', {
            variations: selectorVariations.length,
            changes: Object.keys(changes)
        });

        // Find the best matching CSS file and rule
        const match = await this.findBestMatch(selectorVariations, classList);
        
        if (!match) {
            // Create new rule if no match found
            return await this.createNewRule(selectorVariations[0], changes);
        }

        // Apply changes to existing rule
        return await this.updateExistingRule(match, changes);
    }

    async findBestMatch(selectorVariations, classList) {
        let bestMatch = null;
        let bestScore = 0;

        for (const [filePath, fileData] of this.cssFiles) {
            for (const rule of fileData.parsed) {
                for (const variation of selectorVariations) {
                    const score = this.calculateMatchScore(rule.selector, variation.selector, classList);
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = {
                            filePath,
                            rule,
                            matchedSelector: variation.selector,
                            score
                        };
                    }
                }
            }
        }

        console.log(`Best match found with score ${bestScore}:`, bestMatch?.rule?.selector);
        
        // Only accept matches with reasonable confidence
        return bestScore > 50 ? bestMatch : null;
    }

    calculateMatchScore(cssSelector, targetSelector, classList) {
        let score = 0;
        
        // Exact match gets highest score
        if (cssSelector === targetSelector) {
            return 100;
        }
        
        // Clean selectors for comparison
        const cleanCSS = cssSelector.replace(/\s+/g, ' ').trim();
        const cleanTarget = targetSelector.replace(/\s+/g, ' ').trim();
        
        // Class-based matching
        if (classList && classList.length > 0) {
            for (const className of classList) {
                if (cleanCSS.includes(`.${className}`)) {
                    score += 30;
                }
            }
        }
        
        // Partial selector matching
        const cssTokens = cleanCSS.split(/[\s>+~]/).filter(t => t);
        const targetTokens = cleanTarget.split(/[\s>+~]/).filter(t => t);
        
        for (const token of targetTokens) {
            if (cssTokens.includes(token)) {
                score += 20;
            }
        }
        
        // Penalize overly generic selectors
        if (cleanCSS.length < 3) {
            score -= 10;
        }
        
        return Math.max(0, score);
    }

    async updateExistingRule(match, changes) {
        const { filePath, rule } = match;
        const fileData = this.cssFiles.get(filePath);
        
        if (!fileData) {
            return { success: false, error: 'File data not found' };
        }

        try {
            let updatedContent = fileData.content;
            let newProperties = { ...rule.properties };
            
            // Apply changes to properties
            for (const [property, change] of Object.entries(changes)) {
                if (typeof change === 'object' && change.to) {
                    newProperties[property] = change.to;
                } else {
                    newProperties[property] = change;
                }
            }
            
            // Reconstruct the CSS rule
            const newDeclarations = Object.entries(newProperties)
                .map(([prop, value]) => `  ${prop}: ${value}`)
                .join(';\n');
            
            const newRule = `${rule.selector} {\n${newDeclarations};\n}`;
            
            // Replace the old rule in content
            const beforeRule = updatedContent.substring(0, rule.startIndex);
            const afterRule = updatedContent.substring(rule.endIndex);
            updatedContent = beforeRule + newRule + afterRule;
            
            // Write back to file
            await fs.writeFile(filePath, updatedContent, 'utf8');
            
            // Update cache
            await this.loadCSSFile(filePath);
            
            const relativePath = path.relative(this.projectPath, filePath);
            console.log(`Updated CSS rule in ${relativePath}: ${rule.selector}`);
            
            return {
                success: true,
                file: relativePath,
                selector: rule.selector,
                changes: Object.keys(changes)
            };
        } catch (error) {
            console.error('Error updating CSS rule:', error);
            return { success: false, error: error.message };
        }
    }

    async createNewRule(selectorVariation, changes) {
        // Find the most appropriate CSS file to add the new rule
        const targetFile = await this.findTargetFile();
        
        if (!targetFile) {
            return { success: false, error: 'No suitable CSS file found' };
        }

        try {
            const properties = Object.entries(changes)
                .map(([prop, change]) => {
                    const value = typeof change === 'object' && change.to ? change.to : change;
                    return `  ${prop}: ${value}`;
                })
                .join(';\n');
            
            const newRule = `\n\n${selectorVariation.selector} {\n${properties};\n}`;
            
            // Append to file
            const fileData = this.cssFiles.get(targetFile);
            const updatedContent = fileData.content + newRule;
            
            await fs.writeFile(targetFile, updatedContent, 'utf8');
            await this.loadCSSFile(targetFile);
            
            const relativePath = path.relative(this.projectPath, targetFile);
            console.log(`Created new CSS rule in ${relativePath}: ${selectorVariation.selector}`);
            
            return {
                success: true,
                file: relativePath,
                selector: selectorVariation.selector,
                changes: Object.keys(changes),
                created: true
            };
        } catch (error) {
            console.error('Error creating CSS rule:', error);
            return { success: false, error: error.message };
        }
    }

    async findTargetFile() {
        // Simple heuristic: use the largest CSS file or create/use main.css
        let targetFile = null;
        let maxSize = 0;
        
        for (const [filePath, fileData] of this.cssFiles) {
            if (fileData.content.length > maxSize) {
                maxSize = fileData.content.length;
                targetFile = filePath;
            }
        }
        
        // If no CSS files, create main.css
        if (!targetFile) {
            targetFile = path.join(this.projectPath, 'main.css');
            await fs.writeFile(targetFile, '/* CSS DevTools Sync */\n', 'utf8');
            await this.loadCSSFile(targetFile);
        }
        
        return targetFile;
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`CSS DevTools Sync Server running on http://localhost:${this.port}`);
            console.log('Ready to sync CSS changes from Chrome DevTools');
        });
    }
}

// Start the server
const cssSync = new CSSSync();
cssSync.start();