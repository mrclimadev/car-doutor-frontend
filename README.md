# CAR Doutor — Frontend

Interface web para análise visual de imóveis rurais do **Cadastro Ambiental Rural (CAR)**. Construída com React + MapLibre GL.

---

## Pré-requisitos

| Ferramenta | Versão mínima |
|---|---|
| Node.js | 18+ |
| npm | 9+ |

---

## Instalação local

```bash
# 1. Clone o repositório
git clone https://github.com/mrclimadev/car-doutor-frontend.git
cd car-doutor-frontend

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
copy .env.example .env
# ou crie manualmente:
echo VITE_API_URL=http://localhost:8000 > .env
```

---

## Configuração (`.env`)

```env
# URL do backend (obrigatório)
VITE_API_URL=http://localhost:8000
```

Em produção, apontar para a URL do backend deployado:
```env
VITE_API_URL=https://api.seu-dominio.com
```

---

## Executar em desenvolvimento

```bash
npm run dev
```

Acesse: `http://localhost:5173`

> O backend precisa estar rodando em `http://localhost:8000`.  
> Ver: https://github.com/mrclimadev/car-doutor-backend

---

## Build para produção

```bash
npm run build
# Arquivos gerados em: dist/
```

Para testar o build localmente:
```bash
npm run preview
```

---

## Funcionalidades

- **Análise por código CAR** — busca o imóvel no SICAR e gera laudo completo
- **Análise por geometria** — desenhe um polígono no mapa para análise livre
- **Painel Analítico** — estatísticas do SICAR com visualização no mapa (arrastar, redimensionar)
- **Laudo de Conformidade** — visão do produtor rural e visão técnica (OEMA)
- **Dados do imóvel** — modal com todos os dados cadastrais do SICAR
- **Exportação PDF** — laudo completo em PDF formatado
- **Camadas WFS** — PRODES, DETER, Terra Indígena, Unidades de Conservação
- **Resumos por IA** — via Claude (Anthropic), com toggle para modo template
- **Histórico local** — últimas 15 análises salvas no navegador
- **Tema claro/escuro**

---

## Estrutura

```
src/
  App.jsx                    # Componente raiz — estado global, roteamento de modais
  styles.css                 # Design system completo (tokens CSS, todos os componentes)
  components/
    MapView.jsx              # Mapa MapLibre GL (análise, overlays WFS, painel de pontos)
    LaudoModal.jsx           # Modal de laudo (aba produtor + aba técnica + export PDF)
    DashboardPanel.jsx       # Painel analítico flutuante (arrastável, redimensionável)
    ImovelModal.jsx          # Modal de dados cadastrais brutos do SICAR
    LaudoPanel.jsx           # Componentes de seção do laudo
    PendenciaCard.jsx        # Card individual de pendência
    StatusBadge.jsx          # Badge de status (ok/atencao/critico)
```

---

## Dependências principais

| Pacote | Uso |
|---|---|
| `maplibre-gl` | Renderização do mapa |
| `react` / `react-dom` | UI |
| `jspdf` | Exportação de laudo em PDF |
| `vite` | Build tool |

---

## Repositórios relacionados

- **Backend:** https://github.com/mrclimadev/car-doutor-backend
- **Pipeline de dados:** https://github.com/mrclimadev/car-doutor-pipeline
