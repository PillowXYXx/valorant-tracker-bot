const http = require('http');
require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
    AttachmentBuilder,
    PermissionFlagsBits,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus,
    entersState,
    generateDependencyReport,
    getVoiceConnection,
    NoSubscriberBehavior
} = require('@discordjs/voice');
const discordTTS = require('discord-tts');
const play = require('play-dl');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

const USERS_FILE = path.join(__dirname, 'users.json');

// Initialize Groq
let groq = null;
if (process.env.GROQ_API_KEY) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// Load users
let userProfiles = {};
if (fs.existsSync(USERS_FILE)) {
    try {
        userProfiles = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (err) {
        console.error("Error reading users.json:", err);
    }
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(userProfiles, null, 2));
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// --- HTTP Server for Render (Keep Alive) ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
}).listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
});

// Troll Configuration
let trollUsers = new Set(); // Stores user IDs to auto-roast
let autoKickUsers = new Set(); // Stores user IDs to auto-kick from voice
const TROLL_TARGET_NAME = 'jeff';
const TROLL_IMAGE_DIR = path.join(__dirname, 'Photo');

// Music Queue System
const musicQueues = new Map(); // Guild ID -> { queue: [], player: AudioPlayer, connection: VoiceConnection, isPlaying: boolean }

// Troll Modes
const TROLL_MODES = {
    ROAST: 'ROAST',
    MULTI_ROAST: 'MULTI_ROAST',
    MOCK: 'MOCK',
    REACT: 'REACT',
    WHO_ASKED: 'WHO_ASKED',
    AI_ROAST: 'AI_ROAST'
};

const TROLL_MESSAGES = [
    "ez lol",
    "git gud",
    "imagine trying so hard",
    "skill issue",
    "diff",
    "bottom frag energy",
    "whiffed it",
    "nt but not really",
    "iron 1 gameplay",
    "my grandma aims better",
    "you play like a bot",
    "tutorial mode is that way ->",
    "are you playing with your monitor off?",
    "uninstall?",
    "lag? sure buddy",
    "crosshair placement: floor",
    "tactical feeding",
    "who boosted you?",
    "valorant? more like valorant't",
    "you're the reason we lose RR",
    "nice try, next time try hitting them",
    "aim diff",
    "brain diff",
    "stop baiting",
    "eco fragger",
    "carried",
    "go play roblox",
    "radiant... in your dreams",
    "hardstuck iron",
    "404: aim not found"
];

// Helper to get random item
function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Helper to sponge-case text
function toSpongeCase(text) {
    return text.split('').map((char, index) => 
        index % 2 === 0 ? char.toLowerCase() : char.toUpperCase()
    ).join('');
}

// Helper to delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper to check for gibberish
function isGibberish(text) {
    // 1. Too short (1-2 chars)
    if (text.length < 3) return true;
    
    // 2. Repeated characters (e.g., "aaaaa", "sdsdsd")
    if (/^(.)\1+$/.test(text)) return true; // "aaaa"
    
    // 3. High consonant ratio (keysmashing "asdfgh")
    const vowels = text.match(/[aeiouy]/gi);
    const vowelCount = vowels ? vowels.length : 0;
    if (vowelCount === 0 && text.length > 4) return true; // "bcdf"

    // 4. Keyboard mash patterns (common ones)
    if (/asdf|qwer|zxcv|jkl|uiop/i.test(text)) return true;

    return false;
}

client.on('messageCreate', async message => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check if user is in the Troll List OR matches "jeff" OR matches "aiden" (from screenshot)
    const isTarget = 
        trollUsers.has(message.author.id) ||
        message.author.username.toLowerCase().includes('jeff') || 
        message.author.displayName.toLowerCase().includes('jeff') ||
        message.author.username.toLowerCase().includes('aiden') ||
        message.author.displayName.toLowerCase().includes('aiden');

    if (isTarget) {
        try {
            // Check content for gibberish first
            const content = message.content.trim();
            const gibberish = isGibberish(content);

            // Weights: AI_ROAST (100% if not gibberish), else mix of others
            const rand = Math.random();
            let mode = TROLL_MODES.ROAST; // Default fallback

            if (groq) {
                // If we have AI -> 100% AI Roast (AI handles gibberish)
                mode = TROLL_MODES.AI_ROAST; 
            } else {
                 // No AI Key -> Fallback logic
                 // High chance to just send a photo or generic roast
                 if (rand < 0.5) mode = TROLL_MODES.ROAST; // Standard roast (often with photo)
                 else if (rand < 0.7) mode = TROLL_MODES.MOCK;
                 else mode = TROLL_MODES.REACT;
            }

            console.log(`[TROLL] Target: ${message.author.tag}, Mode: ${mode}, Gibberish: ${gibberish}`);

            // --- AI ROAST ---
            // FORCE AI ROAST 100% OF THE TIME if possible
            if (groq) {
                try {
                    // Context-Aware Prompt
                    const prompt = `You are a savage, mean, and funny Discord bot. The user "${message.author.username}" just said: "${content}". 
                    Your job is to ROAST them specifically based on the CONTENT of their message.
                    
                    CRITICAL INSTRUCTIONS:
                    - READ their message carefully. Your roast MUST be about what they just wrote.
                    - If they say "shut up", mock them for being weak and unable to handle the heat.
                    - If they make a typo (e.g. "toliet"), DESTROY them for being illiterate.
                    - If they are bragging, humble them.
                    - If they are complaining, call them a crybaby.
                    - If they typed gibberish (e.g. "asdf"), ask if they are having a stroke.
                    - Be direct, short, and brutal. NO hashtags. NO generic insults like "your mom".
                    - MAKE IT HURT.`;
                    
                    const completion = await groq.chat.completions.create({
                        messages: [{ role: 'user', content: prompt }],
                        model: 'llama3-8b-8192',
                    });

                    let aiRoast = completion.choices[0]?.message?.content;
                    
                    // Fallback only if AI fails
                    if (!aiRoast) aiRoast = "I'd roast you, but you're not even worth the API call.";

                    // 50% Chance to include a photo with AI roast too
                    let files = [];
                    if (Math.random() < 0.5) {
                        if (fs.existsSync(TROLL_IMAGE_DIR)) {
                            const imageFiles = fs.readdirSync(TROLL_IMAGE_DIR).filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));
                            if (imageFiles.length > 0) {
                                const randomImage = getRandom(imageFiles);
                                const attachment = new AttachmentBuilder(path.join(TROLL_IMAGE_DIR, randomImage));
                                files.push(attachment);
                            }
                        }
                    }

                    await message.reply({ content: aiRoast, files: files });
                    return;

                } catch (err) {
                    console.error("AI Roast Error:", err);
                    // Silent fail or fallback
                }
            }

            // --- REACTION SPAM ---
            // Small chance to just react instead of roasting
            if (Math.random() < 0.2) {
                const reactions = ['🤡', '💩', '🗑️', '🤓', '🧂'];
                for (let i = 0; i < 3; i++) {
                    const r = getRandom(reactions);
                    try { await message.react(r); } catch(e) {}
                }
                return;
            }

            // --- MOCK MODE ---
            // Small chance to mock text
            if (Math.random() < 0.2 && message.content.length > 0) {
                 const mocked = toSpongeCase(message.content);
                 await message.reply(`${mocked} 🤓`);
                 return;
            }

        } catch (err) {
            console.error('Failed to troll user:', err);
        }
    }
});

// === EMOJI CONFIGURATION ===
const EMOJIS = {
    // --- General UI (Standard Emojis) ---
    win: '🟢',
    loss: '🔴',
    draw: '⚪',
    rank: '🏆', 
    trophy: '🏆', 
    kda: '🗡️',
    hs: '🎯',
    agent: '👤',
    map: '🗺️',
    trend: '📈',
    mvp: '👑',
    team_mvp: '⚡',
    check: '✅',
    cross: '❌',  

    // --- Ranks ---
    rank_iron: '<:iron:1476310410343743559>',  
    rank_bronze: '<:bronze:1476310292538593482>',
    rank_silver: '<:silver:1476310533098705067>',
    rank_gold: '<:gold:1476310355335581799>',  
    rank_platinum: '<:platinum:1476310475829412054>',
    rank_immortal: '<:immortal:1476310387006902385>',
    rank_radiant: '<:radiant:1476310500013773085>',
    rank_unranked: '<:iron:1476310410343743559>', // Fallback

    // --- Agents ---
    agent_astra: '<:astra:1476310268505231487>',
    agent_breach: '<:breach:1476310276553838674>',
    agent_brimstone: '<:brimstone:1476310284615418057>',
    agent_chamber: '<:chamber:1476310316018045060>',
    agent_cypher: '<:cypher:1476310323681169481>',
    agent_deadlock: '<:deadlock:1476310331398815968>',
    agent_fade: '<:fade:1476310339569188884>', 
    agent_gekko: '<:gekko:1476310347215536231>',
    agent_harbor: '<:harbor:1476310379247177981>',
    agent_jett: '<:jett:1476310433370607617>', 
    agent_kay_o: '<:kay_o:1476310442518511760>',
    agent_killjoy: '<:killjoy:1476310450885885992>',
    agent_neon: '<:neon:1476310460688109618>', 
    agent_omen: '<:omen:1476310468380594340>', 
    agent_raze: '<:raze:1476310507815440425>', 
    agent_reyna: '<:reyna:1476310516811956284>',
    agent_sage: '<:sage:1476310524995178711>', 
    agent_skye: '<:skye:1476310562622410927>', 
    agent_sova: '<:sova:1476310570616623361>',
    agent_viper: '<:viper:1476310586944782416>',
    agent_iso: '<:valorant_iso_icon:1476310578271097005>', // Fallback or specific
    agent_clove: '<:astra:1476310268505231487>', // Fallback if missing
    agent_vyse: '<:sage:1476310524995178711>' // Fallback if missing
};

