import { useState } from 'react'

const TOPICOS = [
  {
    id: 'car',
    icon: '📋',
    titulo: 'O que é o CAR?',
    resumo: 'Cadastro Ambiental Rural — o registro obrigatório da sua terra.',
    conteudo: [
      {
        pergunta: 'O que é o CAR?',
        resposta: 'O CAR (Cadastro Ambiental Rural) é um registro eletrônico obrigatório para todos os imóveis rurais do Brasil. Você informa ao governo onde ficam as áreas de mata, rios, nascentes e o uso que faz da terra. É como uma identidade ambiental da sua propriedade.',
      },
      {
        pergunta: 'Por que é obrigatório?',
        resposta: 'A Lei 12.651/2012 (Código Florestal) exige que todo produtor rural cadastre seu imóvel no CAR. Sem o CAR regularizado, você pode perder acesso a crédito rural (Pronaf, Soja Plus), financiamentos e certidões ambientais.',
      },
      {
        pergunta: 'Quem precisa fazer?',
        resposta: 'Todo proprietário, posseiro ou arrendatário de imóvel rural, independentemente do tamanho. Pequenos agricultores familiares também têm essa obrigação, mas contam com regras mais flexíveis.',
      },
      {
        pergunta: 'O CAR não é o mesmo que georreferenciamento?',
        resposta: 'Não. O georreferenciamento (INCRA) é para regularização fundiária (titulação da terra). O CAR é ambiental — declara o que tem na terra em termos de vegetação, rios e uso. São sistemas diferentes, mas complementares.',
      },
    ],
  },
  {
    id: 'app',
    icon: '🌊',
    titulo: 'Área de Preservação Permanente (APP)',
    resumo: 'A faixa de mata que protege rios, nascentes e encostas.',
    conteudo: [
      {
        pergunta: 'O que é APP?',
        resposta: 'APP é a faixa de vegetação que deve ser mantida ao redor de rios, nascentes, lagos e em encostas íngremes. Ela protege a água que você bebe, controla cheias e evita erosão. É uma área protegida por lei — não pode ser desmatada nem usada para agricultura.',
      },
      {
        pergunta: 'Qual a largura mínima da APP?',
        resposta: 'Depende da largura do rio: rios com até 10m de largura → faixa de 30m em cada margem. Rios de 10 a 50m → faixa de 50m. Acima de 50m → faixas maiores. Nascentes (olhos d\'água) → 50m de raio ao redor.',
      },
      {
        pergunta: 'E se eu já usava a APP antes de 2008?',
        resposta: 'Se você já tinha agricultura na APP antes de 22 de julho de 2008, essa área é chamada de "consolidada". Pela lei, você precisa recompor menos do que o normal: para propriedades até 1 módulo fiscal → só 5m de faixa. Até 2 módulos → 8m. Até 4 módulos → 15m. Isso é o Art. 61-A do Código Florestal.',
      },
      {
        pergunta: 'O que acontece se não tiver APP declarada?',
        resposta: 'Sem APP declarada no CAR, o órgão ambiental pode exigir a regularização, embargar atividades produtivas na área e cobrar multa. A APP também vale para acesso a crédito — bancos verificam a situação antes de aprovar financiamentos.',
      },
    ],
  },
  {
    id: 'rl',
    icon: '🌳',
    titulo: 'Reserva Legal (RL)',
    resumo: 'A área de mata que toda propriedade precisa ter.',
    conteudo: [
      {
        pergunta: 'O que é Reserva Legal?',
        resposta: 'É a área de vegetação nativa que toda propriedade rural precisa manter ou recuperar. Diferente da APP (que fica em volta de rios), a RL pode ser localizada em qualquer parte da propriedade — você escolhe onde, com aprovação do órgão ambiental.',
      },
      {
        pergunta: 'Quanto de RL minha propriedade precisa ter?',
        resposta: 'Depende do bioma: Amazônia Legal → 80% da área total. Cerrado dentro da Amazônia Legal (norte de MT, por exemplo) → 35%. Cerrado fora da Amazônia Legal, Caatinga, Pantanal, Pampa → 20%. Uma propriedade de 100 ha no Cerrado de MT (Amazônia Legal) precisa de 35 ha de RL.',
      },
      {
        pergunta: 'Sou pequeno produtor — tenho que atingir esses percentuais?',
        resposta: 'Não necessariamente. Se sua propriedade tem até 4 módulos fiscais e você estava cadastrado no CAR até maio de 2014, a vegetação que existia na época do cadastro já é considerada sua Reserva Legal — sem precisar atingir o percentual mínimo do bioma. Isso é o Art. 67 do Código Florestal.',
      },
      {
        pergunta: 'Posso compensar a RL fora da minha propriedade?',
        resposta: 'Sim. Se você tem déficit de RL, pode compensar de três formas: recomposição (plantar na própria terra), regeneração natural (aguardar a mata crescer), ou compensação em outro imóvel no mesmo bioma e preferencialmente no mesmo município. Cotas de Reserva Ambiental (CRA) também são possíveis.',
      },
    ],
  },
  {
    id: 'consequencias',
    icon: '⚖️',
    titulo: 'O que acontece se não regularizar?',
    resumo: 'Riscos práticos de ter o CAR irregular.',
    conteudo: [
      {
        pergunta: 'Perco acesso a crédito rural?',
        resposta: 'Sim. Bancos públicos (Banco do Brasil, Caixa, BNB) são obrigados a exigir o CAR regular para liberar financiamentos do Pronaf, Pronamp e outros programas. Certificações de commodities como soja e carne também exigem CAR ativo.',
      },
      {
        pergunta: 'Posso receber multa?',
        resposta: 'Sim. A Lei de Crimes Ambientais prevê multas de R$ 500 a R$ 10.000 por hectare desmatado irregularmente, além de embargo das atividades na área irregular. O órgão estadual (SEMA em MT) pode fazer vistorias e autuar.',
      },
      {
        pergunta: 'Meu imóvel pode ser embargado?',
        resposta: 'Sim, parcialmente. Se houver desmatamento ilegal detectado por satélite (PRODES/DETER) dentro do seu CAR, o IBAMA pode embargar a área afetada — proibindo plantio, pastejo e qualquer uso produtivo até a regularização.',
      },
      {
        pergunta: 'E as certificações de produto?',
        resposta: 'Programas como Soja Plus (ABIOVE), Carne Sustentável e rastreabilidade bovina exigem CAR regular. Compradores internacionais, especialmente europeus, estão cada vez mais exigindo comprovação de conformidade ambiental na cadeia produtiva.',
      },
    ],
  },
  {
    id: 'pra',
    icon: '🔄',
    titulo: 'Como regularizar — PRA e caminhos práticos',
    resumo: 'Os caminhos para sair da irregularidade.',
    conteudo: [
      {
        pergunta: 'O que é o PRA?',
        resposta: 'O PRA (Programa de Regularização Ambiental) é o programa do Código Florestal que permite ao produtor assinar um compromisso de regularizar as áreas de APP e RL com prazo e condições especiais. Quem assina o PRA tem proteção contra autuações durante o período de regularização.',
      },
      {
        pergunta: 'Quem pode aderir ao PRA?',
        resposta: 'Produtores com déficit de APP ou RL em áreas consolidadas (usadas antes de jul/2008) que possuam CAR válido. Pequenas propriedades (até 4 MF) têm condições ainda mais vantajosas, com prazos maiores e exigências menores de recomposição.',
      },
      {
        pergunta: 'Qual o passo a passo para regularizar o CAR?',
        resposta: '1. Acesse o SICAR (car.gov.br) com seu CPF ou CNPJ. 2. Verifique as inconsistências apontadas na sua análise (este laudo). 3. Faça a retificação do polígono — corrija os limites de APP e RL. 4. Envie para análise do órgão estadual (SEMA-MT). 5. Após aprovação, seu CAR muda para "em conformidade".',
      },
      {
        pergunta: 'Preciso de engenheiro agrônomo?',
        resposta: 'Para imóveis acima de 4 módulos fiscais, sim — a retificação precisa de responsável técnico habilitado (CREA/CFA). Para pequenas propriedades familiares (até 4 MF), a SEMA oferece apoio técnico gratuito pelo programa CAR Social em alguns municípios.',
      },
    ],
  },
  {
    id: 'beneficios',
    icon: '💰',
    titulo: 'Benefícios de ter o CAR regularizado',
    resumo: 'O que você ganha com a conformidade ambiental.',
    conteudo: [
      {
        pergunta: 'Acesso a crédito rural com juros menores',
        resposta: 'Além de liberar o Pronaf e Pronamp, o CAR regular abre acesso a linhas de crédito verde com taxas subsidiadas: ABC+ (Agricultura de Baixo Carbono), BNDES Floresta, e fundos internacionais de sustentabilidade com juros mais baixos que as linhas convencionais.',
      },
      {
        pergunta: 'Mercado de carbono',
        resposta: 'Propriedades com vegetação nativa além do mínimo legal (excedente de RL) podem gerar Cotas de Reserva Ambiental (CRA) e vender no mercado de carbono. No Cerrado, cada hectare de floresta preservada pode gerar de 3 a 5 tCO₂e/ano, valendo R$ 50–150 por tonelada nos mercados voluntários.',
      },
      {
        pergunta: 'Seguro agrícola e certificações',
        resposta: 'O CAR regular é exigido para participar de programas de seguro agrícola subvencionado (Proagro) e para obter certificações de produto (Rainforest Alliance, Bonsucro, RTRS para soja). Essas certificações abrem mercados externos mais rentáveis.',
      },
      {
        pergunta: 'Valorização do imóvel',
        resposta: 'Propriedades com CAR regular e ambiência positiva (sem embargos, vegetação em dia) são melhor avaliadas por instituições financeiras para crédito e têm maior valor de mercado. Compradores institucionais de terra (fundos de investimento agrícola) exigem CAR limpo.',
      },
    ],
  },
]

