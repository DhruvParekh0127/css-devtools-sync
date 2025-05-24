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
        this.domainMappings = {}; // Map domains to specific paths
        this.cssFiles = new Map(); // Cache of CSS file contents
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors({
            origin: ['chrome-extension://*', 'http://localhost:*', 'https://*'],
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
                domainMappings: this.domainMappings,
                cssFilesLoaded: this.cssFiles.size,
                supportedDomains: Object.keys(this.domainMappings)
            });
        });

        // Set project configuration (replaces old set-project-path)
        this.app.post('/set-project-configuration', async (req, res) => {
            try {
                const { projectPath, domainMappings = {}, currentDomain, activePath } = req.body;
                
                console.log('Setting project configuration:', {
                    projectPath,
                    domainMappings,
                    currentDomain,
                    activePath
                });

                // Update configuration
                if (projectPath) {
                    this.projectPath = path.resolve(projectPath);
                }
                this.domainMappings = domainMappings;

                // Load CSS files for the active path
                const targetPath = activePath || projectPath;
                if (targetPath) {
                    await this.loadCSSFilesForPath(targetPath);
                }
                
                console.log(`Configuration updated. Active path: ${targetPath}`);
                console.log(`Domain mappings:`, this.domainMappings);
                console.log(`Loaded ${this.cssFiles.size} CSS files`);
                
                res.json({ 
                    success: true, 
                    projectPath: this.projectPath,
                    domainMappings: this.domainMappings,
                    activePath: targetPath,
                    filesLoaded: this.cssFiles.size
                });
            } catch (error) {
                console.error('Error setting project configuration:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Apply CSS change (enhanced for domain support)
        this.app.post('/apply-css-change', async (req, res) => {
            try {
                const changeData = req.body;
                const domain = changeData.domain;
                
                console.log(`Applying CSS change for domain: ${domain}`);
                
                // Determine target path for this domain
                let targetPath = this.projectPath;
                if (domain && this.domainMappings[domain]) {
                    targetPath = this.domainMappings[domain];
                    console.log(`Using domain-specific path: ${targetPath}`);
                } else if (changeData.targetPath) {
                    targetPath = changeData.targetPath;
                }

                if (!targetPath) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'No target path configured for this domain' 
                    });
                }

                // Load CSS files for this path if not already loaded
                await this.ensureCSSFilesLoaded(targetPath);

                const result = await this.applyCSSChange(changeData, targetPath);
                res.json(result);
            } catch (error) {
                console.error('Error applying CSS change:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get domain configuration
        this.app.get('/domain-config/:domain', (req, res) => {
            const domain = req.params.domain;
            const config = {
                domain,
                targetPath: this.domainMappings[domain] || this.projectPath,
                hasSpecificMapping: !!this.domainMappings[domain]
            };
            res.json(config);
        });
    }

    async ensureCSSFilesLoaded(targetPath) {
        // Check if we already have files loaded for this path
        const resolvedPath = path.resolve(targetPath);
        let hasFilesForPath = false;
        
        for (const [filePath] of this.cssFiles) {
            if (filePath.startsWith(resolvedPath)) {
                hasFilesForPath = true;
                break;
            }
        }
        
        if (!hasFilesForPath) {
            console.log(`Loading CSS files for path: ${resolvedPath}`);
            await this.loadCSSFilesForPath(resolvedPath);
        }
    }

    async loadCSSFilesForPath(targetPath) {
        if (!targetPath) return;

        try {
            const resolvedPath = path.resolve(targetPath);
            
            // Validate path exists
            const stats = await fs.stat(resolvedPath);
            if (!stats.isDirectory()) {
                throw new Error(`Path is not a directory: ${resolvedPath}`);
            }

            await this.scanDirectory(resolvedPath);
        } catch (error) {
            console.error('Error loading CSS files for path:', error);
            throw error;
        }
    }

    async scanDirectory(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip node_modules and other common directories
                    if (!['node_modules', '.git', '.vscode', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) {
                        await this.scanDirectory(fullPath);
                    }
                } else if (entry.isFile() && entry.name.endsWith('.css')) {
                    await this.loadCSSFile(fullPath);
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${dirPath}:`, error);
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
            
            console.log(`Loaded CSS file: ${filePath}`);
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

    async applyCSSChange(changeData, targetPath) {
        const { selectorVariations, changes, classList, domain } = changeData;
        
        if (!selectorVariations || !changes) {
            return { success: false, error: 'Invalid change data' };
        }

        console.log('Applying CSS change:', {
            domain,
            targetPath,
            variations: selectorVariations.length,
            changes: Object.keys(changes)
        });

        // Find the best matching CSS file and rule within the target path
        const match = await this.findBestMatch(selectorVariations, classList, targetPath);
        
        if (!match) {
            // Create new rule if no match found
            return await this.createNewRule(selectorVariations[0], changes, targetPath);
        }

        // Apply changes to existing rule
        return await this.updateExistingRule(match, changes, targetPath);
    }

    async findBestMatch(selectorVariations, classList, targetPath) {
        let bestMatch = null;
        let bestScore = 0;

        const resolvedTargetPath = path.resolve(targetPath);

        for (const [filePath, fileData] of this.cssFiles) {
            // Only consider files within the target path
            if (!filePath.startsWith(resolvedTargetPath)) {
                continue;
            }

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

    async updateExistingRule(match, changes, targetPath) {
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
            
            const relativePath = path.relative(targetPath, filePath);
            console.log(`Updated CSS rule in ${relativePath}: ${rule.selector}`);
            
            return {
                success: true,
                file: relativePath,
                fullPath: filePath,
                selector: rule.selector,
                changes: Object.keys(changes)
            };
        } catch (error) {
            console.error('Error updating CSS rule:', error);
            return { success: false, error: error.message };
        }
    }

    async createNewRule(selectorVariation, changes, targetPath) {
        // Find the most appropriate CSS file to add the new rule
        const targetFile = await this.findTargetFile(targetPath);
        
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
            
            const relativePath = path.relative(targetPath, targetFile);
            console.log(`Created new CSS rule in ${relativePath}: ${selectorVariation.selector}`);
            
            return {
                success: true,
                file: relativePath,
                fullPath: targetFile,
                selector: selectorVariation.selector,
                changes: Object.keys(changes),
                created: true
            };
        } catch (error) {
            console.error('Error creating CSS rule:', error);
            return { success: false, error: error.message };
        }
    }

    async findTargetFile(targetPath) {
        const resolvedTargetPath = path.resolve(targetPath);
        
        // Find CSS files within the target path
        let targetFile = null;
        let maxSize = 0;
        
        for (const [filePath, fileData] of this.cssFiles) {
            if (filePath.startsWith(resolvedTargetPath) && fileData.content.length > maxSize) {
                maxSize = fileData.content.length;
                targetFile = filePath;
            }
        }
        
        // If no CSS files found, create main.css in target directory
        if (!targetFile) {
            targetFile = path.join(resolvedTargetPath, 'main.css');
            await fs.writeFile(targetFile, '/* CSS DevTools Sync - Auto-generated */\n', 'utf8');
            await this.loadCSSFile(targetFile);
        }
        
        return targetFile;
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`CSS DevTools Sync Server running on http://localhost:${this.port}`);
            console.log('Ready to sync CSS changes from any domain to local files');
            console.log('Supported features:');
            console.log('  ✓ Any domain support (not just localhost)');
            console.log('  ✓ Domain-specific CSS path mapping');
            console.log('  ✓ Intelligent CSS selector matching');
            console.log('  ✓ Incremental updates only');
        });
    }
}

// Start the server
const cssSync = new CSSSync();
cssSync.start();