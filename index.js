// ============================================================
//  BOT DE CARGOS - Discord.js v14
//  Comandos: !addcargo  e  !remcargo
// ============================================================

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
} = require("discord.js");
require("dotenv").config();

const PREFIX = "!";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember],
});

client.once("ready", () => {
  console.log(`✅ Bot ligado como ${client.user.tag}`);
});

// ------------------------------------------------------------
// Função auxiliar: encontra o cargo (role) a partir do que o
// utilizador escreveu — pode ser uma menção (@Cargo), um ID,
// ou o nome do cargo (ex: "VIP").
// ------------------------------------------------------------
function encontrarCargo(guild, texto) {
  if (!texto) return null;

  // Menção de cargo: <@&123456789>
  const mencaoMatch = texto.match(/^<@&(\d+)>$/);
  if (mencaoMatch) {
    return guild.roles.cache.get(mencaoMatch[1]) || null;
  }

  // ID direto
  if (/^\d+$/.test(texto)) {
    return guild.roles.cache.get(texto) || null;
  }

  // Nome do cargo (ignora maiúsculas/minúsculas)
  return (
    guild.roles.cache.find(
      (r) => r.name.toLowerCase() === texto.toLowerCase()
    ) || null
  );
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return; // ignora DMs
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const comando = args.shift().toLowerCase();

  if (comando !== "addcargo" && comando !== "remcargo") return;

  // --------------------------------------------------------
  // Permissões do BOT: precisa de "Gerir Cargos"
  // --------------------------------------------------------
  const botMember = message.guild.members.me;
  if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return message.reply(
      "❌ Não tenho permissão de **Gerir Cargos** neste servidor."
    );
  }

  // --------------------------------------------------------
  // Uso: !addcargo @Cargo [@Utilizador]
  // Se não indicares um utilizador, o cargo é aplicado a ti.
  // Para atribuir a OUTRO utilizador precisas de ter permissão
  // de "Gerir Cargos".
  // --------------------------------------------------------
  if (args.length === 0) {
    return message.reply(
      `⚠️ Uso correto: \`${PREFIX}${comando} @Cargo [@Utilizador]\``
    );
  }

  const cargo = encontrarCargo(message.guild, args[0]);
  if (!cargo) {
    return message.reply("❌ Não encontrei esse cargo. Verifica o nome ou menciona-o com @.");
  }

  // Cargo tem de estar abaixo do cargo mais alto do bot
  if (cargo.position >= botMember.roles.highest.position) {
    return message.reply(
      "❌ Esse cargo está acima (ou igual) da minha posição na hierarquia. Move o meu cargo para cima nas Definições do Servidor."
    );
  }

  // Determinar o alvo (utilizador que vai receber/perder o cargo)
  let membroAlvo = message.member;
  const mencaoUtilizador = message.mentions.members?.first();

  if (mencaoUtilizador) {
    // Só quem tem "Gerir Cargos" pode atribuir a outra pessoa
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return message.reply(
        "❌ Só podes atribuir cargos a outras pessoas se tiveres permissão de **Gerir Cargos**."
      );
    }
    membroAlvo = mencaoUtilizador;
  }

  try {
    if (comando === "addcargo") {
      if (membroAlvo.roles.cache.has(cargo.id)) {
        return message.reply(`ℹ️ ${membroAlvo} já tem o cargo **${cargo.name}**.`);
      }
      await membroAlvo.roles.add(cargo);
      return message.reply(`✅ Cargo **${cargo.name}** adicionado a ${membroAlvo}.`);
    }

    if (comando === "remcargo") {
      if (!membroAlvo.roles.cache.has(cargo.id)) {
        return message.reply(`ℹ️ ${membroAlvo} não tem o cargo **${cargo.name}**.`);
      }
      await membroAlvo.roles.remove(cargo);
      return message.reply(`✅ Cargo **${cargo.name}** removido de ${membroAlvo}.`);
    }
  } catch (erro) {
    console.error(erro);
    return message.reply("❌ Ocorreu um erro ao alterar o cargo.");
  }
});

client.login(process.env.TOKEN);
