const { SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
require('dotenv').config();

const commands = [
	new SlashCommandBuilder().setName('summary').setDescription('Creates a summary story of the Discord server.'),
	new SlashCommandBuilder().setName('user').setDescription('Gets a summary of a user, their MBTI, anime and pop culture match.')
		.addUserOption(option => option.setName('target').setDescription('The user to summarize').setRequired(true)),
	new SlashCommandBuilder().setName('ask').setDescription('Ask the bot anything about the discord server.')
		.addStringOption(option => option.setName('question').setDescription('The question to ask').setRequired(true)),
]
	.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})(); 