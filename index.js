// ============================================================
//  BOT DE CARGOS - Discord.js v14
//  Comandos: !addcargo  e  !remcargo
// ============================================================

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
} = require("discord.js");
require("dotenv").config();

const PREFIX = "!";

// Quantos segundos a resposta do bot fica visível antes de se apagar sozinha
const SEGUNDOS_ATE_APAGAR_RESPOSTA = 5;

// Nomes dos ÚNICOS cargos autorizados a usar !addcargo / !remcargo
// (nem que seja para si próprios). Quem não tiver nenhum destes
// cargos fica automaticamente bloqueado. O dono do servidor está
// sempre isento desta regra.
const CARGOS_AUTORIZADOS = ["Coordenador", "ADM", "Auxiliar", "Resp.Pastas", "Moderador", "LIDERANÇA", "Diretor Geral", "CEO"];

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

  // Remove caracteres invisíveis que às vezes vêm ao colar (zero-width, etc.)
  texto = texto.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();

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

// ------------------------------------------------------------
// Envia uma resposta e apaga-a automaticamente ao fim de alguns
// segundos, para não sujar o chat.
// ------------------------------------------------------------
async function responderTemporario(message, conteudo) {
  try {
    const resposta = await message.channel.send(conteudo);
    setTimeout(() => {
      resposta.delete().catch(() => {});
    }, SEGUNDOS_ATE_APAGAR_RESPOSTA * 1000);
  } catch (erro) {
    console.error("Erro ao enviar/apagar resposta:", erro);
  }
}

// ------------------------------------------------------------
// Cria um embed de sucesso com o ícone do servidor e um aviso
// de que a mensagem vai ser apagada automaticamente.
// ------------------------------------------------------------
function criarEmbedSucesso(guild, descricao, cor) {
  const iconeServidor = guild.iconURL({ size: 512 });

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setAuthor({
      name: guild.name,
      iconURL: iconeServidor || undefined,
    })
    .setTitle("Gestão de Cargos")
    .setDescription(`### ${descricao}`)
    .setFooter({
      text: `⏳ Esta mensagem será excluída em ${SEGUNDOS_ATE_APAGAR_RESPOSTA}s`,
      iconURL: iconeServidor || undefined,
    })
    .setTimestamp();

  if (iconeServidor) {
    embed.setThumbnail(iconeServidor);
  }

  return embed;
}

// ------------------------------------------------------------
// Envia um embed de sucesso e apaga-o automaticamente ao fim
// de alguns segundos.
// ------------------------------------------------------------
async function responderEmbedTemporario(message, descricao, cor = 0x57f287) {
  try {
    const embed = criarEmbedSucesso(message.guild, descricao, cor);
    const resposta = await message.channel.send({ embeds: [embed] });
    setTimeout(() => {
      resposta.delete().catch(() => {});
    }, SEGUNDOS_ATE_APAGAR_RESPOSTA * 1000);
  } catch (erro) {
    console.error("Erro ao enviar/apagar resposta:", erro);
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return; // ignora DMs
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const comando = args.shift().toLowerCase();

  if (comando !== "addcargo" && comando !== "remcargo") return;

  // Apaga a mensagem do comando imediatamente (se o bot tiver permissão)
  message.delete().catch(() => {});

  // --------------------------------------------------------
  // Só quem tiver um dos CARGOS_AUTORIZADOS pode usar o
  // comando. O dono do servidor está sempre isento.
  // --------------------------------------------------------
  const ehDonoServidor = message.guild.ownerId === message.author.id;
  const temCargoAutorizado = message.member.roles.cache.some((r) =>
    CARGOS_AUTORIZADOS.some((nome) => nome.toLowerCase() === r.name.toLowerCase())
  );

  if (!ehDonoServidor && !temCargoAutorizado) {
    return responderTemporario(
      message,
      "❌ O teu cargo não tem permissão para usar este comando."
    );
  }

  // --------------------------------------------------------
  // Permissões do BOT: precisa de "Gerir Cargos"
  // --------------------------------------------------------
  const botMember = message.guild.members.me;
  if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return responderTemporario(
      message,
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
    return responderTemporario(
      message,
      `⚠️ Uso correto: \`${PREFIX}${comando} @Cargo [@Utilizador]\``
    );
  }

  const cargo = encontrarCargo(message.guild, args[0]);
  if (!cargo) {
    return responderTemporario(
      message,
      "❌ Não encontrei esse cargo. Verifica o nome ou menciona-o com @."
    );
  }

  // Cargo tem de estar abaixo do cargo mais alto do BOT
  // (limitação do próprio Discord — não é possível contornar)
  if (cargo.position >= botMember.roles.highest.position) {
    return responderTemporario(
      message,
      "❌ Esse cargo está acima (ou igual) da minha posição na hierarquia. Move o meu cargo para cima nas Definições do Servidor."
    );
  }

  // Determinar o alvo (utilizador que vai receber/perder o cargo)
  let membroAlvo = message.member;
  const mencaoUtilizador = message.mentions.members?.first();
  const ehDono = message.guild.ownerId === message.author.id;

  if (mencaoUtilizador) {
    // ----------------------------------------------------
    // Hierarquia do UTILIZADOR: para atribuir/remover um
    // cargo a OUTRA pessoa, o cargo tem de estar ABAIXO do
    // cargo mais alto de quem executa o comando. Não é
    // exigida a permissão "Gerir Cargos" do Discord — basta
    // teres um cargo acima do que estás a dar (ex: ADM).
    // O dono do servidor está sempre isento.
    // ----------------------------------------------------
    if (!ehDono && cargo.position >= message.member.roles.highest.position) {
      return responderTemporario(
        message,
        "❌ Não podes atribuir/remover a outra pessoa um cargo igual ou superior ao teu cargo mais alto."
      );
    }

    membroAlvo = mencaoUtilizador;
  }

  try {
    if (comando === "addcargo") {
      if (membroAlvo.roles.cache.has(cargo.id)) {
        return responderEmbedTemporario(
          message,
          `ℹ️ ${membroAlvo} já tem o cargo **${cargo.name}**.`,
          0xfee75c
        );
      }
      await membroAlvo.roles.add(cargo);
      return responderEmbedTemporario(
        message,
        `✅ Cargo **${cargo.name}** adicionado a ${membroAlvo}.\n\n⚠️ Agora você tem mais responsabilidade dentro do servidor — use o cargo com respeito e siga as regras.`
      );
    }

    if (comando === "remcargo") {
      if (!membroAlvo.roles.cache.has(cargo.id)) {
        return responderEmbedTemporario(
          message,
          `ℹ️ ${membroAlvo} não tem o cargo **${cargo.name}**.`,
          0xfee75c
        );
      }
      await membroAlvo.roles.remove(cargo);
      return responderEmbedTemporario(
        message,
        `✅ Cargo **${cargo.name}** removido de ${membroAlvo}.`,
        0xed4245
      );
    }
  } catch (erro) {
    console.error(erro);
    return responderTemporario(message, "❌ Ocorreu um erro ao alterar o cargo.");
  }
});

client.login(process.env.TOKEN);