export default function EscolaPanel({ onClose }) {
  const [topicoAberto, setTopicoAberto] = useState(null)
  const [pergAberta, setPergAberta] = useState({})

  function toggleTopico(id) {
    setTopicoAberto(t => t === id ? null : id)
    setPergAberta({})
  }

  function togglePerg(key) {
    setPergAberta(p => ({ ...p, [key]: !p[key] }))
  }

  return (
    <div className="escola-backdrop" onClick={onClose}>
      <div className="escola-panel" onClick={e => e.stopPropagation()}>

        <div className="escola-hd">
          <div className="escola-hd-left">
            <span className="escola-hd-icon">📚</span>
            <div>
              <div className="escola-hd-title">Escola do Produtor</div>
              <div className="escola-hd-sub">Entenda o CAR, o Código Florestal e seus direitos</div>
            </div>
          </div>
          <button className="escola-close" onClick={onClose}>×</button>
        </div>

        <div className="escola-intro">
          Conteúdo em linguagem simples para quem quer entender a lei sem precisar de advogado.
          Clique em um tema para começar.
        </div>

        <div className="escola-lista">
          {TOPICOS.map(t => (
            <div key={t.id} className={`escola-topico ${topicoAberto === t.id ? 'aberto' : ''}`}>
              <button className="escola-topico-hd" onClick={() => toggleTopico(t.id)}>
                <span className="escola-topico-icon">{t.icon}</span>
                <div className="escola-topico-info">
                  <div className="escola-topico-titulo">{t.titulo}</div>
                  <div className="escola-topico-resumo">{t.resumo}</div>
                </div>
                <span className="escola-chevron">{topicoAberto === t.id ? '▾' : '▸'}</span>
              </button>

              {topicoAberto === t.id && (
                <div className="escola-topico-body">
                  {t.conteudo.map((item, i) => {
                    const key = `${t.id}-${i}`
                    return (
                      <div key={key} className={`escola-faq ${pergAberta[key] ? 'aberto' : ''}`}>
                        <button className="escola-faq-hd" onClick={() => togglePerg(key)}>
                          <span className="escola-faq-q">{item.pergunta}</span>
                          <span className="escola-faq-arr">{pergAberta[key] ? '−' : '+'}</span>
                        </button>
                        {pergAberta[key] && (
                          <div className="escola-faq-body">{item.resposta}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="escola-footer">
          <span>💡 Este conteúdo é educativo. Para decisões jurídicas, consulte um advogado ou engenheiro ambiental.</span>
        </div>
      </div>
    </div>
  )
}
