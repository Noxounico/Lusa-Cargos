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

// Hierarquia dos cargos autorizados a usar !addcargo / !remcargo,
// por ID, do MAIS poderoso (posição 0) para o MENOS poderoso.
// Só quem tiver um destes cargos pode usar o comando (nem que
// seja para si próprio). Além disso, ninguém pode executar o
// comando sobre alguém cujo cargo esteja na mesma posição ou
// acima na lista (ex: posição 1 não pode agir sobre posição 0).
// O dono do servidor está sempre isento.
const HIERARQUIA_CARGOS = [
  "1521632441645793507",
  "1521674972911636520",
  "1541476943894020209",
  "1541476948725989607",
  "1541476951544303697",
  "1541476974328029284",
  "1541477106880610334",
  "1541476953960489101",
  "1541476956707627088",
  "1541476959295381514",
];

// Nome exato dos cargos usados pelo !classificarmembros.
// Ajusta se os nomes reais no servidor forem diferentes.
const NOME_CARGO_CIDADAO = "Cidadão";
const NOME_CARGO_VISITANTE = "Visitante";

// Um nome/nickname é considerado "de Cidadão" se:
// - contiver a palavra "PRÉ" (ou "PRE"), OU
// - terminar em números (ex: "... | 1579")
function nomeEhDeCidadao(nome) {
  if (!nome) return false;
  const temPre = /\bpr[eé]\b/i.test(nome);
  const terminaEmNumero = /\d+\s*$/.test(nome.trim());
  return temPre || terminaEmNumero;
}

