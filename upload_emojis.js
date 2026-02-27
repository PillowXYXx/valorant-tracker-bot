const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildEmojisAndStickers
    ]
});

// Map your bot's usage keys to the filenames you have
const EMOJI_MAPPING = {
    'win': 'valorant.png',       // Victory
    'loss': 'accident.png',      // Defeat
    'draw': 'silver.png',        // Draw
    'rank': 'radiant.png',       // Rank icon
    'trophy': 'immortal.png',    // Win Rate
    'kda': 'jett.png',           // Duelist for K/D
    'hs': 'reyna.png',           // Headhunter
    'agent': 'omen.png',         // Mystery agent
    'map': 'brimstone.png',      // Map controller
    'trend': 'gold.png',         // Bar chart lookalike
    'mvp': 'radiant.png',        // MVP Crown
    'team_mvp': 'platinum.png',  // Team MVP
    'check': 'valorant.png',     // Checkmark replacement
    'cross': 'accident.png'      // Cross replacement
};

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    
    // Get the first guild the bot is in
    const guild = client.guilds.cache.first();
    if (!guild) {
        console.error("❌ Bot is not in any server!");
        process.exit(1);
    }

    console.log(`🚀 Uploading emojis to server: ${guild.name}`);
    console.log(`📂 Reading from ./emojis folder...`);

    const emojiDir = path.join(__dirname, 'emojis');
    if (!fs.existsSync(emojiDir)) {
        console.error("❌ Emojis folder not found!");
        process.exit(1);
    }

    const files = fs.readdirSync(emojiDir).filter(f => f.endsWith('.png'));
    const uploadedEmojis = {};

    console.log(`Found ${files.length} images.`);

    for (const file of files) {
        const name = path.parse(file).name.replace(/[^a-zA-Z0-9_]/g, '_'); // Sanitize name
        
        try {
            // Check if emoji already exists
            let emoji = guild.emojis.cache.find(e => e.name === name);
            
            if (!emoji) {
                console.log(`Uploading ${name}...`);
                emoji = await guild.emojis.create({ attachment: path.join(emojiDir, file), name: name });
                // Rate limit buffer
                await new Promise(r => setTimeout(r, 1500));
            } else {
                console.log(`Skipping ${name} (already exists)`);
            }
            
            uploadedEmojis[file] = `<:${emoji.name}:${emoji.id}>`;
            
        } catch (error) {
            console.error(`❌ Failed to upload ${name}: ${error.message}`);
            if (error.code === 50013) {
                console.error("⚠️  MISSING PERMISSIONS: Please give the bot 'Manage Emojis and Stickers' permission in Server Settings > Roles.");
                process.exit(1);
            }
            if (error.code === 30008) {
                console.error("⚠️  MAX EMOJIS REACHED: The server has no more emoji slots!");
                break;
            }
        }
    }

    console.log("\n✅ Upload Complete! Here is your new config block for index.js:\n");
    
    console.log("const EMOJIS = {");
    for (const [key, filename] of Object.entries(EMOJI_MAPPING)) {
        const emojiCode = uploadedEmojis[filename] || '❓';
        console.log(`    ${key}: '${emojiCode}', // from ${filename}`);
    }
    console.log("};");

    console.log("\nCopy the block above and replace the EMOJIS section in index.js!");
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