// Helper to get Agent Emoji safely
function getAgentEmoji(agentName) {
    if (!agentName) return EMOJIS.agent;
    const key = `agent_${agentName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    return EMOJIS[key] || EMOJIS.agent;
}

// Helper to get Rank Emoji safely
function getRankEmoji(rankName) {
    if (!rankName) return EMOJIS.rank_unranked;
    const lower = rankName.toLowerCase();
    if (lower.includes('iron')) return EMOJIS.rank_iron;
    if (lower.includes('bronze')) return EMOJIS.rank_bronze;
    if (lower.includes('silver')) return EMOJIS.rank_silver;
    if (lower.includes('gold')) return EMOJIS.rank_gold;
    if (lower.includes('platinum')) return EMOJIS.rank_platinum;
    if (lower.includes('diamond')) return EMOJIS.rank_platinum; // Fallback if diamond missing, or use plat
    if (lower.includes('ascendant')) return EMOJIS.rank_immortal; // Fallback
    if (lower.includes('immortal')) return EMOJIS.rank_immortal;
    if (lower.includes('radiant')) return EMOJIS.rank_radiant;
    return EMOJIS.rank_unranked;
}

const commands = [
    new SlashCommandBuilder()
        .setName('val')
        .setDescription('Track Valorant match history (Auto-Region)')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Riot Name (e.g. Sensitivity)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Riot Tag (e.g. 1)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('mode')
                .setDescription('Filter by Game Mode')
                .setRequired(false)
                .addChoices(
                    { name: 'All Modes', value: 'all' },
                    { name: 'Competitive', value: 'competitive' },
                    { name: 'Unrated', value: 'unrated' },
                    { name: 'Deathmatch', value: 'deathmatch' },
                    { name: 'Team Deathmatch', value: 'team_deathmatch' },
                    { name: 'Swiftplay', value: 'swiftplay' }
                )),
    new SlashCommandBuilder()
        .setName('crosshair')
        .setDescription('Generate a preview of a crosshair')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('The crosshair profile code (e.g. 0;P;c;5...)')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Deep Stats Analysis for specific Agent or Map')
        .addStringOption(option => 
            option.setName('type')
                .setDescription('Analysis Type')
                .setRequired(true)
                .addChoices(
                    { name: 'Agent', value: 'agent' },
                    { name: 'Map', value: 'map' }
                ))
        .addStringOption(option =>
            option.setName('target')
                .setDescription('Name of the Agent or Map (e.g. Jett, Ascent)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Riot Name')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Riot Tag')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('hours')
        .setDescription('Calculate estimated playtime based on recent matches')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Riot Name')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Riot Tag')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your Valorant account to your Discord user')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Riot Name')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Riot Tag')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('scout')
        .setDescription('Look up any player (Name#Tag required)')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Riot Name')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Riot Tag')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('mode')
                .setDescription('Filter by Game Mode')
                .setRequired(false)
                .addChoices(
                    { name: 'All Modes', value: 'all' },
                    { name: 'Competitive', value: 'competitive' },
                    { name: 'Unrated', value: 'unrated' },
                    { name: 'Deathmatch', value: 'deathmatch' },
                    { name: 'Team Deathmatch', value: 'team_deathmatch' },
                    { name: 'Swiftplay', value: 'swiftplay' }
                )),
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show leaderboard of linked players (Ranked Rating)'),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check Valorant Server Status')
        .addStringOption(option => 
            option.setName('region')
                .setDescription('Region to check')
                .setRequired(true)
                .addChoices(
                    { name: 'NA', value: 'na' },
                    { name: 'EU', value: 'eu' },
                    { name: 'AP', value: 'ap' },
                    { name: 'KR', value: 'kr' },
                    { name: 'BR', value: 'br' },
                    { name: 'LATAM', value: 'latam' }
                )),
    new SlashCommandBuilder()
        .setName('autokick')
        .setDescription('Enable/Disable auto-kick from voice for a user')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The user to auto-kick')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('active')
                .setDescription('Enable (True) or Disable (False)')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('troll')
        .setDescription('Enable/Disable auto-roasting for a user')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The user to troll')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('active')
                .setDescription('Enable (True) or Disable (False)')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('impersonate')
        .setDescription('Make the bot say something as another user (Fake Message)')
        .addUserOption(option => 
            option.setName('target')
            .setDescription('The user to impersonate')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
            .setDescription('The message to say')
            .setRequired(true)),
    new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot say something in Voice Channel (TTS)')
        .addStringOption(option =>
            option.setName('message')
            .setDescription('The text to speak')
            .setRequired(true)),
    new SlashCommandBuilder()
        .setName('sound')
        .setDescription('Play a funny sound effect in Voice Channel')
        .addStringOption(option =>
            option.setName('effect')
            .setDescription('Sound effect to play')
            .setRequired(true)
            .addChoices(
                { name: 'Vine Boom', value: 'vine-boom' },
                { name: 'Bruh', value: 'bruh' },
                { name: 'Airhorn', value: 'airhorn' },
                { name: 'Discord Join', value: 'discord-join' },
                { name: 'Discord Leave', value: 'discord-leave' },
                { name: 'Error', value: 'error' }
            )),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song from YouTube')
        .addStringOption(option =>
            option.setName('query')
            .setDescription('YouTube URL or Song Name')
            .setRequired(true)),
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop music and clear queue'),
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show current music queue')
]
    .map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(generateDependencyReport()); // Check voice dependencies
    console.log(`[INFO] Bot Dashboard: https://discord.com/developers/applications/${client.user.id}/information`);

    try {
        console.log('Started refreshing application (/) commands.');
        
        // 1. Clear Global Commands (to avoid duplicates with Guild commands)
        // Global commands take time to update/delete, but we want to switch to Guild-only for instant updates.
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: [] },
        );
        console.log('Successfully cleared application (/) commands (Global).');

        // 2. Register Guild Commands for all guilds (Instant Update)
        // This makes commands appear immediately in your server.
        const guilds = await client.guilds.fetch();
        for (const [id, guild] of guilds) {
            try {
                await rest.put(
                    Routes.applicationGuildCommands(client.user.id, id),
                    { body: commands },
                );
                console.log(`Successfully reloaded application (/) commands for guild: ${guild.name} (${id})`);
            } catch (err) {
                console.error(`Failed to reload commands for guild ${id}:`, err);
            }
        }

    } catch (error) {
        console.error(error);
    }
});