// Devolve a posição (índice) mais alta que um membro tem na
// hierarquia acima, ou -1 se não tiver nenhum desses cargos.
function obterRankAutorizado(member) {
  let melhorRank = -1;
  for (const [indice, idCargo] of HIERARQUIA_CARGOS.entries()) {
    if (member.roles.cache.has(idCargo)) {
      if (melhorRank === -1 || indice < melhorRank) {
        melhorRank = indice;
      }
    }
  }
  return melhorRank;
}

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

  // ============================================================
  // Comando especial: !addcargotodos @Cargo
  // Dá o cargo indicado a TODOS os membros do servidor.
  // Só o cargo de topo da hierarquia (posição 0) ou o dono do
  // servidor podem usar isto, por ser uma ação em massa.
  // ============================================================
  if (comando === "addcargotodos") {
    message.delete().catch(() => {});

    const ehDonoServidor = message.guild.ownerId === message.author.id;
    const rankExecutor = obterRankAutorizado(message.member);

    if (!ehDonoServidor && rankExecutor !== 0) {
      return responderTemporario(
        message,
        "❌ Só o cargo de topo da hierarquia (ou o dono do servidor) pode usar este comando."
      );
    }

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return responderTemporario(
        message,
        "❌ Não tenho permissão de **Gerir Cargos** neste servidor."
      );
    }

    if (args.length === 0) {
      return responderTemporario(
        message,
        `⚠️ Uso correto: \`${PREFIX}addcargotodos @Cargo\``
      );
    }

    const cargo = encontrarCargo(message.guild, args[0]);
    if (!cargo) {
      return responderTemporario(
        message,
        "❌ Não encontrei esse cargo. Verifica o nome ou menciona-o com @."
      );
    }

    if (cargo.position >= botMember.roles.highest.position) {
      return responderTemporario(
        message,
        "❌ Esse cargo está acima (ou igual) da minha posição na hierarquia. Move o meu cargo para cima nas Definições do Servidor."
      );
    }

    const avisoInicio = await message.channel.send(
      `⏳ A adicionar o cargo **${cargo.name}** a todos os membros... isto pode demorar um pouco.`
    );

    try {
      const membros = await message.guild.members.fetch();
      let adicionados = 0;
      let jaTinham = 0;
      let falhas = 0;

      for (const membro of membros.values()) {
        if (membro.user.bot) continue; // ignora bots
        if (membro.roles.cache.has(cargo.id)) {
          jaTinham++;
          continue;
        }
        try {
          await membro.roles.add(cargo);
          adicionados++;
        } catch {
          falhas++;
        }
        // Pequena pausa para não bater no limite de pedidos do Discord
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      await avisoInicio.delete().catch(() => {});
      return responderEmbedTemporario(
        message,
        `✅ Cargo **${cargo.name}** aplicado em massa.\n\n➕ Adicionados: **${adicionados}**\nℹ️ Já tinham: **${jaTinham}**\n❌ Falhas: **${falhas}**`
      );
    } catch (erro) {
      console.error(erro);
      await avisoInicio.delete().catch(() => {});
      return responderTemporario(message, "❌ Ocorreu um erro ao aplicar o cargo em massa.");
    }
  }

  // ============================================================
  // Comando especial: !classificarmembros
  // Analisa o nickname/nome de todos os membros:
  // - Se tiver "PRÉ"/"PRE" ou terminar em números -> Cidadão
  // - Caso contrário -> Visitante
  // Só o cargo de topo da hierarquia (posição 0) ou o dono do
  // servidor podem usar isto, por ser uma ação em massa.
  // ============================================================
  if (comando === "classificarmembros") {
    message.delete().catch(() => {});

    const ehDonoServidor = message.guild.ownerId === message.author.id;
    const rankExecutor = obterRankAutorizado(message.member);

    if (!ehDonoServidor && rankExecutor !== 0) {
      return responderTemporario(
        message,
        "❌ Só o cargo de topo da hierarquia (ou o dono do servidor) pode usar este comando."
      );
    }

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return responderTemporario(
        message,
        "❌ Não tenho permissão de **Gerir Cargos** neste servidor."
      );
    }

    const cargoCidadao = message.guild.roles.cache.find(
      (r) => r.name.toLowerCase() === NOME_CARGO_CIDADAO.toLowerCase()
    );
    const cargoVisitante = message.guild.roles.cache.find(
      (r) => r.name.toLowerCase() === NOME_CARGO_VISITANTE.toLowerCase()
    );

    if (!cargoCidadao || !cargoVisitante) {
      return responderTemporario(
        message,
        `❌ Não encontrei o cargo **${NOME_CARGO_CIDADAO}** e/ou **${NOME_CARGO_VISITANTE}**. Confirma os nomes exatos no servidor.`
      );
    }

    if (
      cargoCidadao.position >= botMember.roles.highest.position ||
      cargoVisitante.position >= botMember.roles.highest.position
    ) {
      return responderTemporario(
        message,
        "❌ Um dos cargos está acima (ou igual) da minha posição na hierarquia. Move o meu cargo para cima nas Definições do Servidor."
      );
    }

    const avisoInicio = await message.channel.send(
      "⏳ A analisar e classificar todos os membros... isto pode demorar um pouco."
    );

    try {
      const membros = await message.guild.members.fetch();
      let marcadosCidadao = 0;
      let marcadosVisitante = 0;
      let falhas = 0;

      for (const membro of membros.values()) {
        if (membro.user.bot) continue; // ignora bots

        const nome = membro.nickname || membro.user.username;
        const ehCidadao = nomeEhDeCidadao(nome);

        try {
          if (ehCidadao) {
            if (!membro.roles.cache.has(cargoCidadao.id)) {
              await membro.roles.add(cargoCidadao);
            }
            if (membro.roles.cache.has(cargoVisitante.id)) {
              await membro.roles.remove(cargoVisitante);
            }
            marcadosCidadao++;
          } else {
            if (!membro.roles.cache.has(cargoVisitante.id)) {
              await membro.roles.add(cargoVisitante);
            }
            if (membro.roles.cache.has(cargoCidadao.id)) {
              await membro.roles.remove(cargoCidadao);
            }
            marcadosVisitante++;
          }
        } catch {
          falhas++;
        }

        // Pequena pausa para não bater no limite de pedidos do Discord
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      await avisoInicio.delete().catch(() => {});
      return responderEmbedTemporario(
        message,
        `✅ Classificação concluída.\n\n🏙️ **${NOME_CARGO_CIDADAO}**: ${marcadosCidadao}\n👤 **${NOME_CARGO_VISITANTE}**: ${marcadosVisitante}\n❌ Falhas: ${falhas}`
      );
    } catch (erro) {
      console.error(erro);
      await avisoInicio.delete().catch(() => {});
      return responderTemporario(message, "❌ Ocorreu um erro ao classificar os membros.");
    }
  }

  if (comando !== "addcargo" && comando !== "remcargo") return;

  // Apaga a mensagem do comando imediatamente (se o bot tiver permissão)
  message.delete().catch(() => {});

  // --------------------------------------------------------
  // Só quem tiver um cargo presente na HIERARQUIA_CARGOS pode
  // usar o comando. O dono do servidor está sempre isento.
  // --------------------------------------------------------
  const ehDonoServidor = message.guild.ownerId === message.author.id;
  const rankExecutor = obterRankAutorizado(message.member);

  if (!ehDonoServidor && rankExecutor === -1) {
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
  const mencaoBruta = message.mentions.members?.first();
  // Se a pessoa se mencionar a si própria, conta como auto-atribuição,
  // não como "dar cargo a outra pessoa".
  const mencaoUtilizador =
    mencaoBruta && mencaoBruta.id !== message.author.id ? mencaoBruta : null;
  const ehDono = message.guild.ownerId === message.author.id;

  if (mencaoUtilizador) {
    // ----------------------------------------------------
    // Hierarquia por HIERARQUIA_CARGOS: não podes executar o
    // comando sobre alguém cujo cargo esteja na mesma posição
    // ou acima da tua na lista (ex: posição 1 não pode agir
    // sobre alguém com o cargo da posição 0).
    // ----------------------------------------------------
    const rankAlvo = obterRankAutorizado(mencaoUtilizador);
    if (!ehDono && rankAlvo !== -1 && rankAlvo <= rankExecutor) {
      return responderTemporario(
        message,
        "❌ Não podes executar este comando sobre alguém com um cargo igual ou superior ao teu."
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
