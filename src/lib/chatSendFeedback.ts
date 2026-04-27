export interface SendFailureFeedback {
  title: string;
  description: string;
  shortReason: string;
}

function hasSignal(input: string, signals: RegExp[]) {
  return signals.some((signal) => signal.test(input));
}

export function getSendFailureFeedback(rawError?: string | null, deviceName?: string | null): SendFailureFeedback {
  const value = String(rawError || "").toLowerCase();
  const trimmedDeviceName = deviceName?.trim();
  const deviceLabel = trimmedDeviceName ? ` do dispositivo ${trimmedDeviceName}` : "";

  // WhatsApp/Meta anti-spam: o celular pode enviar, mas API/Web ficam bloqueados temporariamente.
  if (hasSignal(value, [/reachout_timelock/i, /bloqueou o envio.*via api/i, /via api at[eé]/i])) {
    const original = String(rawError || "").replace(/^Falha ao enviar:\s*/i, "").trim();
    const untilMatch = original.match(/até\s+([^\.]+)(?:\.|$)/i);
    return {
      title: "Envio bloqueado temporariamente",
      description: original || "O WhatsApp bloqueou temporariamente envios para esse contato via API. Peça para o contato enviar uma mensagem primeiro ou aguarde a liberação.",
      shortReason: untilMatch
        ? `WhatsApp bloqueou via API até ${untilMatch[1]}. Peça para o contato te chamar primeiro.`
        : "WhatsApp bloqueou temporariamente via API — peça para o contato te chamar primeiro.",
    };
  }

  if (hasSignal(value, [/new_chat_message_capping/i, /cota de novas conversas/i, /cota.*whatsapp.*esgotada/i])) {
    const original = String(rawError || "").replace(/^Falha ao enviar:\s*/i, "").trim();
    return {
      title: "Limite de novas conversas atingido",
      description: original || "O WhatsApp limitou o início de novas conversas por agora. Aguarde a renovação da cota ou fale com contatos que já responderam.",
      shortReason: "limite de novas conversas do WhatsApp atingido — aguarde a renovação.",
    };
  }

  // 1) WhatsApp desconectado / sessão caiu / token inválido
  if (hasSignal(value, [/whatsapp disconnected/i, /session disconnected/i, /not connected/i, /not authenticated/i, /unauthorized/i, /qr code/i, /logout/i, /\bdisconnected\b/i, /desconectad/i, /session.*closed/i, /invalid token/i, /token inv[aá]lid/i, /\b401\b/i, /token expired/i, /token expirad/i])) {
    return {
      title: "WhatsApp desconectado",
      description: `O WhatsApp${deviceLabel} perdeu a conexão. Vá em Dispositivos e reconecte o número escaneando o QR Code novamente.`,
      shortReason: trimmedDeviceName
        ? `WhatsApp do dispositivo ${trimmedDeviceName} desconectado — reconecte em Dispositivos.`
        : "WhatsApp desconectado — reconecte em Dispositivos.",
    };
  }

  // 2) Número sem WhatsApp
  if (hasSignal(value, [/not on whats/i, /not registered/i, /not_exists/i, /number does not exist/i, /sem whatsapp/i])) {
    return {
      title: "Número sem WhatsApp",
      description: "O número de destino não tem WhatsApp ativo. Confirme com o contato e atualize o número.",
      shortReason: "número sem WhatsApp ativo — confira o contato.",
    };
  }

  // 3) Bloqueio / contato bloqueou
  if (hasSignal(value, [/blocked/i, /forbidden/i, /\b403\b/i, /bloquead/i])) {
    return {
      title: "Envio bloqueado pelo contato",
      description: "O contato pode ter bloqueado seu número, ou o WhatsApp não permitiu o envio. Tente outro canal.",
      shortReason: "contato pode ter bloqueado — tente outro canal.",
    };
  }

  // 4) Destino não confirmado
  if (hasSignal(value, [/target mismatch/i, /destino divergente/i, /jid mismatch/i])) {
    return {
      title: "Destino não confirmado",
      description: "O sistema não conseguiu confirmar o número do destinatário. Recarregue a conversa e tente de novo.",
      shortReason: "destino não confirmado — recarregue a conversa.",
    };
  }

  // 5) Rate limit
  if (hasSignal(value, [/\b429\b/i, /too many requests/i, /rate limit/i, /limit exceeded/i, /muitas tentativas/i])) {
    return {
      title: "Muitas mensagens em pouco tempo",
      description: "Aguarde de 30 a 60 segundos antes de enviar novamente para evitar bloqueio do WhatsApp.",
      shortReason: "muitas mensagens em pouco tempo — aguarde 30s.",
    };
  }

  // 6) Número inválido
  if (hasSignal(value, [/número inválido/i, /numero invalido/i, /jid inválido/i, /jid invalido/i, /invalid number/i, /bad request/i, /\b400\b/i]) ) {
    return {
      title: "Número inválido",
      description: "O número informado está incompleto ou em formato errado. Use DDI + DDD + número (ex: 5519999999999).",
      shortReason: "número inválido — use DDI + DDD + número.",
    };
  }

  // 7) Mídia / arquivo
  if (hasSignal(value, [/media/i, /file too large/i, /unsupported/i, /upload/i, /storage/i, /arquivo/i])) {
    return {
      title: "Falha no envio da mídia",
      description: "O arquivo pode estar grande demais ou em formato não suportado. Tente reduzir o tamanho ou converter o formato.",
      shortReason: "falha na mídia — verifique tamanho e formato.",
    };
  }

  // 8) Sem créditos / plano
  if (hasSignal(value, [/no credits/i, /sem créditos/i, /sem creditos/i, /plan limit/i, /quota/i, /\b402\b/i])) {
    return {
      title: "Sem créditos disponíveis",
      description: "Seu plano não tem créditos suficientes para este envio. Acesse Meu Plano para fazer upgrade.",
      shortReason: "sem créditos — faça upgrade do plano.",
    };
  }

  // 9) Instabilidade de rede / serviço
  if (hasSignal(value, [/\b502\b/i, /\b503\b/i, /\b504\b/i, /timeout/i, /timed out/i, /failed to fetch/i, /network error/i, /socket/i, /bad gateway/i, /service unavailable/i, /econnreset/i, /enotfound/i])) {
    return {
      title: "Instabilidade na conexão",
      description: "A conexão com o WhatsApp falhou momentaneamente. Aguarde alguns segundos e toque em 'tentar novamente'.",
      shortReason: "conexão instável — toque em tentar novamente.",
    };
  }

  // 10) Servidor / 500
  if (hasSignal(value, [/\b500\b/i, /internal server/i, /erro interno/i])) {
    return {
      title: "Erro no servidor de envio",
      description: "Ocorreu um erro interno ao processar sua mensagem. Tente reenviar em alguns instantes.",
      shortReason: "erro interno — tente reenviar.",
    };
  }

  // Fallback: passa a mensagem original se for legível em PT, senão genérico
  const original = (rawError || "").trim();
  const looksHuman = original && original.length < 160 && !/^[\{\[\<]/.test(original) && !/error|exception|stack/i.test(original);

  return {
    title: "Mensagem não enviada",
    description: looksHuman
      ? `${original}. Tente reenviar tocando na mensagem.`
      : "Não foi possível concluir o envio agora. Verifique se o WhatsApp está conectado e tente novamente.",
    shortReason: looksHuman
      ? original
      : "verifique se o WhatsApp está conectado e tente novamente.",
  };
}
