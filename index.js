require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'summary-24h' || commandName === 'summary-week' || commandName === 'summary-month') {
    await interaction.deferReply();

    // Check if the channel has been indexed
    const indexedChannelRef = db.collection('indexed_channels').doc(interaction.channel.id);
    const indexedChannelDoc = await indexedChannelRef.get();
    if (!indexedChannelDoc.exists) {
        await interaction.editReply({ content: 'This channel has not been indexed yet. An admin must run the `/index-channel` command before summaries can be generated.'});
        return;
    }

    if (commandName === 'summary-month') {
        await interaction.followUp({ content: "Summarizing the last month... this might take a moment as I'm also checking for new messages."});
    }

    try {
        if (commandName === 'summary-24h' || commandName === 'summary-week') {
            let duration;
            let durationText;
            if (commandName === 'summary-24h') {
                duration = 1 * 24 * 60 * 60 * 1000;
                durationText = 'past 24 hours';
            } else { // summary-week
                duration = 7 * 24 * 60 * 60 * 1000;
                durationText = 'past week';
            }

            const sinceTimestamp = Date.now() - duration;
            const channel = interaction.channel;
            let allMessages = [];
            let lastId;

            // Fetch messages from Discord API
            while (true) {
                const options = { limit: 100 };
                if (lastId) {
                    options.before = lastId;
                }
                const messages = await channel.messages.fetch(options);
                const newMessages = messages.filter(m => m.createdTimestamp >= sinceTimestamp);
                allMessages.push(...newMessages.values());
                lastId = messages.lastKey();
                
                if (messages.size < 100 || (messages.last().createdTimestamp < sinceTimestamp)) {
                    break;
                }
            }

            if (allMessages.length === 0) {
                await interaction.editReply(`I couldn't find any messages in this channel from the ${durationText}.`);
                return;
            }

            const chatHistory = allMessages.reverse().map(m => `${m.author.username}: ${m.content}`).join('\n');
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest"});
            const prompt = `Based on the following chat history from the ${durationText}, create a summary story of what has been happening.\n\nChat History:\n${chatHistory}\n\nSummary Story:`;
          
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const replyContent = `**Summary for the ${durationText} in #${interaction.channel.name}**\n\n${text}`;

            if (replyContent.length > 2000) {
                const chunks = replyContent.match(/[\s\S]{1,2000}/g) || [];
                await interaction.editReply(chunks[0]);
                for (let i = 1; i < chunks.length; i++) {
                    await interaction.followUp(chunks[i]);
                }
            } else {
                await interaction.editReply(replyContent);
            }
        } else if (commandName === 'summary-month') {
            const days = 30;
            const durationText = 'past month';
            const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            const channelId = interaction.channel.id;

            // --- Backfill Logic ---
            const channel = interaction.channel;
            let lastId;
            while(true) {
                const options = { limit: 100 };
                if (lastId) options.before = lastId;

                const messages = await channel.messages.fetch(options);
                 if (messages.size === 0) break;

                const batch = db.batch();
                let messagesInBatch = 0;
                messages.forEach(message => {
                    if (message.createdTimestamp >= sinceDate.getTime() && !message.author.bot) {
                        const messageRef = db.collection('messages').doc(message.id);
                         batch.set(messageRef, {
                            channelId: message.channel.id,
                            guildId: message.guild.id,
                            authorId: message.author.id,
                            authorUsername: message.author.username,
                            content: message.content,
                            timestamp: message.createdAt,
                        }, { merge: true }); // Use merge to avoid overwriting existing data
                        messagesInBatch++;
                    }
                });

                if (messagesInBatch > 0) await batch.commit();
                lastId = messages.lastKey();
                if (messages.last().createdTimestamp < sinceDate.getTime()) break;
            }
            // --- End Backfill Logic ---

            const messagesSnapshot = await db.collection('messages')
                .where('channelId', '==', channelId)
                .where('timestamp', '>=', sinceDate)
                .orderBy('timestamp', 'asc')
                .get();
            
            if (messagesSnapshot.empty) {
                await interaction.editReply(`I couldn't find any messages in this channel from the ${durationText}.`);
                return;
            }

            const chatHistory = messagesSnapshot.docs.map(doc => {
                const data = doc.data();
                return `${data.authorUsername}: ${data.content}`;
            }).join('\n');

            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest"});
            const prompt = `Based on the following chat history from the ${durationText}, create a summary story of what has been happening.\n\nChat History:\n${chatHistory}\n\nSummary Story:`;
          
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const replyContent = `**Summary for the ${durationText} in #${interaction.channel.name}**\n\n${text}`;

            if (replyContent.length > 2000) {
                const chunks = replyContent.match(/[\s\S]{1,2000}/g) || [];
                await interaction.editReply(chunks[0]);
                for (let i = 1; i < chunks.length; i++) {
                    await interaction.followUp(chunks[i]);
                }
            } else {
                await interaction.editReply(replyContent);
            }
        }
    } catch (error) {
        console.error(`Error in ${commandName} command:`, error);
        await interaction.editReply('Sorry, I ran into an error while generating the summary!');
    }
  } else if (commandName === 'server-awards') {
    await interaction.deferReply();
    try {
      const duration = 30 * 24 * 60 * 60 * 1000; // 30 days
      const targetTimestamp = Date.now() - duration;

      let allMessages = [];
      let lastId;
      const maxFetches = 100; // Fetch up to 10,000 messages

      for (let i = 0; i < maxFetches; i++) {
        const options = { limit: 100 };
        if (lastId) {
          options.before = lastId;
        }
        const messages = await interaction.channel.messages.fetch(options);
        if (messages.size === 0) break;
        
        const newMessages = messages.filter(m => m.createdTimestamp >= targetTimestamp);
        allMessages.push(...newMessages.values());
        lastId = messages.lastKey();

        if (messages.last().createdTimestamp < targetTimestamp) break;
      }

      if (allMessages.length < 50) { // Require a minimum number of messages for a meaningful award
        await interaction.editReply("There hasn't been enough activity in the last month to generate awards. Keep chatting!");
        return;
      }

      const chatHistory = allMessages.reverse().map(m => `${m.author.username}: ${m.content}`).join('\n');
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
      const prompt = `You are a fun awards committee. Based on the entire chat log from the past month, announce winners for the following categories. Be creative and provide a brief, funny justification for each based on their messages:\n- 'The Night Owl Award' (most active late at night)\n- 'The Comedian Award' (most frequent use of jokes or funny messages)\n- 'The Main Character Award' (most mentioned user)\n- 'The Most Quotable Award'\n\nChat History:\n${chatHistory}\n\nAnd the winners are...`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const replyContent = `🏆 **This Month's Server Awards!** 🏆\n\n${text}`;
      if (replyContent.length > 2000) {
        const chunks = replyContent.match(/[\s\S]{1,2000}/g) || [];
        await interaction.editReply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp(chunks[i]);
        }
      } else {
        await interaction.editReply(replyContent);
      }
    } catch (error) {
      console.error(`Error in ${commandName} command:`, error);
      await interaction.editReply('Sorry, the awards committee is on a coffee break! An error occurred.');
    }
  } else if (commandName === 'index-channel') {
    // Acknowledge the command ephemerally
    await interaction.reply({ content: '✅ Understood. Beginning to index the history of this channel. This might take a while. I will notify you when it is complete.', ephemeral: true });
    
    try {
      let messageCount = 0;
      let lastId;
      const channel = interaction.channel;

      // Loop as long as there are messages to fetch
      while (true) {
        const options = { limit: 100 };
        if (lastId) {
          options.before = lastId;
        }

        const messages = await channel.messages.fetch(options);
        if (messages.size === 0) {
          break; // No more messages
        }
        
        // Use a batched write for efficiency
        const batch = db.batch();
        messages.forEach(message => {
          if (!message.author.bot) { // Ignore bots
            const messageRef = db.collection('messages').doc(message.id);
            batch.set(messageRef, {
              channelId: message.channel.id,
              guildId: message.guild.id,
              authorId: message.author.id,
              authorUsername: message.author.username,
              content: message.content,
              timestamp: message.createdAt,
            });
            messageCount++;
          }
        });
        
        await batch.commit();

        lastId = messages.lastKey();
      }

      // Send a follow-up ephemeral message
      await interaction.followUp({ content: `✅ Historical indexing complete! I have successfully indexed ${messageCount} messages for this channel.`, ephemeral: true });

      // Mark the channel as indexed in Firestore
      const indexedChannelRef = db.collection('indexed_channels').doc(channel.id);
      await indexedChannelRef.set({
          indexedAt: new Date(),
          guildId: interaction.guild.id,
          indexedBy: interaction.user.id
      });

    } catch (error) {
      console.error('Error during channel indexing:', error);
      await interaction.followUp({ content: '❌ An error occurred during the indexing process. Please check the logs.', ephemeral: true });
    }
  } else if (commandName === 'user') {
    await interaction.deferReply();
    try {
        const user = interaction.options.getUser('target');
        const guildId = interaction.guild.id;

        // Query firestore for messages from this user in this guild
        const messagesSnapshot = await db.collection('messages')
            .where('guildId', '==', guildId)
            .where('authorId', '==', user.id)
            .orderBy('timestamp', 'desc')
            .limit(200) // Get the most recent 200 messages
            .get();

        if (messagesSnapshot.empty) {
            await interaction.editReply("I couldn't find any messages from this user in the index. Have they talked recently?");
            return;
        }

        const userMessages = messagesSnapshot.docs.map(doc => doc.data().content);
        const chatHistory = userMessages.reverse().join('\n'); // reverse to get chronological order

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest"});
        const prompt = `Based on the following chat history of a user, create a summary of their personality, determine their MBTI type, and suggest an anime and pop culture character that matches them.\n\nChat History:\n${chatHistory}\n\nSummary:\nMBTI:\nAnime Match:\nPop Culture Match:`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
      
        if (text.length > 2000) {
            const chunks = text.match(/[\s\S]{1,2000}/g) || [];
            await interaction.editReply(chunks[0]);
            for (let i = 1; i < chunks.length; i++) {
                await interaction.followUp(chunks[i]);
            }
        } else {
            await interaction.editReply(text);
        }
    } catch (error) {
        console.error('Error in user command:', error);
        await interaction.editReply('Sorry, I ran into an error while creating the user summary!');
    }
  } else if (commandName === 'ask') {
    await interaction.deferReply();
    try {
      const question = interaction.options.getString('question');
      const channel = interaction.channel;
      const messages = await channel.messages.fetch({ limit: 100 });
      const chatHistory = messages.map(m => `${m.author.username}: ${m.content}`).join('\n');

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest"});
      const prompt = `Based on the following chat history, answer the user's question.\n\nChat History:\n${chatHistory}\n\nQuestion: ${question}\n\nAnswer:`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      const replyContent = `**Question:** ${question}\n\n**Answer:**\n${text}`;

      if (replyContent.length > 2000) {
        const chunks = replyContent.match(/[\s\S]{1,2000}/g) || [];
        await interaction.editReply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp(chunks[i]);
        }
      } else {
        await interaction.editReply(replyContent);
      }
    } catch (error) {
      console.error('Error in ask command:', error);
      await interaction.editReply('Sorry, I ran into an error while answering your question!');
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return; // Ignore bots

  try {
    const messageRef = db.collection('messages').doc(message.id);
    await messageRef.set({
      channelId: message.channel.id,
      guildId: message.guild.id,
      authorId: message.author.id,
      authorUsername: message.author.username,
      content: message.content,
      timestamp: message.createdAt,
    });
  } catch (error) {
    console.error('Error saving message to Firestore:', error);
  }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (newMessage.author.bot) return;

  try {
    const messageRef = db.collection('messages').doc(newMessage.id);
    await messageRef.update({
      content: newMessage.content,
      editedAt: new Date(),
    });
  } catch (error) {
    console.error('Error updating message in Firestore:', error);
  }
});

client.on('messageDelete', async message => {
  try {
    const messageRef = db.collection('messages').doc(message.id);
    await messageRef.delete();
  } catch (error) {
    console.error('Error deleting message from Firestore:', error);
  }
});

client.login(process.env.DISCORD_TOKEN); 