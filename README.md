# Sermon Manager

A web application for managing sermon schedules and sermon metadata, with AI-powered analysis and direct integration with Craft documents via MCP.

## Features

- 📅 **Calendar View**: Visual monthly calendar showing all scheduled sermons and lessons
- 📝 **Sermon Review**: AI-powered analysis to fill in sermon metadata (series, theme, hashtags, etc.)
- ⬇️ **Shift Down**: Easily reschedule multiple sermons when inserting special events
- 🔄 **Live Sync**: Changes are saved directly to your Craft documents
- 🎨 **Color-coded**: Benjamin's sermons in blue, other preachers in orange

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Express.js
- **API Integration**: Craft MCP / Direct Craft API
- **AI**: Claude API for sermon analysis

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Craft API Configuration
CRAFT_API_KEY=your-craft-api-key
CRAFT_SPACE_ID=your-space-id

# MCP Server (if using MCP proxy)
MCP_SERVER_URL=http://localhost:3002

# Claude API (for AI analysis)
CLAUDE_API_KEY=your-claude-api-key

# Server port
PORT=3001
```

### 3. Configure Collection IDs

Edit `server.js` and update the `COLLECTIONS` object with your actual Craft collection IDs:

```javascript
const COLLECTIONS = {
  sermons: '6',           // Your Sermons collection ID
  schedule: '3',          // Your Bible Teaching Overview collection ID
  hashtags: '5',          // Your Hashtag Reference Guide collection ID
  series: '4'             // Your Sermon Series collection ID
};
```

### 4. Start the Application

**Development mode (with hot reload):**

```bash
# Terminal 1: Start the backend server
npm run server

# Terminal 2: Start the frontend dev server
npm run dev
```

**Production build:**

```bash
npm run build
npm run server
```

Then visit `http://localhost:3000`

## Connecting to Craft

### Option 1: Using MCP Directly

If you have the Craft MCP server running, the backend will communicate with it at `MCP_SERVER_URL`.

### Option 2: Using Craft's Direct API

1. Get your API key from Craft's developer settings
2. Set `CRAFT_API_KEY` in your environment
3. Modify `server.js` to use Craft's REST API directly

### Option 3: Custom MCP Proxy

Create a simple proxy server that translates HTTP requests to MCP tool calls:

```javascript
// mcp-proxy.js
import { MCPClient } from '@anthropic/mcp-sdk';

// ... proxy implementation
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/sermons` | GET | Get all sermons |
| `/api/sermons/:id` | PUT | Update a sermon |
| `/api/schedule` | GET | Get schedule entries |
| `/api/schedule` | POST | Add schedule entry |
| `/api/schedule/:id` | PUT | Update schedule entry |
| `/api/schedule/:id` | DELETE | Delete schedule entry |
| `/api/schedule/batch-update` | POST | Batch update dates (for shift) |
| `/api/hashtags` | GET | Get hashtag reference |
| `/api/analyze-sermon` | POST | AI sermon analysis |

## Deployment

### Deploy to Railway, Render, or Fly.io

1. Push to GitHub
2. Connect your repo to the deployment platform
3. Set environment variables
4. Deploy!

### Deploy with Claude Code

```bash
# In Claude Code
claude deploy --name sermon-manager
```

## File Structure

```
sermon-manager-app/
├── src/
│   ├── App.jsx          # Main React component
│   ├── api.js           # API service layer
│   ├── constants.js     # Configuration constants
│   ├── main.jsx         # React entry point
│   └── index.css        # Tailwind styles
├── public/
│   └── favicon.svg      # App icon
├── server.js            # Express backend
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

## Customization

### Adding New Preachers

Edit `src/constants.js`:

```javascript
export const PREACHERS = [
  "Benjamin",
  "Boss",
  // Add new preachers here
];
```

### Adding New Special Events

Edit `src/constants.js`:

```javascript
export const SPECIAL_EVENTS = [
  "Christmas",
  // Add new events here
];
```

### Changing Colors

Edit `tailwind.config.js`:

```javascript
colors: {
  'parchment': '#f5f1e8',
  'ink': '#2c2416',
  'gold': '#c9a227',
  'burgundy': '#722f37',
  'sage': '#87ae73',
}
```

## License

MIT License - Feel free to use and modify for your ministry!
