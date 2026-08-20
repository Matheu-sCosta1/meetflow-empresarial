# MeetFlow Empresarial

Plataforma empresarial para organizar reuniões, conversar com a equipe, administrar colaboradores e publicar status com foto ou vídeo por 24 horas.

## Recursos disponíveis

- cadastro de empresa e primeiro administrador;
- login individual com senha protegida e sessão JWT;
- empresas isoladas por `organizationId`;
- perfis profissionais com foto, nome e cargo;
- configurações de perfil, empresa, senha, saída e exclusão de conta;
- colaboradores com níveis `ADMIN` e `MEMBER`;
- agenda compartilhada e prevenção de conflitos de horário;
- canais de chat com histórico persistente;
- status de texto, foto ou vídeo com expiração em 24 horas;
- interface responsiva para desktop e celular;
- carrossel de status e painel empresarial sem dados de demonstração.

## Arquitetura

O repositório possui duas formas de execução:

| Ambiente | Interface | API | Banco |
| --- | --- | --- | --- |
| Nuvem | React + Vite na Vercel | Funções TypeScript na Vercel | PostgreSQL Neon |
| Local | React no Docker | Java 17 + Spring Boot | PostgreSQL no Docker |

A versão hospedada utiliza a mesma origem para a interface e a API (`/api`). Isso elimina a dependência do Render e não exige cartão para a validação inicial. O backend Java continua disponível para uma futura infraestrutura dedicada.

## Estrutura principal

```text
meetflow-empresarial/
├── api/                    # entrada das funções serverless da Vercel
├── vercel-api/             # autenticação, banco e regras da API hospedada
├── vercel/                 # entrada da interface estática na Vercel
├── app/                    # componentes e cliente compartilhados
├── backend/                # API Java/Spring Boot para execução local
├── compose.yaml            # web + Java + PostgreSQL locais
├── vercel.json             # build e funções da Vercel
└── .env.example            # exemplos sem credenciais reais
```

## Rodar localmente com Docker

Pré-requisito: Docker Desktop ou Docker Engine com o plugin Compose.

1. Crie a configuração local:

   ```bash
   cp .env.example .env
   ```

2. Inicie os serviços:

   ```bash
   docker compose up --build -d
   ```

3. Abra:

   - Interface: `http://localhost:3000`
   - API: `http://localhost:8080`
   - Swagger: `http://localhost:8080/swagger-ui.html`
   - Saúde da API: `http://localhost:8080/actuator/health`

O frontend local já chama o Spring Boot em `localhost:8080`, que grava no PostgreSQL do contêiner. Os dados permanecem nos volumes após reiniciar a máquina.

Para encerrar:

```bash
docker compose down
```

Para também apagar banco e mídias locais:

```bash
docker compose down --volumes
```

## Primeiro acesso

Abra a aplicação, selecione **Criar empresa** e informe nome, empresa, e-mail e senha. O sistema cria no PostgreSQL:

- a organização;
- o primeiro administrador;
- os horários-padrão de segunda a sexta;
- o canal `Geral`.

Depois, o administrador pode cadastrar colaboradores. Cada pessoa recebe uma conta própria e entra com o e-mail e a senha inicial. Não existem usuários ou mensagens de demonstração.

## Deploy gratuito na Vercel

### Variáveis necessárias

A integração Neon conectada ao projeto deve fornecer:

```text
MEETFLOW_DB_URL=postgresql://...
```

A API também reconhece os nomes `MEETFLOW_DB_DATABASE_URL` e `MEETFLOW_DB_POSTGRES_URL`, usados por algumas versões da integração.

Adicione também uma chave aleatória com pelo menos 32 caracteres, marcada para Production e Preview. A API aceita qualquer um destes nomes:

```text
MEETFLOW_JWT_SECRET=uma-chave-aleatoria-longa
# ou JWT_SECRET=uma-chave-aleatoria-longa
```

