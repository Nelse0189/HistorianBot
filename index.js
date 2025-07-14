require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// const admin = require('firebase-admin');
// const serviceAccount = require('./firebase-service-account-key.json');

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'summary-24h' || commandName === 'summary-week' || commandName === 'summary-month') {
    await interaction.deferReply();
    try {
      let duration;
      let durationText;
      if (commandName === 'summary-24h') {
        duration = 24 * 60 * 60 * 1000;
        durationText = 'last 24 hours';
      } else if (commandName === 'summary-week') {
        duration = 7 * 24 * 60 * 60 * 1000;
        durationText = 'last 7 days';
      } else { // summary-month
        duration = 30 * 24 * 60 * 60 * 1000;
        durationText = 'last 30 days';
      }

      const targetTimestamp = Date.now() - duration;

      let allMessages = [];
      let lastId;
      const maxFetches = 40; // Fetch up to 4000 messages

      for (let i = 0; i < maxFetches; i++) {
        const options = { limit: 100 };
        if (lastId) {
          options.before = lastId;
        }
        const messages = await interaction.channel.messages.fetch(options);
        if (messages.size === 0) {
          break;
        }
        const newMessages = messages.filter(m => m.createdTimestamp >= targetTimestamp);
        allMessages.push(...newMessages.values());
        lastId = messages.lastKey();
        if (messages.last().createdTimestamp < targetTimestamp) {
          break;
        }
      }

      if (allMessages.length === 0) {
        await interaction.editReply(`No messages found in the ${durationText}.`);
        return;
      }
      
      const chatHistory = allMessages.reverse().map(m => `${m.author.username}: ${m.content}`).join('\n');
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `Based on the following chat history from the ${durationText}, create a summary story of what has been happening.\n\nChat History:\n${chatHistory}\n\nSummary Story:`;
      
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
      console.error(`Error in ${commandName} command:`, error);
      await interaction.editReply('Sorry, I ran into an error while creating the summary!');
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
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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
  } else if (commandName === 'user') {
    await interaction.deferReply();
    try {
      const user = interaction.options.getUser('target');
      const channel = interaction.channel;
      const messages = await channel.messages.fetch({ limit: 100 });
      const userMessages = messages.filter(m => m.author.id === user.id);
      const chatHistory = userMessages.map(m => m.content).join('\n');

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash"});
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

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash"});
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

client.login(process.env.DISCORD_TOKEN); 