# MeetFlow Empresarial

Plataforma empresarial para organizar reuniões, conversar com a equipe, administrar colaboradores e publicar status com foto ou vídeo por 24 horas.

## Recursos disponíveis

- cadastro profissional com empresa, cargo, foto opcional e aceite dos termos;
- confirmação e indicador de força da senha no cadastro;
- login individual com senha protegida, sessão JWT e opção de manter conectado;
- bloqueio temporário após tentativas repetidas de login;
- recuperação de senha por link seguro, individual e válido por 60 minutos;
- empresas isoladas por `organizationId`;
- perfis profissionais com foto, nome e cargo;
- configurações de perfil, empresa, senha, saída e exclusão de conta;
- convites de equipe por e-mail com link individual, expirável e de uso único;
- colaboradores com níveis `OWNER`, `ADMIN`, `MANAGER` e `MEMBER`;
- histórico administrativo de convites, alterações de acesso e desativações;
- agenda compartilhada e prevenção de conflitos de horário;
- confirmação, lembretes de 24 horas e 1 hora e aviso de cancelamento por e-mail para responsável e convidados;
- canais de chat com histórico persistente, respostas, edição e exclusão controlada;
- contadores de mensagens não lidas e central interna de notificações;
- atualização em tempo real opcional com Ably e sincronização periódica automática como fallback;
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

Depois, o proprietário ou administrador pode convidar colaboradores por e-mail. Cada pessoa abre o link individual, cria a própria senha e entra diretamente no workspace da empresa. Não existem senhas temporárias, usuários ou mensagens de demonstração.

## Documentação jurídica pública

Os links do cadastro abrem documentos públicos, responsivos e preparados para impressão:

- `/#document=terms` — Termos de Uso;
- `/#document=privacy` — Política de Privacidade.

Os documentos descrevem a fase atual do produto, os papéis da organização e do MeetFlow, dados tratados, finalidades, fornecedores, retenção, segurança, direitos dos titulares, incidentes, responsabilidades e limites de disponibilidade. O aceite grava a data e as versões vigentes (`2026.08`) no cadastro do usuário.

Esta documentação é uma base transparente para análise empresarial. Antes de contratação comercial, deve ser revisada por profissional jurídico e complementada com razão social, CNPJ, endereço, canal de suporte e privacidade, responsável ou encarregado, SLA e condições comerciais do fornecedor.

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

Para habilitar chat e notificações em tempo real, crie um aplicativo no plano gratuito da Ably e adicione somente no ambiente da Vercel:

```text
ABLY_API_KEY=nome-da-chave:segredo
```

A chave permanece no servidor. O navegador recebe um token temporário restrito aos canais da empresa autenticada. Sem essa variável, o MeetFlow continua funcional e atualiza as mensagens automaticamente a cada poucos segundos.

Para habilitar os avisos de reunião por e-mail, use uma conta Brevo e verifique o endereço remetente. O plano gratuito atende até 300 envios por dia. Adicione somente nas variáveis protegidas da Vercel:

```text
BREVO_API_KEY=chave-exclusiva-do-servidor
MEETFLOW_EMAIL_FROM=email-remetente-verificado
MEETFLOW_EMAIL_NAME=MeetFlow
MEETFLOW_PUBLIC_URL=https://seu-dominio.vercel.app
CRON_SECRET=outra-chave-aleatoria-longa
BREVO_SANDBOX=false
```

O responsável da reunião recebe os avisos automaticamente. Somente os colaboradores marcados e outros e-mails informados como convidados também recebem. A criação e o cancelamento da reunião continuam funcionando se o provedor de e-mail estiver temporariamente indisponível. A rotina diária da Vercel prepara o envio no horário exato usando o agendamento da Brevo.

A mesma configuração da Brevo envia a recuperação de senha. O link contém um token aleatório armazenado apenas como hash no banco, expira em 60 minutos, funciona uma única vez e invalida as sessões anteriores após a troca. `MEETFLOW_PUBLIC_URL` é opcional na Vercel, que detecta o domínio de produção automaticamente, mas pode ser definido quando houver um domínio próprio.

Durante a validação, mantenha `BREVO_SANDBOX=true`: a Brevo valida o pedido sem entregar mensagens reais. A chave nunca deve usar o prefixo `NEXT_PUBLIC_` nem ser salva no repositório.

