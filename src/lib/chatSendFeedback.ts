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

  if (hasSignal(value, [/whatsapp disconnected/i, /session disconnected/i, /not connected/i, /not authenticated/i, /unauthorized/i, /qr code/i, /logout/i, /\bdisconnected\b/i])) {
    return {
      title: "WhatsApp desconectado",
      description: `Não foi possível enviar porque o WhatsApp${deviceLabel} está desconectado. Reconecte o número e tente novamente.`,
      shortReason: trimmedDeviceName
        ? `o WhatsApp do dispositivo ${trimmedDeviceName} está desconectado.`
        : "o WhatsApp usado nesta conversa está desconectado.",
    };
  }

  if (hasSignal(value, [/not on whats/i, /not registered/i, /not_exists/i, /number does not exist/i])) {
    return {
      title: "Número sem WhatsApp",
      description: "Não foi possível enviar porque o número de destino não tem WhatsApp ativo ou está inválido.",
      shortReason: "o número de destino não tem WhatsApp ativo ou está inválido.",
    };
  }

  if (hasSignal(value, [/target mismatch/i, /destino divergente/i, /jid mismatch/i])) {
    return {
      title: "Destino não confirmado",
      description: "Não foi possível enviar porque o sistema não conseguiu confirmar o número de destino com segurança.",
      shortReason: "o número de destino não pôde ser confirmado com segurança.",
    };
  }

  if (hasSignal(value, [/\b429\b/i, /too many requests/i, /rate limit/i, /limit exceeded/i])) {
    return {
      title: "Envio temporariamente bloqueado",
      description: "Não foi possível enviar porque houve muitas tentativas em pouco tempo. Aguarde alguns segundos e tente novamente.",
      shortReason: "houve muitas tentativas em pouco tempo.",
    };
  }

  if (hasSignal(value, [/número inválido/i, /numero invalido/i, /jid inválido/i, /jid invalido/i, /invalid number/i, /bad request/i])) {
    return {
      title: "Número inválido",
      description: "Não foi possível enviar porque o número informado parece inválido ou incompleto.",
      shortReason: "o número informado parece inválido ou incompleto.",
    };
  }

  if (hasSignal(value, [/\b502\b/i, /\b503\b/i, /\b504\b/i, /timeout/i, /timed out/i, /failed to fetch/i, /network error/i, /socket/i, /bad gateway/i, /service unavailable/i, /econnreset/i])) {
    return {
      title: "Instabilidade no envio",
      description: "Não foi possível enviar porque a conexão com o serviço de WhatsApp ficou instável. Tente novamente em alguns instantes.",
      shortReason: "a conexão com o serviço de WhatsApp ficou instável.",
    };
  }

  return {
    title: "Mensagem não enviada",
    description: "Não foi possível concluir o envio agora. Tente novamente em alguns instantes.",
    shortReason: "não foi possível concluir o envio agora.",
  };
}