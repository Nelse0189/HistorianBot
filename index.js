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

  if (commandName === 'summary') {
    await interaction.deferReply();
    try {
      const channel = interaction.channel;
      const messages = await channel.messages.fetch({ limit: 100 });
      const chatHistory = messages.map(m => `${m.author.username}: ${m.content}`).join('\n');

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash"});
      const prompt = `Based on the following chat history of a Discord server, create a summary story of what has been happening in the server.\n\nChat History:\n${chatHistory}\n\nSummary Story:`;
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
      console.error('Error in summary command:', error);
      await interaction.editReply('Sorry, I ran into an error while creating the server summary!');
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