// --- Helper: Safe Fetch Matches with Fallback ---
async function safeFetchMatches(region, name, tag, initialSize = 100, mode = 'all') {
    const fetch = async (size) => {
        let url = `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=${size}`;
        if (mode && mode !== 'all') {
            url += `&mode=${mode}`;
        }
        console.log(`Trying to fetch ${size} matches for ${name}#${tag} (mode=${mode})...`);
        return await axios.get(url, {
            headers: { 'Authorization': process.env.HENRIK_API_KEY },
            timeout: 10000 // 10s timeout
        });
    };

    try {
        return await fetch(initialSize);
    } catch (err) {
        console.error(`Fetch size=${initialSize} failed: ${err.message}`);
        if (initialSize > 20) {
            try {
                return await fetch(20);
            } catch (err2) {
                console.error(`Fetch size=20 failed: ${err2.message}`);
                return await fetch(5);
            }
        }
        throw err;
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'troll') {
        // Strict Check: Only allow 'BP' role (ID: 1476579373162303580)
        // Bypasses Admin check - even Admins need this role.
        if (!interaction.member.roles.cache.has('1476579373162303580')) {
            return interaction.reply({ content: '❌ **Access Denied**: You cannot use this command.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('target');
        const active = interaction.options.getBoolean('active');

        if (active) {
            trollUsers.add(targetUser.id);
            await interaction.reply({ content: `😈 Auto-roast **ENABLED** for ${targetUser}. The bot will now make fun of everything they say.`, ephemeral: true });
        } else {
            trollUsers.delete(targetUser.id);
            await interaction.reply({ content: `😇 Auto-roast **DISABLED** for ${targetUser}. They are safe now.`, ephemeral: true });
        }
        return;
    }

    if (interaction.commandName === 'link') {
        const name = interaction.options.getString('name');
        const tag = interaction.options.getString('tag');

        await interaction.deferReply({ ephemeral: true });

        try {
            const response = await axios.get(`https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, {
                headers: { 'Authorization': process.env.HENRIK_API_KEY }
            });

            if (response.status === 200) {
                userProfiles[interaction.user.id] = { 
                    name: response.data.data.name, 
                    tag: response.data.data.tag,
                    region: response.data.data.region
                };
                saveUsers();
                await interaction.editReply(`✅ Linked **${response.data.data.name}#${response.data.data.tag}** to your account! You can now use \`/val\` without typing your name.`);
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Could not verify that account. Check the name and tag.');
        }
    }

    if (interaction.commandName === 'val') {
        let name = interaction.options.getString('name');
        let tag = interaction.options.getString('tag');
        const mode = interaction.options.getString('mode') || 'all';

        // Check for linked account if args are missing
        if (!name || !tag) {
            const linked = userProfiles[interaction.user.id];
            if (!linked) {
                // Return ephemeral reply if no linked account found
                return interaction.reply({ content: '❌ Please provide a name/tag OR link your account first using `/link name tag`', ephemeral: true });
            }
            name = name || linked.name;
            tag = tag || linked.tag;
        }

        // Make ephemeral
        await interaction.deferReply({ ephemeral: true });
        await handleMatchHistory(interaction, name, tag, mode);
        return;
    }

    if (interaction.commandName === 'crosshair') {
        const code = interaction.options.getString('code');
        await interaction.deferReply();
        
        try {
            // Using a known public API for crosshair generation
            // If this endpoint changes, we might need to find another one or just link to a builder
            const imageUrl = `https://api.henrikdev.xyz/valorant/v1/crosshair/generate?id=${code}`;
            
            const embed = new EmbedBuilder()
                .setColor('#FF4655')
                .setTitle('🎯 Crosshair Preview')
                .setDescription(`**Code**: \`${code}\``)
                .setImage(imageUrl)
                .setFooter({ text: 'Note: If image doesn\'t load, the code might be invalid.' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Could not generate crosshair preview. Invalid code?');
        }
    }

    if (interaction.commandName === 'stats') {
        const type = interaction.options.getString('type'); // 'agent' or 'map'
        const target = interaction.options.getString('target');
        let name = interaction.options.getString('name');
        let tag = interaction.options.getString('tag');
        
        // Ephemeral by default
        await interaction.deferReply({ ephemeral: true });

        // Check for linked account if args are missing
        if (!name || !tag) {
            const linked = userProfiles[interaction.user.id];
            if (!linked) {
                // Already deferred, so editReply
                return interaction.editReply({ content: '❌ Please provide a name/tag OR link your account first using `/link name tag`' });
            }
            name = name || linked.name;
            tag = tag || linked.tag;
        }

        try {
            // 1. Get Account & Region
            const accountResponse = await axios.get(`https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, {
                headers: { 'Authorization': process.env.HENRIK_API_KEY }
            });

            if (accountResponse.status === 200 && accountResponse.data.data) {
                const region = accountResponse.data.data.region;
                const accountData = accountResponse.data.data;

                // Fetch initial matches
                const response = await axios.get(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=100`, {
                    headers: { 'Authorization': process.env.HENRIK_API_KEY }
                });

                if (response.status === 200 && response.data.data && response.data.data.length > 0) {
                    let matches = response.data.data;

                    // Fetch older matches for deeper analysis
                    try {
                        matches = await fetchDeepHistory(interaction, name, tag, region, matches, 250);
                    } catch (err) {
                        console.error("Deep History Error:", err);
                        await interaction.followUp({ content: '⚠️ Could not fetch full history (API limit or timeout). Showing available matches.', ephemeral: true });
                    }
                    
                    // Filter matches based on Type (Agent or Map)
                    // Fuzzy matching for user input
                    const targetLower = target.toLowerCase();
                    
                    const filteredMatches = matches.filter(match => {
                        const player = match.players.all_players.find(p => 
                            p.name.toLowerCase() === name.toLowerCase() && 
                            p.tag.toLowerCase() === tag.toLowerCase()
                        );
                        if (!player) return false;

                        if (type === 'agent') {
                            return (player.character || '').toLowerCase().includes(targetLower);
                        } else if (type === 'map') {
                            return (match.metadata.map || '').toLowerCase().includes(targetLower);
                        }
                        return false;
                    });

                    if (filteredMatches.length === 0) {
                        return interaction.editReply(`❌ No recent matches found for **${type === 'agent' ? 'Agent' : 'Map'}**: ${target}`);
                    }

                    // Calculate Stats
                    let wins = 0;
                    let kills = 0, deaths = 0, assists = 0;
                    let headshots = 0, bodyshots = 0, legshots = 0;
                    let damage = 0;
                    let rounds = 0;

                    filteredMatches.forEach(match => {
                        const player = match.players.all_players.find(p => 
                            p.name.toLowerCase() === name.toLowerCase() && 
                            p.tag.toLowerCase() === tag.toLowerCase()
                        );
                        
                        const team = player.team ? player.team.toLowerCase() : 'neutral';
                        if (match.teams && match.teams[team] && match.teams[team].has_won) {
                            wins++;
                        }

                        kills += player.stats.kills;
                        deaths += player.stats.deaths;
                        assists += player.stats.assists;
                        headshots += player.stats.shots?.head || 0;
                        bodyshots += player.stats.shots?.body || 0;
                        legshots += player.stats.shots?.leg || 0;
                        damage += player.stats.damage_made || 0;
                        rounds += match.metadata.rounds_played || 1;
                    });

                    // Averages
                    const count = filteredMatches.length;
                    const winRate = ((wins / count) * 100).toFixed(0);
                    const avgKills = (kills / count).toFixed(1);
                    const avgDeaths = (deaths / count).toFixed(1);
                    const avgAssists = (assists / count).toFixed(1);
                    const kdaRatio = deaths > 0 ? (kills / deaths).toFixed(2) : kills;
                    const adr = Math.round(damage / rounds);

                    const totalShots = headshots + bodyshots + legshots;
                    const hsPercent = totalShots > 0 ? ((headshots / totalShots) * 100).toFixed(1) : '0';
                    const bodyPercent = totalShots > 0 ? ((bodyshots / totalShots) * 100).toFixed(1) : '0';
                    const legPercent = totalShots > 0 ? ((legshots / totalShots) * 100).toFixed(1) : '0';

                    // Correct Case Name for Title
                    const displayTarget = type === 'agent' 
                        ? (filteredMatches[0].players.all_players.find(p => p.name.toLowerCase() === name.toLowerCase()).character)
                        : (filteredMatches[0].metadata.map);

                    const icon = type === 'agent' ? getAgentEmoji(displayTarget) : EMOJIS.map;
                    const thumbnail = type === 'agent' 
                        ? `https://media.valorant-api.com/agents/${displayTarget.toLowerCase()}/displayicon.png` // This URL is a guess, usually we use assets from match
                        : filteredMatches[0].players.all_players.find(p => p.name.toLowerCase() === name.toLowerCase()).assets.agent.small;

                    const embed = new EmbedBuilder()
                        .setColor('#0099FF')
                        .setTitle(`${icon} Deep Stats: ${displayTarget}`)
                        .setDescription(`Analysis of **${count}** matches (out of **${matches.length}** tracked) playing as/on **${displayTarget}**`)
                        .setThumbnail(accountData.card.small)
                        .addFields(
                            { name: `${EMOJIS.trophy} Win Rate`, value: `**${winRate}%** (${wins}W - ${count - wins}L)`, inline: true },
                            { name: `${EMOJIS.kda} K/D Ratio`, value: `**${kdaRatio}**`, inline: true },
                            { name: 'Avg K/D/A', value: `${avgKills} / ${avgDeaths} / ${avgAssists}`, inline: true },
                            { name: `${EMOJIS.hs} Headshot %`, value: `**${hsPercent}%**`, inline: true },
                            { name: '💥 ADR', value: `**${adr}**`, inline: true },
                            { name: '🎯 Accuracy', value: `Head: ${hsPercent}%\nBody: ${bodyPercent}%\nLeg: ${legPercent}%`, inline: true }
                        )
                        .setFooter({ text: `Player: ${accountData.name}#${accountData.tag}` });

                    await interaction.editReply({ embeds: [embed] });

                } else {
                    await interaction.editReply('No recent matches found to analyze.');
                }
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Error fetching data. Check Name/Tag or try again later.');
        }
    }

    if (interaction.commandName === 'leaderboard') {
        await interaction.deferReply();
        
        const sortedUsers = Object.entries(userProfiles)
            .filter(([_, data]) => data.elo !== undefined)
            .sort((a, b) => b[1].elo - a[1].elo)
            .slice(0, 10);

        if (sortedUsers.length === 0) {
            return interaction.editReply('No ranked players linked yet. Use `/link` and run `/val` once to appear here!');
        }

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`${EMOJIS.trophy} Server Leaderboard`)
            .setDescription('Top players by Ranked Rating (ELO)')
            .setTimestamp();

        let description = '';
        sortedUsers.forEach((entry, index) => {
            const [userId, data] = entry;
            const rankEmoji = getRankEmoji(data.rank);
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
            
            description += `${medal} **${data.name}#${data.tag}**\n`;
            description += `> ${rankEmoji} ${data.rank} • **${data.elo}** ELO\n\n`;
        });

        embed.setDescription(description);
        await interaction.editReply({ embeds: [embed] });
    }

    if (interaction.commandName === 'hours') {
        let name = interaction.options.getString('name');
        let tag = interaction.options.getString('tag');

        // Check for linked account
        if (!name || !tag) {
            const linked = userProfiles[interaction.user.id];
            if (!linked) {
                return interaction.reply({ content: '❌ Please provide a name/tag OR link your account first using `/link name tag`', ephemeral: true });
            }
            name = name || linked.name;
            tag = tag || linked.tag;
        }

        await interaction.deferReply();

        try {
            // Get Account & Region
            const accountResponse = await axios.get(`https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, {
                headers: { 'Authorization': process.env.HENRIK_API_KEY }
            });

            if (accountResponse.status === 200 && accountResponse.data.data) {
                const region = accountResponse.data.data.region;
                const accountData = accountResponse.data.data;

                // Fetch initial matches
                try {
                    const response = await safeFetchMatches(region, name, tag, 100);
                    
                    if (response.status === 200 && response.data.data && response.data.data.length > 0) {
                        let matches = response.data.data;

                        // Fetch older matches
                        try {
                            matches = await fetchDeepHistory(interaction, name, tag, region, matches, 250);
                        } catch (err) {
                            console.error("Deep History Error:", err);
                            await interaction.followUp({ content: '⚠️ Could not fetch full history (API limit or timeout). Showing available matches.', ephemeral: true });
                        }
                        
                        // Calculate Playtime
                    let totalSeconds = 0;
                    const modeStats = {};
                    const agentStats = {};

                    matches.forEach(match => {
                            // Safety check for invalid match data
                            if (!match || !match.metadata || !match.players || !match.players.all_players) return;

                            const duration = match.metadata.game_length || 0; 
                        
                        let seconds = duration;
                        if (seconds > 100000) seconds = seconds / 1000; 

                        totalSeconds += seconds;

                        // Mode Stats
                        const mode = match.metadata.mode || 'Unknown';
                        if (!modeStats[mode]) modeStats[mode] = 0;
                        modeStats[mode] += seconds;

                        // Agent Stats
                        const player = match.players.all_players.find(p => 
                            p.name.toLowerCase() === name.toLowerCase() && 
                            p.tag.toLowerCase() === tag.toLowerCase()
                        );
                        if (player && player.character) {
                            const agent = player.character;
                            if (!agentStats[agent]) agentStats[agent] = 0;
                            agentStats[agent] += seconds;
                        }
                    });

                    // Format Time Helper
                    const formatTime = (secs) => {
                        const hrs = Math.floor(secs / 3600);
                        const mins = Math.floor((secs % 3600) / 60);
                        return `${hrs}h ${mins}m`;
                    };

                    const totalTime = formatTime(totalSeconds);

                    const embed = new EmbedBuilder()
                        .setColor('#9146FF')
                        .setTitle(`⏳ Playtime Analysis (Extended History)`)
                        .setDescription(`Estimated playtime based on **${matches.length}** matches for **${accountData.name}#${accountData.tag}**`)
                        .setThumbnail(accountData.card.small)
                        .addFields(
                            { name: 'Total Playtime (Tracked)', value: `**${totalTime}**`, inline: false }
                        );

                    let modeBreakdown = '';
                    // Sort modes by time
                    Object.entries(modeStats)
                        .sort(([,a], [,b]) => b - a)
                        .forEach(([mode, seconds]) => {
                            modeBreakdown += `**${mode}**: ${formatTime(seconds)}\n`;
                        });

                    let agentBreakdown = '';
                    // Sort agents by time
                    Object.entries(agentStats)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 5) // Top 5 agents
                        .forEach(([agent, seconds]) => {
                            const emoji = getAgentEmoji(agent);
                            agentBreakdown += `${emoji} **${agent}**: ${formatTime(seconds)}\n`;
                        });

                    embed.addFields(
                        { name: 'By Mode', value: modeBreakdown || 'N/A', inline: true },
                        { name: 'Most Played Agents (Time)', value: agentBreakdown || 'N/A', inline: true }
                    );
                    
                    embed.setFooter({ text: 'Note: Tracks up to ~500 recent matches (Deep History). True lifetime total is not available via API.' });

                    await interaction.editReply({ embeds: [embed] });

                } else {
                    await interaction.editReply('No recent matches found to calculate playtime.');
                }
                } catch (err) {
                     console.error("Safe Fetch Error:", err.message);
                     if (err.response && err.response.status === 429) {
                         return interaction.editReply('❌ **API Rate Limit Reached.** Please wait a minute and try again.');
                     }
                     throw err; 
                }
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Error fetching data.');
        }
    }

    if (interaction.commandName === 'status') {
        const region = interaction.options.getString('region');
        await interaction.deferReply();

        try {
            const response = await axios.get(`https://api.henrikdev.xyz/valorant/v1/status/${region}`, {
                headers: { 'Authorization': process.env.HENRIK_API_KEY }
            });

            if (response.status === 200 && response.data.data) {
                const data = response.data.data;
                const embed = new EmbedBuilder()
                    .setColor(data.maintenances.length > 0 || data.incidents.length > 0 ? '#FF0000' : '#00FF00')
                    .setTitle(`Valorant Server Status (${region.toUpperCase()})`)
                    .setTimestamp();

                if (data.maintenances.length === 0 && data.incidents.length === 0) {
                    embed.setDescription(`${EMOJIS.check} All systems operational. No reported issues.`);
                } else {
                    let desc = '';
                    if (data.maintenances.length > 0) {
                        desc += `**🔧 Maintenance**\n`;
                        data.maintenances.forEach(m => {
                            desc += `• ${m.titles.find(t => t.locale === 'en_US')?.content || 'Maintenance'}\n`;
                        });
                        desc += '\n';
                    }
                    if (data.incidents.length > 0) {
                        desc += `**⚠️ Incidents**\n`;
                        data.incidents.forEach(i => {
                            desc += `• ${i.titles.find(t => t.locale === 'en_US')?.content || 'Incident'}\n`;
                        });
                    }
                    embed.setDescription(desc);
                }

                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Could not fetch server status.');
        }
    }

    if (interaction.commandName === 'scout') {
        const name = interaction.options.getString('name');
        const tag = interaction.options.getString('tag');
        const mode = interaction.options.getString('mode') || 'all';
        
        // Ephemeral by default
        await interaction.deferReply({ ephemeral: true });

        // Pass to the same logic as /val but without the link check
        await handleMatchHistory(interaction, name, tag, mode);
    }

    // --- AUTO KICK COMMAND ---
    if (interaction.commandName === 'autokick') {
        // Strict Check: Only allow 'BP' role (ID: 1476579373162303580)
        // Bypasses Admin check - even Admins need this role.
        if (!interaction.member.roles.cache.has('1476579373162303580')) {
            return interaction.reply({ content: '❌ **Access Denied**: You cannot use this command.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('target');
        const active = interaction.options.getBoolean('active');

        // Defer reply to prevent timeout
        await interaction.deferReply({ ephemeral: true });

        if (active) {
            autoKickUsers.add(targetUser.id);
            await interaction.editReply({ content: `✅ **Auto-Kick Enabled** for ${targetUser}. They will be kicked from voice channels immediately upon joining.` });

            // Check if user is ALREADY in a voice channel
            try {
                const member = await interaction.guild.members.fetch(targetUser.id);
                if (member.voice.channel) {
                    // Check permissions
                    if (!interaction.guild.members.me.permissions.has('MoveMembers')) {
                         console.error(`[AUTO-KICK] ERROR: Bot lacks 'Move Members' permission!`);
                         await interaction.followUp({ content: '⚠️ **Warning**: I do not have the "Move Members" permission, so I cannot kick them yet!', ephemeral: true });
                    } else {
                        await member.voice.disconnect();
                        console.log(`[AUTO-KICK] Immediate Kick: Kicked ${targetUser.tag} from ${member.voice.channel.name}`);
                        await interaction.followUp({ content: `👋 **Kicked** ${targetUser} from voice channel!`, ephemeral: true });
                    }
                }
            } catch (err) {
                // If user is not in guild or other error
                // console.error(`[AUTO-KICK] Error checking/kicking existing user:`, err);
            }

        } else {
            autoKickUsers.delete(targetUser.id);
            await interaction.editReply({ content: `❌ **Auto-Kick Disabled** for ${targetUser}.` });
        }
    }

    if (interaction.commandName === 'impersonate') {
        const targetUser = interaction.options.getUser('target');
        const messageContent = interaction.options.getString('message');
        
        // Strict Check: Only allow 'BP' role (ID: 1476579373162303580)
        if (!interaction.member.roles.cache.has('1476579373162303580')) {
            return interaction.reply({ content: '❌ **Access Denied**: You cannot use this command.', ephemeral: true });
        }

        // Check permissions
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageWebhooks)) {
             return interaction.reply({ content: '❌ I need **Manage Webhooks** permission to do this!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Fetch webhooks in the channel
            const webhooks = await interaction.channel.fetchWebhooks();
            // Find an existing webhook owned by this bot
            let webhook = webhooks.find(wh => wh.owner.id === client.user.id && wh.token);

            if (!webhook) {
                webhook = await interaction.channel.createWebhook({
                    name: 'Valorent Tracker Hook',
                    avatar: client.user.displayAvatarURL(),
                });
            }

            // Send using the webhook, overriding name and avatar
            // IMPORTANT: Fetch member to get Server Nickname and Server Avatar
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            
            // Use Nickname if available, otherwise Username
            const displayName = member ? member.displayName : targetUser.username;
            // Use Server Avatar if available, otherwise User Avatar
            const avatarURL = member ? member.displayAvatarURL({ dynamic: true }) : targetUser.displayAvatarURL({ dynamic: true });

            await webhook.send({
                content: messageContent,
                username: displayName,
                avatarURL: avatarURL,
                allowedMentions: { parse: [] } 
            });

            await interaction.editReply({ content: `✅ **Sent** as ${targetUser}`, ephemeral: true });

        } catch (error) {
            console.error("Impersonate Error:", error);
            await interaction.editReply({ content: '❌ Failed to send message. Ensure I have `Manage Webhooks` permission.', ephemeral: true });
        }
    }

    // --- MUSIC COMMANDS ---
    if (interaction.commandName === 'play') {
        const query = interaction.options.getString('query');
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel!', ephemeral: true });
        }

        await interaction.deferReply(); // Public reply so everyone sees what's playing

        try {
            // Join Voice Channel
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            // Get Queue for this guild
            let queue = musicQueues.get(interaction.guild.id);
            if (!queue) {
                queue = {
                    songs: [],
                    player: createAudioPlayer({
                        behaviors: {
                            noSubscriber: NoSubscriberBehavior.Play
                        }
                    }),
                    connection: connection,
                    isPlaying: false
                };
                musicQueues.set(interaction.guild.id, queue);

                // Handle Player Events
                queue.player.on(AudioPlayerStatus.Idle, () => {
                    queue.isPlaying = false;
                    queue.songs.shift(); // Remove finished song
                    if (queue.songs.length > 0) {
                        playNextSong(interaction.guild.id);
                    } else {
                        // Queue empty
                    }
                });

                queue.player.on('error', error => {
                    console.error('Music Player Error:', error);
                    queue.isPlaying = false;
                    queue.songs.shift();
                    if (queue.songs.length > 0) playNextSong(interaction.guild.id);
                });

                connection.subscribe(queue.player);
            }

            // Search for song
            let video;
            if (query.startsWith('http')) {
                // Direct URL
                if (play.yt_validate(query) === 'video') {
                    const videoInfo = await play.video_info(query);
                    video = videoInfo.video_details;
                }
            } else {
                // Search
                const results = await play.search(query, { limit: 1 });
                if (results.length > 0) video = results[0];
            }

            if (!video) {
                return interaction.editReply('❌ Could not find any video.');
            }

            // Add to queue
            const song = {
                title: video.title,
                url: video.url,
                duration: video.durationRaw,
                thumbnail: video.thumbnails[0].url
            };
            
            queue.songs.push(song);

            if (!queue.isPlaying) {
                playNextSong(interaction.guild.id);
                await interaction.editReply(`🎶 **Now Playing:** [${song.title}](${song.url})`);
            } else {
                await interaction.editReply(`📝 **Added to Queue:** [${song.title}](${song.url})`);
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Error playing music.');
        }
    }

    if (interaction.commandName === 'skip') {
        const queue = musicQueues.get(interaction.guild.id);
        if (!queue || queue.songs.length === 0) {
            return interaction.reply({ content: '❌ Queue is empty.', ephemeral: true });
        }
        queue.player.stop(); // This triggers Idle event, which plays next song
        await interaction.reply('⏩ Skipped!');
    }

    if (interaction.commandName === 'stop') {
        const queue = musicQueues.get(interaction.guild.id);
        if (queue) {
            queue.songs = []; // Clear queue
            queue.player.stop(); // Stop player
            queue.connection.destroy(); // Leave channel
            musicQueues.delete(interaction.guild.id);
            await interaction.reply('TwT Stopped music and left.');
        } else {
            await interaction.reply({ content: '❌ I am not playing anything.', ephemeral: true });
        }
    }

    if (interaction.commandName === 'queue') {
        const queue = musicQueues.get(interaction.guild.id);
        if (!queue || queue.songs.length === 0) {
            return interaction.reply({ content: '❌ Queue is empty.', ephemeral: true });
        }

        const queueList = queue.songs.map((song, index) => {
            return `${index === 0 ? '**Now Playing:**' : `**${index}.**`} [${song.title}](${song.url}) (${song.duration})`;
        }).slice(0, 10).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`🎶 Music Queue (${queue.songs.length} songs)`)
            .setDescription(queueList)
            .setFooter({ text: queue.songs.length > 10 ? `...and ${queue.songs.length - 10} more` : 'End of queue' });

        await interaction.reply({ embeds: [embed] });
    }

    // --- VOICE FUN COMMANDS ---
    if (interaction.commandName === 'say') {
        const message = interaction.options.getString('message');
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            console.log(`[VOICE] Attempting to join ${voiceChannel.name} (${voiceChannel.id})`);
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            // Add error handling for connection
            connection.on('error', (error) => {
                console.error(`[VOICE] Connection Error: ${error.message}`);
                // Try to destroy
                try { connection.destroy(); } catch (e) {}
            });

            console.log(`[VOICE] Waiting for connection ready...`);
            // Reduced timeout to 15s to fail faster
            await entersState(connection, VoiceConnectionStatus.Ready, 15e3);
            console.log(`[VOICE] Connected! Generating TTS...`);

            const stream = discordTTS.getVoiceStream(message);
            const resource = createAudioResource(stream, { inlineVolume: true });
            resource.volume.setVolume(1.0);

            const player = createAudioPlayer();

            // Handle player errors
            player.on('error', error => {
                console.error(`[VOICE] Player Error: ${error.message}`);
            });

            player.play(resource);
            connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
                console.log(`[VOICE] Playback finished, disconnecting.`);
                connection.destroy();
            });

            await interaction.editReply({ content: `🗣️ Said: "${message}"` });

        } catch (error) {
            console.error(`[VOICE] Failed: ${error.message}`);
            // Check if connection exists and destroy it
            try { 
                const connection = getVoiceConnection(interaction.guild.id);
                if (connection) connection.destroy();
            } catch (e) {}
            
            await interaction.editReply({ content: `❌ Failed to join or speak: ${error.message}` });
        }
    }

    if (interaction.commandName === 'sound') {
        const effect = interaction.options.getString('effect');
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        // Use more reliable URLs (GitHub raw or similar if possible, but myinstants is okay for now)
        // Adding User-Agent or Referer logic is hard with simple string URL, but let's try.
        const sounds = {
            'vine-boom': 'https://www.myinstants.com/media/sounds/vine-boom.mp3',
            'bruh': 'https://www.myinstants.com/media/sounds/movie_1.mp3',
            'airhorn': 'https://www.myinstants.com/media/sounds/airhorn.mp3',
            'discord-join': 'https://www.myinstants.com/media/sounds/discord-join.mp3',
            'discord-leave': 'https://www.myinstants.com/media/sounds/discord-leave.mp3',
            'error': 'https://www.myinstants.com/media/sounds/windows-error.mp3'
        };

        const soundUrl = sounds[effect];

        if (!soundUrl) {
             return interaction.editReply({ content: '❌ Sound not found.' });
        }

        try {
            console.log(`[VOICE] Attempting to join ${voiceChannel.name} for sound effect`);
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            connection.on('error', (error) => {
                console.error(`[VOICE] Connection Error: ${error.message}`);
                try { connection.destroy(); } catch (e) {}
            });

            await entersState(connection, VoiceConnectionStatus.Ready, 15e3);
            console.log(`[VOICE] Connected! Playing sound...`);

            const resource = createAudioResource(soundUrl, { inlineVolume: true });
            resource.volume.setVolume(1.0);
            
            const player = createAudioPlayer();

            player.on('error', error => {
                console.error(`[VOICE] Player Error: ${error.message}`);
            });

            player.play(resource);
            connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
                console.log(`[VOICE] Sound finished, disconnecting.`);
                connection.destroy();
            });

            await interaction.editReply({ content: `🔊 Playing: **${effect}**` });

        } catch (error) {
            console.error(`[VOICE] Sound Failed: ${error.message}`);
            try { 
                const connection = getVoiceConnection(interaction.guild.id);
                if (connection) connection.destroy();
            } catch (e) {}

            await interaction.editReply({ content: `❌ Failed to play sound: ${error.message}` });
        }
    }
});