### Publicação

1. importe o repositório na Vercel;
2. conecte o banco Neon ao projeto com o prefixo `MEETFLOW_DB`;
3. cadastre `MEETFLOW_JWT_SECRET` ou mantenha o `JWT_SECRET` já existente;
4. publique a branch `main`.

O arquivo `vercel.json` executa o build da interface e encaminha as rotas `/api/*` para a função `api/index.ts`. As tabelas são criadas automaticamente na primeira chamada à API.

Para confirmar o banco e a função:

```text
GET https://seu-dominio.vercel.app/api/health
```

Resposta esperada:

```json
{"status":"ok","database":"connected","authentication":"configured","realtime":"configured","email":"configured"}
```

## Rotas hospedadas

| Método e rota | Finalidade |
| --- | --- |
| `POST /api/auth/register` | Criar empresa e administrador |
| `POST /api/auth/login` | Entrar e receber JWT |
| `POST /api/auth/forgot-password` | Solicitar link seguro de recuperação |
| `POST /api/auth/reset-password` | Criar nova senha com token válido |
| `POST /api/auth/invitations/inspect` | Validar um convite sem expor o token na URL do servidor |
| `POST /api/auth/invitations/accept` | Aceitar convite e criar a própria senha |
| `GET /api/auth/me` | Consultar usuário atual |
| `PATCH /api/account/profile` | Atualizar perfil e empresa |
| `POST /api/account/avatar` | Atualizar foto do perfil |
| `PATCH /api/account/password` | Alterar senha |
| `DELETE /api/account` | Desativar a própria conta |
| `GET/POST /api/meetings` | Listar e criar reuniões |
| `PATCH /api/meetings/{id}/cancel` | Cancelar reunião |
| `GET /api/cron/email-reminders` | Preparar lembretes futuros (protegido por `CRON_SECRET`) |
| `GET/POST /api/chat/channels` | Listar e criar canais |
| `GET/POST /api/chat/channels/{id}/messages` | Histórico e envio de mensagens |
| `PATCH/DELETE /api/chat/channels/{id}/messages/{messageId}` | Editar ou excluir mensagem |
| `POST /api/chat/channels/{id}/read` | Marcar canal como lido |
| `GET /api/notifications` | Listar notificações internas |
| `POST /api/notifications/{id}/read` | Marcar notificação como lida |
| `POST /api/notifications/read-all` | Marcar todas como lidas |
| `GET /api/realtime/config` | Consultar disponibilidade do tempo real |
| `GET /api/realtime/token` | Emitir token temporário e restrito |
| `GET/POST /api/statuses` | Listar e publicar status |
| `DELETE /api/statuses/{id}` | Excluir status próprio |
| `GET/POST /api/team` | Listar equipe e enviar convite seguro |
| `PATCH /api/team/{id}/role` | Alterar nível de acesso |
| `POST /api/team/invitations/{id}/resend` | Invalidar o link anterior e reenviar convite |
| `DELETE /api/team/invitations/{id}` | Cancelar convite pendente |
| `DELETE /api/team/{id}` | Desativar colaborador |
| `GET /api/audit-logs` | Consultar histórico administrativo da empresa |
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
- o tempo real usa a cota do plano configurado na Ably e muda automaticamente para consultas periódicas quando indisponível;
- confirmações por AWS SES permanecem no backend Java e ainda não são enviadas pelas funções serverless;
- backups, monitoramento, e-mail transacional e armazenamento de objetos devem ser configurados antes da venda.

> O plano Hobby da Vercel é voltado a uso pessoal e não comercial. Esta estrutura sem cartão serve para desenvolver, testar e demonstrar o MeetFlow. Antes de vender ou atender clientes, migre para um plano e serviços que permitam uso comercial e ofereçam os níveis necessários de segurança, backup e disponibilidade.

## Próximas evoluções

1. integração com Google Calendar, Outlook, Meet, Teams e Zoom;
2. confirmação de presença e ciclo completo das reuniões;
3. reagendamento pelo convidado;
4. reações e respostas nos status;
5. armazenamento de objetos e miniaturas de vídeo;
6. testes de integração, backups e monitoramento de produção.
