# @pipeworx/bis

BIS (Bank for International Settlements) MCP — central-bank statistics, SDMX. No auth.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `list_curated_flows(topic?)`
- `search_dataflows(query, limit?)`
- `fetch_dataset(flow_ref, key?, start_period?, end_period?, limit?)`

## Data source

`https://stats.bis.org/api/v2/`

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "bis": {
      "url": "https://gateway.pipeworx.io/bis/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Bis data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
