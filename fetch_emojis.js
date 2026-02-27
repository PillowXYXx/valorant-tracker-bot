const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildEmojisAndStickers
    ]
});

client.once('ready', async () => {
    const guild = client.guilds.cache.first();
    if (!guild) {
        console.error("No guild found.");
        process.exit(1);
    }
    
    console.log("Fetching emojis...");
    await guild.emojis.fetch();
    
    console.log("const EMOJIS = {");
    
    // Group 1: General UI
    console.log("    // --- General UI ---");
    const map = {
        'win': ['valorant', 'check'],
        'loss': ['accident', 'cross'],
        'draw': ['silver', 'draw'],
        'rank': ['radiant', 'rank'],
        'trophy': ['immortal', 'trophy'],
        'kda': ['jett', 'kda'],
        'hs': ['reyna', 'hs'],
        'agent': ['omen', 'agent'],
        'map': ['brimstone', 'map'],
        'trend': ['gold', 'trend'],
        'mvp': ['radiant', 'mvp'],
        'team_mvp': ['platinum', 'team_mvp'],
        'check': ['valorant', 'check'],
        'cross': ['accident', 'cross']
    };

    const usedIds = new Set();

    for (const [key, candidates] of Object.entries(map)) {
        let found = null;
        for (const name of candidates) {
            found = guild.emojis.cache.find(e => e.name.toLowerCase().includes(name));
            if (found) break;
        }
        if (found) {
            console.log(`    ${key}: '<:${found.name}:${found.id}>',`);
            usedIds.add(found.id);
        } else {
            console.log(`    ${key}: '❓', // Missing icon for ${key}`);
        }
    }

    // Group 2: Ranks
    console.log("\n    // --- Ranks ---");
    const ranks = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'ascendant', 'immortal', 'radiant'];
    for (const r of ranks) {
        const found = guild.emojis.cache.find(e => e.name.toLowerCase().startsWith(r));
        if (found) console.log(`    rank_${r}: '<:${found.name}:${found.id}>',`);
    }

    // Group 3: Agents
    console.log("\n    // --- Agents ---");
    guild.emojis.cache.forEach(e => {
        const name = e.name.toLowerCase();
        // Skip if already used in general UI mapping to avoid clutter, unless it's clearly an agent name
        // Simple heuristic: if it's not a rank name and not 'valorant'/'accident'
        if (!ranks.some(r => name.startsWith(r)) && !name.includes('valorant') && !name.includes('accident')) {
             console.log(`    agent_${name}: '<:${e.name}:${e.id}>',`);
        }
    });

    console.log("};");
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
