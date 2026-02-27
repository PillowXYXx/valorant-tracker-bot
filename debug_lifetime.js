
const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.HENRIK_API_KEY;
const NAME = 'FQD Pillow';
const TAG = '10YJ';
const REGION = 'eu';

async function debugStats() {
    try {
        console.log(`Fetching data for ${NAME}#${TAG}...`);

        // 3. Matches Endpoint (Check max size)
        console.log('\n--- Matches Endpoint (Size=100) ---');
        try {
            const matches = await axios.get(`https://api.henrikdev.xyz/valorant/v3/matches/${REGION}/${encodeURIComponent(NAME)}/${encodeURIComponent(TAG)}?size=100`, {
                headers: { 'Authorization': API_KEY }
            });
            console.log(`Fetched ${matches.data.data.length} matches.`);
            if (matches.data.data.length > 0) {
                console.log('Sample Match Metadata:', matches.data.data[0].metadata);
            }
        } catch (e) {
            console.log('Error fetching matches:', e.message);
        }

    } catch (error) {
        console.error('Fatal Error:', error);
    }
}

debugStats();
