require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.GuildVoiceStates, 
        GatewayIntentBits.GuildMembers 
    ] 
});

const BOT_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const channelData = new Map();

function getChannelData(channelId) {
    if (!channelData.has(channelId)) {
        channelData.set(channelId, {
            queue: [],
            currentSpeaker: null,
            lastMessageId: null
        });
    }
    return channelData.get(channelId);
}

function createQueueEmbed(data) {
    const list = data.queue.length > 0 
        ? data.queue.map((id, i) => `**${i + 1}.** <@${id}>`).join('\n') 
        : "*The queue is empty. Anyone can chat!*";

    return new EmbedBuilder()
        .setTitle("💤 Drowsy Speaker Queue")
        .setDescription(`**Currently on the Mic:** ${data.currentSpeaker ? `<@${data.currentSpeaker}>` : "Open Mic"}\n\n**Up Next:**\n${list}`)
        .setColor(0x5865F2)
        .setFooter({ text: "Join the line to get your turn! Must be in VC." })
        .setTimestamp();
}

function createButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('Join Queue').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('finished').setLabel('Done Speaking 🏁').setStyle(ButtonStyle.Success)
    );
}

// --- Admin Restricted Commands ---
const commands = [
    new SlashCommandBuilder()
        .setName('start-queue')
        .setDescription('Admin only: Start a separate queue in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
        .setName('stop-queue')
        .setDescription('Admin only: Delete the queue and stop event in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Repost the queue at the bottom of this channel'),
    new SlashCommandBuilder()
        .setName('next')
        .setDescription('Admin only: Move the highlight to the next person')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
].map(command => command.toJSON());

client.once('clientReady', async () => {
    console.log(`🎙️ Drowsy Vocals Admin-Controlled Mode is online!`);
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log('✅ Admin commands registered!');
    } catch (e) { console.error(e); }
});

async function refreshPopup(channel) {
    const data = getChannelData(channel.id);

    if (data.lastMessageId) {
        try {
            const oldMsg = await channel.messages.fetch(data.lastMessageId);
            if (oldMsg) await oldMsg.delete();
        } catch (e) { /* Already deleted */ }
    }

    const newMsg = await channel.send({ 
        embeds: [createQueueEmbed(data)], 
        components: [createButtonRow()] 
    });
    data.lastMessageId = newMsg.id;
}

client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;
    const data = getChannelData(interaction.channelId);

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'start-queue' || commandName === 'queue') {
            await interaction.reply({ content: "Refreshing channel queue...", ephemeral: true });
            await refreshPopup(interaction.channel);
        }

        if (commandName === 'stop-queue') {
            // Delete the last message if it exists
            if (data.lastMessageId) {
                try {
                    const oldMsg = await interaction.channel.messages.fetch(data.lastMessageId);
                    if (oldMsg) await oldMsg.delete();
                } catch (e) {}
            }
            // Remove the channel data entirely
            channelData.delete(interaction.channelId);
            await interaction.reply({ content: "🏁 The event in this channel has been stopped and the queue deleted.", ephemeral: false });
        }

        if (commandName === 'next') {
            await handleNextSpeaker(interaction.channel, data);
            await interaction.reply({ content: "Highlight moved.", ephemeral: true });
            await refreshPopup(interaction.channel);
        }
    }

    if (interaction.isButton()) {
        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (interaction.customId === 'join') {
            if (!member.voice.channel) return interaction.reply({ content: "❌ Join the VC first!", ephemeral: true });
            if (data.queue.includes(interaction.user.id)) return interaction.reply({ content: "Already in line!", ephemeral: true });
            data.queue.push(interaction.user.id);
        }

        if (interaction.customId === 'leave') {
            const wasSpeaker = data.currentSpeaker === interaction.user.id;
            data.queue = data.queue.filter(id => id !== interaction.user.id);
            if (wasSpeaker) {
                data.currentSpeaker = null;
                await handleNextSpeaker(interaction.channel, data);
            }
        }

        if (interaction.customId === 'finished') {
            if (interaction.user.id !== data.currentSpeaker) {
                return interaction.reply({ content: "It's not your turn yet!", ephemeral: true });
            }
            await handleNextSpeaker(interaction.channel, data);
        }

        await interaction.deferUpdate();
        await refreshPopup(interaction.channel);
    }
});

async function handleNextSpeaker(channel, data) {
    if (data.queue.length > 0) {
        data.currentSpeaker = data.queue.shift();
        await channel.send(`🎙️ **It's now <@${data.currentSpeaker}>'s turn!**`);
    } else {
        data.currentSpeaker = null;
        await channel.send("📭 The queue is now empty.");
    }
}

client.login(process.env.DISCORD_TOKEN);