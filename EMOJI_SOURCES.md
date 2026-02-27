# Where to find Valorant Emojis

Since I can't upload files directly to your Discord server, you'll need to grab the images you like and upload them yourself. Here are the best places to find them:

### 1. The Best Collection (Recommended)
**[Emoji.gg - Valorant Section](https://emoji.gg/emojis/valorant)**
- This site has thousands of ready-to-use Discord emojis.
- Search for "Vandal", "Phantom", "Jett", "Radiant", etc.
- **How to use**:
  1. Click the emoji you like.
  2. Click **"Download"**.
  3. Go to your **Discord Server Settings** -> **Emoji** -> **Upload Emoji**.

### 2. Official Game Icons
If you want the raw official icons (like rank images or agent faces), you can find them here:
- **[Valorant-API Assets](https://valorant-api.com/)** (For developers, but has all images)
- **[Valorant Wiki](https://valorant.fandom.com/wiki/Category:Icons)**

---

# How to Add Them to Your Bot

Once you have uploaded your emojis to your Discord server:

1. **Get the Emoji ID**:
   - Type the emoji in any Discord channel like this: `\:my_emoji_name:`
   - (Make sure to put a backslash `\` before the name!)
   - Discord will send a message looking like this: `<:my_emoji_name:123456789012345678>`

2. **Update `index.js`**:
   - Open `index.js` in this folder.
   - Look for the **`EMOJIS`** section at the top (lines 11-30).
   - Paste your new ID inside the quotes.

   **Example:**
   ```javascript
   const EMOJIS = {
       win: '<:my_win_icon:123456789012345678>',
       loss: '<:my_loss_icon:987654321098765432>',
       // ...
   };
   ```

3. **Restart the Bot**:
   - Run `start_bot.bat` or type `npm start` to see your changes!
