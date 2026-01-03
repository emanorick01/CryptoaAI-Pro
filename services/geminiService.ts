
import { GoogleGenAI, Type } from "@google/genai";
import { MarketData, AIAnalysisResponse, Trade, PerformanceStats } from "../types";

export const getTradingSignal = async (
  pair: string,
  marketData: MarketData,
  strategy: string,
  timeframe: string,
  performanceContext: PerformanceStats,
  recentHistory: Trade[],
  learningMode: boolean
): Promise<AIAnalysisResponse> => {
  
  // Fix: Move GoogleGenAI instance creation inside the function to ensure it always uses the most up-to-date API key
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const historySummary = recentHistory.map(t => 
    `- [${t.accountType}] ${t.pair} ${t.side}: ROI ${t.pnlPercentage?.toFixed(2)}% via ${t.strategy}`
  ).join('\n');

  const learningInstruction = learningMode ? `
    ### MÓDULO DE APRENDIZADO REFORÇADO (RL) ATIVO ###
    Analise criteriosamente os erros e acertos do histórico recente para evitar reincidência em padrões perdedores:
    ${historySummary || 'Início de ciclo: Coletando dados base.'}
    
    FOCO DE OTIMIZAÇÃO:
    1. Ajuste a sensibilidade do RSI se os últimos trades de "reversão" falharam.
    2. Valide se a MA 200 está servindo como suporte/resistência institucional intransponível.
    3. Analise se a abertura das Bandas de Bollinger precedeu breakouts falsos.
  ` : "Modo padrão: Execute análise puramente técnica.";

  const prompt = `
    VOCÊ É UM ANALISTA QUANTITATIVO DE ELITE ESPECIALIZADO EM CRIPTOATIVOS.
    Sua tarefa é analisar o par ${pair} no timeframe ${timeframe} para uma estratégia de ${strategy}.

    CONTEXTO DE MERCADO ATUAL:
    - Preço Atual: $${marketData.price}
    - Médias Móveis: MA21($${marketData.ma21.toFixed(2)}), MA55($${marketData.ma55.toFixed(2)}), MA200($${marketData.ma200.toFixed(2)})
    - Alinhamento de Médias: ${marketData.ma21 > marketData.ma55 && marketData.ma55 > marketData.ma200 ? 'BULLISH PERFECT ALIGNMENT' : 'MIXED TREND'}
    - RSI (14): ${marketData.rsi.toFixed(2)} (${marketData.rsi > 70 ? 'SOBRECOMPRADO' : marketData.rsi < 30 ? 'SOBREVENDIDO' : 'NEUTRO'})
    - MACD: Valor ${marketData.macd.value.toFixed(4)} | Sinal ${marketData.macd.signal.toFixed(4)} | Histograma ${marketData.macd.histogram.toFixed(4)}
    - Bandas de Bollinger: Superior $${marketData.bollinger.upper.toFixed(2)} | Inferior $${marketData.bollinger.lower.toFixed(2)}
    - Estrutura: Suporte $${marketData.support.toFixed(2)} | Resistência $${marketData.resistance.toFixed(2)}
    - Tendência: LTA: ${marketData.lta ? 'ATIVA' : 'ROMPIDA'} | LTB: ${marketData.ltb ? 'PRESENTE' : 'AUSENTE'}
    - Volatilidade: ${marketData.volatility.toFixed(2)}%

    ${learningInstruction}

    REGRAS DE EXECUÇÃO:
    - BUY/LONG: Permitido apenas se RSI não estiver em sobrecompra extrema e MACD confirmar reversão ou força.
    - SELL/SHORT: Permitido se houver rejeição em resistência ou MA200 e perda de LTA.
    - STOP LOSS: Deve ser posicionado abaixo do suporte recente ou MA mais próxima.
    - TAKE PROFIT: Alvo na próxima resistência ou expansão de Bollinger.

    RETORNE APENAS JSON:
    {
      "signal": "BUY" | "SELL" | "HOLD",
      "reasoning": "Explicação concisa citando MAs e Bollinger",
      "confidence": 0-100,
      "targetPrice": número,
      "stopLoss": número,
      "technicalDetails": {
        "rsiStatus": "string",
        "maAlignment": "string",
        "trendType": "string"
      }
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            signal: { type: Type.STRING, enum: ['BUY', 'SELL', 'HOLD'] },
            reasoning: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            targetPrice: { type: Type.NUMBER },
            stopLoss: { type: Type.NUMBER },
            technicalDetails: {
              type: Type.OBJECT,
              properties: {
                rsiStatus: { type: Type.STRING },
                maAlignment: { type: Type.STRING },
                trendType: { type: Type.STRING }
              }
            }
          },
          required: ['signal', 'reasoning', 'confidence', 'targetPrice', 'stopLoss']
        }
      }
    });

    // Fix: Using the .text property (not a method) to extract output
    return JSON.parse(response.text || '{}') as AIAnalysisResponse;
  } catch (error) {
    console.error("Neural Layer Error:", error);
    return {
      signal: 'HOLD',
      reasoning: 'Instabilidade na rede neural. Aguardando sincronização de indicadores.',
      confidence: 0,
      targetPrice: 0,
      stopLoss: 0
    };
  }
};