// --- VOICE STATE UPDATE LISTENER (Auto Kick) ---
client.on('voiceStateUpdate', async (oldState, newState) => {
    // Basic Debug Logging
    console.log(`[DEBUG] VoiceStateUpdate: ${newState.member ? newState.member.user.tag : 'Unknown User'} (${newState.id})`);
    if (newState.channelId) {
        console.log(`[DEBUG] Joined/Moved to Channel: ${newState.channel.name} (${newState.channelId})`);
    } else {
        console.log(`[DEBUG] Left Channel`);
    }

    // Check if user is in the auto-kick list
    if (autoKickUsers.has(newState.id)) {
        console.log(`[DEBUG] User ${newState.id} is in Auto-Kick list.`);
        // Check if they joined a channel (newState.channelId is not null)
        if (newState.channelId) {
            try {
                // Check permissions
                if (!newState.guild.members.me.permissions.has('MoveMembers')) {
                    console.error(`[AUTO-KICK] ERROR: Bot lacks 'Move Members' permission!`);
                    // Try to message somewhere? (optional)
                    return;
                }

                await newState.disconnect();
                const channelName = newState.channel ? newState.channel.name : 'Unknown Channel';
                console.log(`[AUTO-KICK] SUCCESS: Kicked ${newState.member ? newState.member.user.tag : newState.id} from ${channelName}`);
            } catch (err) {
                console.error(`[AUTO-KICK] Failed to kick ${newState.member ? newState.member.user.tag : newState.id}:`, err);
            }
        }
    } else {
        console.log(`[DEBUG] User ${newState.id} is NOT in Auto-Kick list.`);
    }
});

