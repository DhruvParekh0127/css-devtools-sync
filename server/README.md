# CSS DevTools Sync

A Chrome extension that intelligently syncs CSS changes from DevTools to local CSS files with smart change detection and selector matching.

## Features

- **Incremental Updates**: Only syncs the exact properties that changed, never dumps all computed styles
- **Smart Selector Matching**: Handles multiple classes correctly (e.g., `class="btn btn-primary"` matches `.btn` in CSS)
- **Real-time Sync**: Changes made in DevTools immediately update local CSS files
- **Preserve Existing CSS**: Updates only changed properties without overwriting entire rules
- **Intelligent Change Detection**: Filters out insignificant changes and browser rounding differences

## Installation

### 1. Install the Chrome Extension

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The CSS DevTools Sync extension should now appear in your extensions

### 2. Set Up the Node.js Server

1. Navigate to the server directory:
   ```bash
   cd css-devtools-sync-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```
   
   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

The server will run on `http://localhost:3001`

## Usage

### 1. Configure the Extension

1. Click the CSS DevTools Sync extension icon in Chrome
2. Set your CSS project folder path (where your CSS files are located)
3. Ensure the status shows "Connected"

### 2. Start Syncing

1. Open Chrome DevTools (F12)
2. Navigate to the "CSS Sync" panel in DevTools
3. Click "Start Sync"
4. The panel will show "CSS Sync is active"

### 3. Make Changes

1. In the Elements panel, modify CSS properties directly
2. Changes will be automatically detected and synced to your local files
3. Check the "Activity Log" in the CSS Sync panel to see what changes were applied

## How It Works

### Change Detection

The extension uses multiple methods to detect CSS changes:

1. **Direct Style Monitoring**: Watches for changes to inline `style` attributes
2. **Computed Style Tracking**: Periodically checks for changes in computed styles
3. **DevTools Integration**: Hooks into Chrome's DevTools API for real-time change detection

### Smart Selector Matching

When you have HTML like:
```html
<div class="sdst-subtitle sdst-discount-amount-upto-desktop">Text</div>
```

And CSS like:
```css
.sdst-subtitle {
  font-size: 14px;
  color: #333;
}
```

The extension intelligently matches changes to the correct CSS rule by:
- Generating multiple selector variations
- Scoring matches based on class overlap and specificity
- Choosing the best matching rule for updates

### File Updates

The Node.js server:
- Parses existing CSS files to understand current rules
- Finds the best matching rule for each change
- Updates only the specific properties that changed
- Preserves all other CSS properties and formatting
- Creates new rules if no suitable match is found

## Project Structure

```
css-devtools-sync/
├── extension/
│   ├── manifest.json          # Extension configuration
│   ├── background.js          # Background script for change processing
│   ├── content.js             # Content script bridge
│   ├── devtools.html          # DevTools page entry
│   ├── devtools.js            # DevTools change detection
│   ├── panel.html             # DevTools panel UI
│   ├── panel.js               # DevTools panel logic
│   ├── popup.html             # Extension popup UI
│   └── popup.js               # Extension popup logic
└── server/
    ├── server.js              # Node.js server for file updates
    ├── package.json           # Server dependencies
    └── README.md              # This file
```

## Configuration

### Server Settings

The server can be configured by modifying `server.js`:
- **Port**: Default is 3001, change `this.port = 3001`
- **CORS Origins**: Modify the `cors()` configuration
- **File Extensions**: Currently supports `.css`, extend in `scanDirectory()`

### Extension Settings

Settings are stored in Chrome's local storage:
- **Project Path**: Set via the extension popup
- **Server URL**: Default is `http://localhost:3001`

## Troubleshooting

### Extension Not Detecting Changes

1. Ensure the DevTools panel is open and "Start Sync" is clicked
2. Check the browser console for error messages
3. Verify the extension has permission to access the current site

### Server Connection Issues

1. Confirm the server is running on port 3001
2. Check that CORS is properly configured
3. Ensure no firewall is blocking the connection

### Changes Not Syncing to Files

1. Verify the project path is set correctly
2. Check that CSS files are readable and writable
3. Look at the server console for error messages
4. Ensure the CSS files are valid and parseable

### No Matching CSS Rules Found

1. The extension will create new rules if no match is found
2. Check that your CSS files are in the configured project path
3. Verify that the CSS selectors are reasonably specific

## Development

### Building the Extension

No build process is required - the extension runs directly from source files.

### Testing

1. Load the extension in Chrome
2. Navigate to a webpage with CSS
3. Open DevTools and start the CSS Sync
4. Make changes and verify they appear in your CSS files

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please create an issue in the GitHub repository.