Nunca salve os valores reais no GitHub.

### Publicação

1. importe o repositório na Vercel;
2. conecte o banco Neon ao projeto com o prefixo `MEETFLOW_DB`;
3. cadastre `MEETFLOW_JWT_SECRET` ou mantenha o `JWT_SECRET` já existente;
4. publique a branch `main`.

O arquivo `vercel.json` executa o build da interface e publica a função `api/[...path].ts`. As tabelas são criadas automaticamente na primeira chamada à API.

Para confirmar o banco e a função:

```text
GET https://seu-dominio.vercel.app/api/health
```

Resposta esperada:

```json
{"status":"ok","database":"connected"}
```

## Rotas hospedadas

| Método e rota | Finalidade |
| --- | --- |
| `POST /api/auth/register` | Criar empresa e administrador |
| `POST /api/auth/login` | Entrar e receber JWT |
| `GET /api/auth/me` | Consultar usuário atual |
| `PATCH /api/account/profile` | Atualizar perfil e empresa |
| `POST /api/account/avatar` | Atualizar foto do perfil |
| `PATCH /api/account/password` | Alterar senha |
| `DELETE /api/account` | Desativar a própria conta |
| `GET/POST /api/meetings` | Listar e criar reuniões |
| `PATCH /api/meetings/{id}/cancel` | Cancelar reunião |
| `GET/POST /api/chat/channels` | Listar e criar canais |
| `GET/POST /api/chat/channels/{id}/messages` | Histórico e envio de mensagens |
| `GET/POST /api/statuses` | Listar e publicar status |
| `DELETE /api/statuses/{id}` | Excluir status próprio |
| `GET/POST /api/team` | Listar e cadastrar colaboradores |
| `DELETE /api/team/{id}` | Desativar colaborador |
| `GET /api/public/media/{id}` | Exibir mídia ativa por identificador seguro |

Todas as rotas privadas validam o JWT e limitam consultas à empresa do usuário autenticado.

## Fotos e vídeos

Na hospedagem gratuita, imagens, vídeos e avatares ficam no PostgreSQL Neon. Cada arquivo é limitado a 3,5 MB para respeitar os limites das funções serverless. São aceitos:

- JPG, PNG e WebP;
- MP4, MOV e WebM.

Para operação comercial, migre as mídias para armazenamento de objetos, como Amazon S3, Cloudflare R2 ou Vercel Blob.

## Desenvolvimento e qualidade

Validações do frontend e da API serverless:

```bash
npm ci
npm run lint
npm run typecheck:vercel
npm run build:vercel
```

Testes do backend Java:

```bash
mvn --batch-mode --file backend/pom.xml test
```

O workflow em `.github/workflows/ci.yml` executa essas verificações em pushes para `main` e pull requests.

## Limites do plano gratuito

- o Neon gratuito possui limites de armazenamento e computação;
- arquivos ficam limitados a 3,5 MB nesta implantação;
- o chat consulta mensagens periodicamente; WebSocket/STOMP permanece no backend Java;
- confirmações por AWS SES permanecem no backend Java e ainda não são enviadas pelas funções serverless;
- backups, monitoramento, e-mail transacional e armazenamento de objetos devem ser configurados antes da venda.

> O plano Hobby da Vercel é voltado a uso pessoal e não comercial. Esta estrutura sem cartão serve para desenvolver, testar e demonstrar o MeetFlow. Antes de vender ou atender clientes, migre para um plano e serviços que permitam uso comercial e ofereçam os níveis necessários de segurança, backup e disponibilidade.

## Próximas evoluções

1. convites e lembretes por e-mail;
2. integração com Google Calendar, Outlook, Meet, Teams e Zoom;
3. notificações internas e confirmação de presença;
4. reagendamento pelo convidado;
5. reações e respostas nos status;
6. armazenamento de objetos e miniaturas de vídeo;
7. testes de integração e monitoramento de produção.
