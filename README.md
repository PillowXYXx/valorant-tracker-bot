# Valorant Tracker Discord Bot

A simple Discord bot to track Valorant match history using the unofficial Valorant API.

## Prerequisites

- Node.js installed
- A Discord Bot Token (from [Discord Developer Portal](https://discord.com/developers/applications))

## Setup

1.  Clone or download this repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in the root directory (or rename `.env.example` if provided) and add your Discord Bot Token:
    ```env
    DISCORD_TOKEN=your_token_here
    ```

## Usage

Start the bot:
```bash
npm start
```

## Commands

- `/val region:<region> name:<name> tag:<tag>`
  - Example: `/val region:na name:sensitivity tag:1`
  - Fetches the last 5 matches for the specified player.

## Regions
- na (North America)
- eu (Europe)
- ap (Asia Pacific)
- kr (Korea)
- latam (Latin America)
- br (Brazil)

## How to Invite the Bot

1.  Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2.  Click on your application (**Valorent tracker**).
3.  Click on **OAuth2** -> **URL Generator**.
4.  Under **Scopes**, select:
    - `bot`
    - `applications.commands`
5.  Under **Bot Permissions**, select:
    - `Send Messages`
    - `Embed Links`
    - `Read Message History`
6.  Copy the generated URL at the bottom and open it in your browser to invite the bot to your server.