// --- Helper: Play Next Song ---
async function playNextSong(guildId) {
    const queue = musicQueues.get(guildId);
    if (!queue || queue.songs.length === 0) {
        // queue.connection.destroy();
        // musicQueues.delete(guildId);
        return;
    }

    const song = queue.songs[0];
    queue.isPlaying = true;

    try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type
        });

        queue.player.play(resource);
    } catch (error) {
        console.error('Error playing song:', error);
        queue.songs.shift();
        playNextSong(guildId);
    }
}

// --- Helper: Map v4 Match to v3 Structure ---
function mapV4MatchToV3(v4Match) {
    const redTeam = v4Match.teams ? v4Match.teams.find(t => t.team_id === 'Red') : null;
    const blueTeam = v4Match.teams ? v4Match.teams.find(t => t.team_id === 'Blue') : null;

    // Helper to safely get nested properties
    const safeGet = (obj, path, defaultVal = undefined) => {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj) || defaultVal;
    };

    const players = (v4Match.players || []).map(p => {
        // v4 players are flat array. 
        // We need to map to v3 structure: 
        // { name, tag, team, character, stats: { kills, deaths, assists, damage_made } }
        
        return {
            name: p.name,
            tag: p.tag,
            team: p.team_id || 'Neutral',
            character: safeGet(p, 'agent.name', 'Unknown'),
            currenttier_patched: safeGet(p, 'tier.name', 'Unranked'),
            stats: {
                kills: safeGet(p, 'stats.kills', 0),
                deaths: safeGet(p, 'stats.deaths', 0),
                assists: safeGet(p, 'stats.assists', 0),
                damage_made: safeGet(p, 'stats.damage.dealt', 0),
                headshots: safeGet(p, 'stats.headshots', 0),
                bodyshots: safeGet(p, 'stats.bodyshots', 0),
                legshots: safeGet(p, 'stats.legshots', 0),
                score: safeGet(p, 'stats.score', 0)
            }
        };
    });

    return {
        metadata: {
            matchid: v4Match.metadata.match_id,
            mode: safeGet(v4Match, 'metadata.queue.name') || v4Match.metadata.mode || 'Unknown',
            map: safeGet(v4Match, 'metadata.map.name', 'Unknown'),
            game_start: v4Match.metadata.started_at ? new Date(v4Match.metadata.started_at).getTime() / 1000 : 0,
            rounds_played: v4Match.metadata.rounds_played || (v4Match.rounds ? v4Match.rounds.length : 0),
            cluster: v4Match.metadata.cluster,
            region: v4Match.metadata.region,
            game_length: v4Match.metadata.game_length_in_ms ? Math.floor(v4Match.metadata.game_length_in_ms / 1000) : 0
        },
        players: {
            all_players: players
        },
        teams: {
            red: { has_won: redTeam ? redTeam.won : false },
            blue: { has_won: blueTeam ? blueTeam.won : false }
        }
    };
}

// --- Helper: Fetch More Matches (v4) ---
async function fetchMoreMatches(name, tag, region, start, mode = 'all', size = 100) {
    try {
        let url = `https://api.henrikdev.xyz/valorant/v4/matches/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=${size}&start=${start}`;
        if (mode && mode !== 'all') {
            url += `&mode=${mode}`;
        }
        
        const response = await axios.get(url, {
            headers: { 'Authorization': process.env.HENRIK_API_KEY }
        });

        if (response.status === 200 && response.data.data) {
            return response.data.data.map(mapV4MatchToV3);
        }
        return [];
    } catch (e) {
        console.error("Fetch More Matches Error:", e.message);
        return [];
    }
}

// --- Helper: Fetch Deep History with Smart Batching ---
async function fetchDeepHistory(interaction, name, tag, region, initialMatches, targetCount = 250) {
    let matches = [...initialMatches];
    let hasMore = true;
    let currentOffset = matches.length;
    const batchSize = 2; // Reduced from 5 to 2 to prevent rate limits/timeouts
    const matchesPerRequest = 10; // v4 limit

    // Only show progress message if we need to fetch a lot
    if (targetCount > 100) {
        await interaction.editReply(`⏳ Fetching extended match history... (Found ${matches.length} matches so far)`);
    }

    while (hasMore && matches.length < targetCount) {
        const promises = [];
        for (let i = 0; i < batchSize; i++) {
            const offset = currentOffset + (i * matchesPerRequest);
            promises.push(fetchMoreMatches(name, tag, region, offset, 'all', matchesPerRequest));
        }

        if (promises.length === 0) break;

        // Use Promise.allSettled to handle individual failures gracefully
        const results = await Promise.allSettled(promises);
        let batchNewMatches = [];
        
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value && result.value.length > 0) {
                batchNewMatches = batchNewMatches.concat(result.value);
            }
        });

        if (batchNewMatches.length === 0) {
            hasMore = false;
        } else {
            const existingIds = new Set(matches.map(m => m.metadata.matchid));
            const newUnique = batchNewMatches.filter(m => !existingIds.has(m.metadata.matchid));
            
            if (newUnique.length === 0) {
                hasMore = false; 
            } else {
                matches = matches.concat(newUnique);
                currentOffset += (batchSize * matchesPerRequest);
                
                // Update progress every 50 matches or so
                if (matches.length % 50 === 0) {
                    await interaction.editReply(`⏳ Fetching extended match history... (Found ${matches.length} matches so far)`);
                }
            }
        }
        
        // Small delay to be nice to API
        await new Promise(r => setTimeout(r, 200));
    }
    return matches;
}

// Extracted logic to support both /val and /scout
async function handleMatchHistory(interaction, name, tag, mode = 'all') {
    // If not already deferred (it should be now), defer it
    if (!interaction.deferred) await interaction.deferReply({ ephemeral: true });

    try {
        // 1. Get Account Data
        const accountResponse = await axios.get(`https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, {
            headers: { 'Authorization': process.env.HENRIK_API_KEY }
        });

        if (accountResponse.status !== 200 || !accountResponse.data.data) {
            return interaction.editReply('❌ Account not found. Please check the name and tag.');
        }

        const region = accountResponse.data.data.region;
        const accountData = accountResponse.data.data;
        
        // 2. Fetch MMR
        let rankName = 'Unranked';
        let rankEmoji = EMOJIS.rank_unranked;
        let currentRR = 0;
        let rankImage = '';

        try {
            const mmrResponse = await axios.get(`https://api.henrikdev.xyz/valorant/v1/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, {
                headers: { 'Authorization': process.env.HENRIK_API_KEY }
            });
            if (mmrResponse.data.data) {
                rankName = mmrResponse.data.data.currenttierpatched || 'Unranked';
                rankEmoji = getRankEmoji(rankName);
                currentRR = mmrResponse.data.data.ranking_in_tier || 0;
                rankImage = mmrResponse.data.data.images?.small || '';
                
                // Update user profile if linked
                if (userProfiles[interaction.user.id] && 
                    userProfiles[interaction.user.id].name === name && 
                    userProfiles[interaction.user.id].tag === tag) {
                    userProfiles[interaction.user.id].region = region;
                    userProfiles[interaction.user.id].elo = mmrResponse.data.data.elo;
                    userProfiles[interaction.user.id].rank = rankName;
                    saveUsers();
                }
            }
        } catch (e) {
            console.error("MMR Fetch Error:", e.message);
        }

        // 3. Fetch Matches (Try to get 100 via V4 API for better stats)
        let allMatches = [];
        try {
            // Use V4 API fetchMoreMatches for initial load to ensure we get ~100 matches if available
            // safeFetchMatches (V3) often defaults to 20 or 5 if V3 is acting up
            allMatches = await fetchMoreMatches(name, tag, region, 0, mode, 100);
            
            // Fallback to V3 if V4 returns nothing (just in case)
            if (allMatches.length === 0) {
                 const response = await safeFetchMatches(region, name, tag, 100, mode);
                 if (response && response.data && response.data.data) {
                     allMatches = response.data.data;
                 }
            }
        } catch (err) {
             console.error("Match Fetch Error:", err.message);
             // Try safe fetch as last resort
             try {
                const response = await safeFetchMatches(region, name, tag, 20, mode);
                if (response && response.data && response.data.data) {
                    allMatches = response.data.data;
                }
             } catch (e) {
                 return interaction.editReply('❌ An error occurred while fetching matches. API might be busy.');
             }
        }

        if (allMatches.length > 0) {
            // Fetch deep history only if explicitly requested or needed for stats (but limited)
            // For /val and /scout, we do NOT fetch deep history automatically to keep it fast.
            // Pagination will handle "Load More" logic if implemented, but for now we stick to 100 fast matches.
            
            const itemsPerPage = 10;
            let totalPages = Math.ceil(allMatches.length / itemsPerPage);
            let currentPage = 0;
            let noMoreMatches = false;

            // --- Helper: Calculate Stats ---
            const calculateStats = (matches) => {
                let totalKills = 0, totalDeaths = 0, totalAssists = 0;
                let wins = 0;
                let totalShots = 0, totalHeadshots = 0;
                let trendEmoji = []; 
                
                const agentStats = {}; 
                const mapStats = {};   

                matches.forEach((match, idx) => {
                    if (!match || !match.players || !match.players.all_players) return; // Skip invalid matches

                    const player = match.players.all_players.find(p => 
                        p.name.toLowerCase() === name.toLowerCase() && 
                        p.tag.toLowerCase() === tag.toLowerCase()
                    );
                    if (player) {
                        totalKills += player.stats.kills;
                        totalDeaths += player.stats.deaths;
                        totalAssists += player.stats.assists;
                        
                        // HS% Calculation
                        const shots = player.stats.shots || { head: 0, body: 0, leg: 0 };
                        const matchShots = shots.head + shots.body + shots.leg;
                        if (matchShots > 0) {
                            totalShots += matchShots;
                            totalHeadshots += shots.head;
                        }

                        const team = player.team ? player.team.toLowerCase() : 'neutral';
                        let won = false;
                        
                        if (match.teams && match.teams[team]) {
                            if (match.teams[team].has_won) {
                                wins++;
                                won = true;
                                if (idx < 10) trendEmoji.push(EMOJIS.win);
                            } else {
                                if (idx < 10) trendEmoji.push(EMOJIS.loss);
                            }
                        } else {
                            if (idx < 10) trendEmoji.push(EMOJIS.draw);
                        }

                        // Agent Stats
                        const agent = player.character || 'Unknown';
                        if (!agentStats[agent]) agentStats[agent] = { count: 0, wins: 0 };
                        agentStats[agent].count++;
                        if (won) agentStats[agent].wins++;

                        // Map Stats
                        const map = match.metadata.map || 'Unknown';
                        if (!mapStats[map]) mapStats[map] = { count: 0, wins: 0 };
                        mapStats[map].count++;
                        if (won) mapStats[map].wins++;
                    }
                });

                const avgKills = (totalKills / matches.length).toFixed(1);
                const avgDeaths = (totalDeaths / matches.length).toFixed(1);
                const kdaRatio = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills;
                const winRate = ((wins / matches.length) * 100).toFixed(0);
                const hsPercent = totalShots > 0 ? ((totalHeadshots / totalShots) * 100).toFixed(1) : 0;

                // Best Agent
                let bestAgent = 'None';
                let maxAgentCount = 0;
                for (const [agent, data] of Object.entries(agentStats)) {
                    if (data.count > maxAgentCount) {
                        maxAgentCount = data.count;
                        bestAgent = agent;
                    }
                }
                const agentIcon = getAgentEmoji(bestAgent);

                // Best Map
                let bestMap = 'None';
                let bestMapWR = -1;
                for (const [map, data] of Object.entries(mapStats)) {
                    const wr = (data.wins / data.count);
                    if (wr > bestMapWR) {
                        bestMapWR = wr;
                        bestMap = map;
                    }
                }
                const bestMapDisplay = bestMap !== 'None' ? `${bestMap} (${(bestMapWR * 100).toFixed(0)}% WR)` : 'N/A';

                return {
                    winRate, wins, losses: matches.length - wins,
                    kdaRatio, avgKills, avgDeaths, hsPercent,
                    bestAgent, maxAgentCount,
                    bestMapDisplay,
                    trendEmoji,
                    agentIcon
                };
            };

            const rankIcon = getRankEmoji(rankName);

            // --- Helper: Generate Embed for Page ---
            const generateEmbed = (page) => {
                const stats = calculateStats(allMatches);
                const start = page * itemsPerPage;
                const end = start + itemsPerPage;
                const pageMatches = allMatches.slice(start, end);

                let title = `${EMOJIS.rank} Match History`;
                if (mode && mode !== 'all') title = `${EMOJIS.rank} ${mode.charAt(0).toUpperCase() + mode.slice(1)} History`;

                const embed = new EmbedBuilder()
                    .setColor('#FF4655')
                    .setAuthor({ 
                        name: `${accountData.name}#${accountData.tag} | Level ${accountData.account_level}`, 
                        iconURL: accountData.card.small 
                    })
                    .setTitle(`${title} (Page ${page + 1}/${totalPages})`)
                    .setURL(`https://tracker.gg/valorant/profile/riot/${encodeURIComponent(name)}%23${encodeURIComponent(tag)}/overview`)
                    .setThumbnail(rankImage || accountData.card.small)
                    .setDescription(
                        `### ${rankIcon} **${rankName}**  •  ${currentRR} RR\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `${EMOJIS.trophy} **Win Rate**: \`${stats.winRate}%\` (${stats.wins}W - ${stats.losses}L) [Total ${allMatches.length}]\n` +
                        `${EMOJIS.kda} **K/D Ratio**: \`${stats.kdaRatio}\` (${stats.avgKills} / ${stats.avgDeaths})\n` +
                        `${EMOJIS.hs || '🎯'} **Headshot %**: \`${stats.hsPercent}%\`\n` +
                        `${stats.agentIcon} **Main Agent**: ${stats.bestAgent} (${stats.maxAgentCount} matches)\n` +
                        `${EMOJIS.map} **Best Map**: ${stats.bestMapDisplay}\n` +
                        `\n**Recent Trend (Last 10)**\n${stats.trendEmoji.join(' ')}\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
                    )
                    .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                    .setTimestamp();

                // Add Fields for Page Matches
                pageMatches.forEach((match) => {
                    const player = match.players.all_players.find(p => 
                        p.name.toLowerCase() === name.toLowerCase() && 
                        p.tag.toLowerCase() === tag.toLowerCase()
                    );
                    
                    if (player) {
                        const team = player.team ? player.team.toLowerCase() : 'neutral';
                        const won = (match.teams && match.teams[team]) ? match.teams[team].has_won : false;
                        const outcomeIcon = won ? EMOJIS.win : EMOJIS.loss;
                        const kda = `${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`;
                        const agent = player.character || 'Unknown';
                        const matchAgentIcon = getAgentEmoji(agent);
                        const rounds = (match.metadata.rounds_played || 1);
                        const damage = player.stats.damage_made || 0;
                        const adr = Math.round(damage / rounds);

                        embed.addFields({
                            name: `${outcomeIcon}  ${match.metadata.map}  (${match.metadata.mode})`,
                            value: `${matchAgentIcon} **${agent}** • KDA: ${kda} • ADR: ${adr}`,
                            inline: false
                        });
                    }
                });

                return embed;
            };

            // --- Helper: Generate Components ---
            const generateComponents = (page) => {
                const start = page * itemsPerPage;
                const end = start + itemsPerPage;
                const pageMatches = allMatches.slice(start, end);

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('match_select')
                    .setPlaceholder('Select a match for details...')
                    .setMaxValues(1);

                pageMatches.forEach(match => {
                        const player = match.players.all_players.find(p => 
                        p.name.toLowerCase() === name.toLowerCase() && 
                        p.tag.toLowerCase() === tag.toLowerCase()
                    );
                    if(player) {
                        const team = player.team ? player.team.toLowerCase() : 'neutral';
                        const won = (match.teams && match.teams[team]) ? match.teams[team].has_won : false;
                        const outcomeIcon = won ? EMOJIS.win : EMOJIS.loss;
                        const kda = `${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`;
                        const agent = player.character || 'Unknown';

                        selectMenu.addOptions({
                            label: `${match.metadata.map} (${match.metadata.mode})`,
                            description: `${won ? 'WIN' : 'LOSS'} | KDA: ${kda} | Agent: ${agent}`,
                            value: `${match.metadata.matchid}|${name}|${tag}`,
                            emoji: outcomeIcon.includes(':') ? outcomeIcon.split(':')[2].replace('>', '') : outcomeIcon
                        });
                    }
                });

                const row1 = new ActionRowBuilder().addComponents(selectMenu);

                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev_page')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('next_page')
                        .setLabel(page >= totalPages - 1 && !noMoreMatches ? 'Load More History' : 'Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(noMoreMatches && page >= totalPages - 1)
                );

                return [row1, row2];
            };

            const reply = await interaction.editReply({ 
                embeds: [generateEmbed(currentPage)], 
                components: generateComponents(currentPage) 
            });

            // Collector
            const collector = reply.createMessageComponentCollector({ time: 300000 });

            collector.on('collect', async i => {
                try {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({ content: 'Not your menu!', ephemeral: true });
                    }

                    if (i.customId === 'prev_page') {
                        if (currentPage > 0) {
                            currentPage--;
                            await i.update({ 
                                embeds: [generateEmbed(currentPage)], 
                                components: generateComponents(currentPage) 
                            });
                        }
                    } else if (i.customId === 'next_page') {
                        // Check if we need to load more matches to show the next page
                        // itemsPerPage is 10. If we are at page 9 (90-99), and total is 100, we need more for page 10.
                        const needsMore = (currentPage + 1) * itemsPerPage >= allMatches.length;
                        
                        if (!needsMore && currentPage < totalPages - 1) {
                            currentPage++;
                            await i.update({ 
                                embeds: [generateEmbed(currentPage)], 
                                components: generateComponents(currentPage) 
                            });
                        } else {
                            // Try to fetch more matches (Lazy Loading)
                            await i.deferUpdate();
                            
                            try {
                                // Fetch next batch (try to get +50 matches)
                                const targetCount = allMatches.length + 50;
                                // Pass a flag or null to indicate we don't want progress updates on the original interaction
                                // Actually fetchDeepHistory uses interaction.editReply.
                                // We should probably suppress that or handle it. 
                                // For now, let's just call it. The interaction object is still valid.
                                const updatedMatches = await fetchDeepHistory(interaction, name, tag, region, allMatches, targetCount);
                                
                                if (updatedMatches.length > allMatches.length) {
                                    allMatches = updatedMatches;
                                    totalPages = Math.ceil(allMatches.length / itemsPerPage);
                                    
                                    // Only increment page if we actually have data for it
                                    if ((currentPage + 1) * itemsPerPage < allMatches.length) {
                                        currentPage++;
                                    }
                                    
                                    await i.editReply({ 
                                        embeds: [generateEmbed(currentPage)], 
                                        components: generateComponents(currentPage) 
                                    });
                                } else {
                                    noMoreMatches = true;
                                    await i.editReply({ components: generateComponents(currentPage) });
                                    await i.followUp({ content: '⚠️ No more matches found in history.', ephemeral: true });
                                }
                            } catch (err) {
                                console.error("Error loading more matches:", err);
                                await i.editReply({ components: generateComponents(currentPage) });
                                await i.followUp({ content: '⚠️ Failed to load more matches. API might be busy.', ephemeral: true });
                            }
                        }
                    } else if (i.customId === 'match_select') {
                        const [matchId, pName, pTag] = i.values[0].split('|');
                        const match = allMatches.find(m => m.metadata.matchid === matchId);
                        
                        if (!match) return i.reply({ content: 'Error loading match data.', ephemeral: true });

                        const player = match.players.all_players.find(p => 
                            p.name.toLowerCase() === pName.toLowerCase() && 
                            p.tag.toLowerCase() === pTag.toLowerCase()
                        );

                        if (!player) return i.reply({ content: 'Error loading player data.', ephemeral: true });

                        // Detailed Match Stats
                        const agent = player.character || 'Unknown';
                        const matchAgentIcon = getAgentEmoji(agent);
                        const team = player.team ? player.team.toLowerCase() : 'neutral';
                        const won = (match.teams && match.teams[team]) ? match.teams[team].has_won : false;
                        
                        const kda = `${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`;
                        const rounds = (match.metadata.rounds_played || 1);
                        const damage = player.stats.damage_made || 0;
                        const adr = Math.round(damage / rounds);
                        
                        const shots = player.stats.shots || { head: 0, body: 0, leg: 0 };
                        const totalMatchShots = shots.head + shots.body + shots.leg;
                        const hsPercent = totalMatchShots > 0 ? Math.round((shots.head / totalMatchShots) * 100) : 0;
                        const bodyPercent = totalMatchShots > 0 ? Math.round((shots.body / totalMatchShots) * 100) : 0;
                        const legPercent = totalMatchShots > 0 ? Math.round((shots.leg / totalMatchShots) * 100) : 0;

                        const detailEmbed = new EmbedBuilder()
                            .setColor(won ? '#17E589' : '#FF4655')
                            .setTitle(`${matchAgentIcon} Match Details: ${match.metadata.map}`)
                            .setDescription(
                                `**Result**: ${won ? EMOJIS.win + ' VICTORY' : EMOJIS.loss + ' DEFEAT'}\n` +
                                `**Mode**: ${match.metadata.mode}\n` +
                                `**Score**: ${match.teams && match.teams[team] ? match.teams[team].rounds_won : 0} - ${match.teams && match.teams[team] ? match.teams[team].rounds_lost : 0}\n` +
                                `━━━━━━━━━━━━━━━━━━\n` +
                                `${EMOJIS.kda} **KDA**: \`${kda}\`\n` +
                                `${EMOJIS.hs} **HS%**: \`${hsPercent}%\`\n` +
                                `${EMOJIS.trophy} **ADR**: \`${adr}\`\n` +
                                `\n**Accuracy Breakdown**\n` +
                                `Head: ${hsPercent}% | Body: ${bodyPercent}% | Leg: ${legPercent}%`
                            )
                            .setThumbnail(player.assets.agent.small)
                            .setFooter({ text: `Played at ${match.metadata.started_at}` });

                        await i.reply({ embeds: [detailEmbed], ephemeral: true });
                    }
                } catch (err) {
                    console.error("Interaction Error:", err);
                    try { await i.reply({ content: 'An error occurred.', ephemeral: true }); } catch (e) {}
                }
            });

        } else {
            await interaction.editReply('No recent matches found for this player.');
        }
    } catch (error) {
        console.error(error);
        if (error.response && error.response.status === 404) {
            await interaction.editReply('Account not found (404). Check Name#Tag.');
        } else {
            await interaction.editReply('An error occurred while fetching data. API might be busy.');
        }
    }
}

client.login(process.env.DISCORD_TOKEN);
